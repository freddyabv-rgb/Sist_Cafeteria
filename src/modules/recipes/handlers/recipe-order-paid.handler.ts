import { Injectable, Inject, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { RecipesService } from '../services/recipes.service';
import { IngredientStockPort, IngredientDeductionInput } from '@modules/purchasing/api/ingredient-stock.port';

interface OrderPaidPayload {
  orderId: string;
  orderNumber: string;
  orderType: string; // 'TAKEAWAY' | 'DINE_IN'
  items: Array<{
    orderItemId: string;
    variantId?: string;
    productVariantId?: string;
    productName: string;
    variantName: string;
    station: string;
    trackingMode?: string;
    quantity: number;
    modifiers?: Array<{
      modifierOptionId?: string;
      id?: string;
      quantity?: number;
    }>;
  }>;
}

@Injectable()
export class RecipeOrderPaidHandler implements DomainEventHandler<DomainEvent<OrderPaidPayload>> {
  public readonly handlerName = 'recipe-order-paid-handler';
  private readonly logger = new Logger(RecipeOrderPaidHandler.name);

  constructor(
    private readonly recipesService: RecipesService,
    @Inject('INGREDIENT_STOCK_PORT')
    private readonly ingredientStockPort: IngredientStockPort,
  ) {}

  public async handle(event: DomainEvent<OrderPaidPayload>): Promise<void> {
    const payload = event.payload;

    // Filtrar productos con tracking_mode === 'BY_RECIPE' o elaborados en estación BARRA
    // Excluyendo ítems con control unitario de vitrina (BY_UNIT)
    const recipeItems = payload.items.filter(
      (item) => item.trackingMode === 'BY_RECIPE' || (item.station === 'BARRA' && item.trackingMode !== 'BY_UNIT'),
    );
    if (recipeItems.length === 0) {
      return; // Cero ítems dosificados por receta en la comanda
    }

    const aggregatedDeductions = new Map<string, number>();

    for (const item of recipeItems) {
      const variantId = item.variantId || item.productVariantId;
      if (!variantId) continue;

      const normalizedModifiers = (item.modifiers || []).map((m) => ({
        modifierOptionId: m.modifierOptionId || m.id || '',
        quantity: m.quantity || 1,
      }));

      const deductions = await this.recipesService.resolveOrderItemDeductions(
        event.storeId,
        {
          productVariantId: variantId,
          quantity: item.quantity,
          modifiers: normalizedModifiers,
        },
        payload.orderType,
      );

      for (const d of deductions) {
        const current = aggregatedDeductions.get(d.ingredientId) || 0;
        aggregatedDeductions.set(d.ingredientId, current + d.quantityUnits);
      }
    }

    if (aggregatedDeductions.size === 0) {
      return;
    }

    const finalDeductions: IngredientDeductionInput[] = [];
    for (const [ingredientId, quantityUnits] of aggregatedDeductions.entries()) {
      finalDeductions.push({ ingredientId, quantityUnits });
    }

    // Ejecutar deducción en el módulo de compras/inventario mediante el puerto desacoplado
    await this.ingredientStockPort.deductRecipeIngredients(
      event.storeId,
      finalDeductions,
      payload.orderId,
      payload.orderNumber,
    );

    this.logger.log(
      `[RECETA OUTBOX] Orden #${payload.orderNumber}: Deducidos ${finalDeductions.length} insumos de barra en Kardex (${payload.orderType}).`,
    );
  }
}
