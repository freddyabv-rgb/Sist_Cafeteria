import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IRecipeRepository } from '../infra/recipe.repository.interface';
import { Recipe } from '../domain/recipe.entity';
import { ModifierRecipeImpact } from '../domain/modifier-impact.entity';
import { PackagingRule } from '../domain/packaging-rule.entity';
import {
  CreateRecipeDto,
  ConfigureModifierImpactDto,
  ConfigurePackagingRuleDto,
  TheoreticalCostDto,
  TheoreticalCostBreakdownItem,
} from '../api/recipes.dto';
import { IngredientDeductionInput } from '@modules/purchasing/api/ingredient-stock.port';

export interface OrderItemForRecipeResolution {
  productVariantId: string;
  quantity: number;
  modifiers?: Array<{
    modifierOptionId: string;
    quantity: number;
  }>;
}

@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);

  constructor(
    @Inject('RECIPE_REPOSITORY')
    private readonly recipeRepo: IRecipeRepository,
  ) {}

  /**
   * Crea o actualiza una receta base para una variante de producto.
   */
  public async createRecipe(dto: CreateRecipeDto): Promise<Recipe> {
    const existing = await this.recipeRepo.findRecipeByVariantId(dto.storeId, dto.productVariantId);

    const recipe = new Recipe({
      id: existing ? existing.id : uuidv4(),
      storeId: dto.storeId,
      productVariantId: dto.productVariantId,
      recipeName: dto.recipeName,
      yieldQuantity: dto.yieldQuantity ?? 1,
      ingredients: dto.ingredients.map((i) => ({
        ingredientId: i.ingredientId,
        ingredientName: i.ingredientName,
        quantity: i.quantity,
        unit: i.unit,
        isSubstitutable: i.isSubstitutable ?? false,
        substitutableGroup: i.substitutableGroup,
      })),
      isActive: true,
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date(),
    });

    await this.recipeRepo.saveRecipe(recipe);
    this.logger.log(`[RECETA] Guardada receta "${recipe.recipeName}" para variante ${recipe.productVariantId}`);
    return recipe;
  }

  /**
   * Configura el impacto de una opción de modificador sobre los insumos de la receta.
   */
  public async configureModifierImpact(dto: ConfigureModifierImpactDto): Promise<ModifierRecipeImpact> {
    const impact = new ModifierRecipeImpact({
      id: uuidv4(),
      storeId: dto.storeId,
      modifierOptionId: dto.modifierOptionId,
      optionName: dto.optionName,
      action: dto.action,
      targetIngredientId: dto.targetIngredientId,
      targetIngredientName: dto.targetIngredientName,
      targetSubstitutableGroup: dto.targetSubstitutableGroup,
      quantityDelta: dto.quantityDelta ?? 0,
      unit: dto.unit,
    });

    await this.recipeRepo.saveModifierImpact(impact);
    this.logger.log(`[MODIFICADOR RECETA] Configurado impacto para "${impact.optionName}" (${impact.action})`);
    return impact;
  }

  /**
   * Configura las reglas de empaque descartable (vasos, tapas) para pedidos TAKEAWAY.
   */
  public async configurePackagingRule(dto: ConfigurePackagingRuleDto): Promise<PackagingRule> {
    const rule = new PackagingRule({
      id: uuidv4(),
      storeId: dto.storeId,
      productVariantId: dto.productVariantId,
      items: dto.items,
      isActive: true,
    });

    await this.recipeRepo.savePackagingRule(rule);
    this.logger.log(`[EMPAQUE] Configurada regla de empaque para variante ${dto.productVariantId}`);
    return rule;
  }

  /**
   * Calcula el costo teórico por taza a partir de los costos unitarios actuales de insumos.
   */
  public async calculateTheoreticalCost(
    storeId: string,
    productVariantId: string,
    ingredientCosts: Map<string, number>, // ingredientId -> costo unitario decimal
  ): Promise<TheoreticalCostDto> {
    const recipe = await this.recipeRepo.findRecipeByVariantId(storeId, productVariantId);
    if (!recipe) {
      throw new NotFoundException(`No existe receta registrada para la variante "${productVariantId}".`);
    }

    let totalCost = 0;
    const breakdown: TheoreticalCostBreakdownItem[] = [];

    for (const item of recipe.ingredients) {
      const unitCost = ingredientCosts.get(item.ingredientId) ?? 0;
      const subtotalCost = Number((item.quantity * unitCost).toFixed(4));
      totalCost += subtotalCost;

      breakdown.push({
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        unitCostDec: unitCost,
        subtotalCost,
      });
    }

    return {
      productVariantId,
      recipeName: recipe.recipeName,
      totalCost: Number(totalCost.toFixed(4)),
      breakdown,
    };
  }

  /**
   * Resuelve el consumo exacto de insumos de un ítem de la comanda,
   * aplicando sustituciones de leche, adiciones de café/jarabes y empaques descartables.
   */
  public async resolveOrderItemDeductions(
    storeId: string,
    item: OrderItemForRecipeResolution,
    orderType: string, // 'TAKEAWAY' | 'DINE_IN'
  ): Promise<IngredientDeductionInput[]> {
    const recipe = await this.recipeRepo.findRecipeByVariantId(storeId, item.productVariantId);
    if (!recipe) {
      // Si la variante no tiene receta configurada (ej. producto de vitrina o regalo), no deduce
      return [];
    }

    // Mapa de trabajo: ingredientId -> cantidad por porción
    interface WorkingIngredient {
      ingredientId: string;
      quantity: number;
      isSubstitutable: boolean;
      substitutableGroup?: string;
    }

    const workingMap = new Map<string, WorkingIngredient>();

    for (const ing of recipe.ingredients) {
      workingMap.set(ing.ingredientId, {
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
        isSubstitutable: ing.isSubstitutable,
        substitutableGroup: ing.substitutableGroup,
      });
    }

    // 1. Aplicar modificadores
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        const impact = await this.recipeRepo.findModifierImpactByOptionId(storeId, mod.modifierOptionId);
        if (!impact) continue;

        if (impact.action === 'SUBSTITUTE' && impact.targetSubstitutableGroup) {
          // Buscar qué insumo del grupo base reemplazar
          for (const [ingId, entry] of workingMap.entries()) {
            if (entry.isSubstitutable && entry.substitutableGroup === impact.targetSubstitutableGroup) {
              const baseQuantity = entry.quantity;
              workingMap.delete(ingId); // Quitar ingrediente base (ej. leche entera)
              // Agregar ingrediente sustituto con el mismo volumen base
              workingMap.set(impact.targetIngredientId, {
                ingredientId: impact.targetIngredientId,
                quantity: baseQuantity,
                isSubstitutable: false,
              });
              break;
            }
          }
        } else if (impact.action === 'ADD') {
          const delta = impact.quantityDelta * (mod.quantity || 1);
          const current = workingMap.get(impact.targetIngredientId);
          if (current) {
            current.quantity += delta;
          } else {
            workingMap.set(impact.targetIngredientId, {
              ingredientId: impact.targetIngredientId,
              quantity: delta,
              isSubstitutable: false,
            });
          }
        } else if (impact.action === 'REMOVE') {
          workingMap.delete(impact.targetIngredientId);
        }
      }
    }

    // 2. Aplicar empaque descartable si es para llevar (TAKEAWAY)
    if (orderType === 'TAKEAWAY') {
      const packagingRule = await this.recipeRepo.findPackagingRuleByVariantId(storeId, item.productVariantId);
      if (packagingRule && packagingRule.isActive) {
        for (const pkg of packagingRule.items) {
          const current = workingMap.get(pkg.ingredientId);
          if (current) {
            current.quantity += pkg.quantity;
          } else {
            workingMap.set(pkg.ingredientId, {
              ingredientId: pkg.ingredientId,
              quantity: pkg.quantity,
              isSubstitutable: false,
            });
          }
        }
      }
    }

    // 3. Multiplicar por la cantidad de unidades vendidas del ítem
    const results: IngredientDeductionInput[] = [];
    for (const entry of workingMap.values()) {
      results.push({
        ingredientId: entry.ingredientId,
        quantityUnits: Number((entry.quantity * item.quantity).toFixed(2)),
      });
    }

    return results;
  }
}
