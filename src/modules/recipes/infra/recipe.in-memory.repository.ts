import { IRecipeRepository } from './recipe.repository.interface';
import { Recipe } from '../domain/recipe.entity';
import { ModifierRecipeImpact } from '../domain/modifier-impact.entity';
import { PackagingRule } from '../domain/packaging-rule.entity';

export class InMemoryRecipeRepository implements IRecipeRepository {
  private recipes = new Map<string, Recipe>(); // key: `${storeId}:${productVariantId}`
  private modifierImpacts = new Map<string, ModifierRecipeImpact>(); // key: `${storeId}:${modifierOptionId}`
  private packagingRules = new Map<string, PackagingRule>(); // key: `${storeId}:${productVariantId}`

  // Recetas
  public async saveRecipe(recipe: Recipe): Promise<void> {
    const key = `${recipe.storeId}:${recipe.productVariantId}`;
    this.recipes.set(key, recipe);
  }

  public async findRecipeByVariantId(storeId: string, productVariantId: string): Promise<Recipe | null> {
    const key = `${storeId}:${productVariantId}`;
    return this.recipes.get(key) || null;
  }

  public async findAllRecipes(storeId: string): Promise<Recipe[]> {
    return Array.from(this.recipes.values()).filter((r) => r.storeId === storeId);
  }

  // Modificadores
  public async saveModifierImpact(impact: ModifierRecipeImpact): Promise<void> {
    const key = `${impact.storeId}:${impact.modifierOptionId}`;
    this.modifierImpacts.set(key, impact);
  }

  public async findModifierImpactByOptionId(
    storeId: string,
    modifierOptionId: string,
  ): Promise<ModifierRecipeImpact | null> {
    const key = `${storeId}:${modifierOptionId}`;
    return this.modifierImpacts.get(key) || null;
  }

  public async findAllModifierImpacts(storeId: string): Promise<ModifierRecipeImpact[]> {
    return Array.from(this.modifierImpacts.values()).filter((m) => m.storeId === storeId);
  }

  // Empaque
  public async savePackagingRule(rule: PackagingRule): Promise<void> {
    const key = `${rule.storeId}:${rule.productVariantId}`;
    this.packagingRules.set(key, rule);
  }

  public async findPackagingRuleByVariantId(storeId: string, productVariantId: string): Promise<PackagingRule | null> {
    const key = `${storeId}:${productVariantId}`;
    return this.packagingRules.get(key) || null;
  }

  public async findAllPackagingRules(storeId: string): Promise<PackagingRule[]> {
    return Array.from(this.packagingRules.values()).filter((p) => p.storeId === storeId);
  }

  public clear(): void {
    this.recipes.clear();
    this.modifierImpacts.clear();
    this.packagingRules.clear();
  }
}
