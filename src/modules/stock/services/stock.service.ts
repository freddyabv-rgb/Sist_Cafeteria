import { Injectable, Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { IStockRepository } from '../infra/stock.repository.interface';
import { ShowcaseStockItem } from '../domain/showcase-stock-item.entity';
import { StockMovement } from '../domain/stock-movement.entity';

export interface InitializeStockInput {
  storeId: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  initialStock: number;
  minStockAlert?: number;
  allowNegative?: boolean;
  unitCostDecimal?: number;
}

export interface StockDeductionResult {
  variantId: string;
  productName: string;
  quantityDeducted: number;
  remainingStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @Inject('STOCK_REPOSITORY')
    private readonly stockRepo: IStockRepository,
  ) {}

  /**
   * Inicializa o actualiza el registro de inventario de un producto de vitrina.
   */
  public async initializeStockItem(input: InitializeStockInput): Promise<ShowcaseStockItem> {
    const item = new ShowcaseStockItem({
      id: uuidv4(),
      storeId: input.storeId,
      productId: input.productId,
      productVariantId: input.productVariantId,
      productName: input.productName,
      variantName: input.variantName,
      currentStock: input.initialStock,
      minStockAlert: input.minStockAlert ?? 5,
      allowNegative: input.allowNegative ?? true, // Por política: nunca frenar ventas en cola
      unitCost: Money.fromDecimal(input.unitCostDecimal ?? 0.0, 'PEN'),
      lastUpdated: new Date(),
    });

    await this.stockRepo.saveStockItem(item);

    // Movimiento inicial de apertura
    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId: input.storeId,
      type: 'INITIAL_COUNT',
      quantityChange: input.initialStock,
      stockBefore: 0,
      stockAfter: input.initialStock,
      reason: 'Conteo inicial de apertura de vitrina',
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);
    this.logger.log(
      `Stock de vitrina inicializado para "${input.productName}" [${input.variantName}]: ${input.initialStock} unidades`,
    );
    return item;
  }

  /**
   * Descuenta stock tras una venta confirmada.
   */
  public async deductForSale(
    storeId: string,
    productVariantId: string,
    quantity: number,
    orderId: string,
  ): Promise<StockDeductionResult | null> {
    const item = await this.stockRepo.findStockItem(storeId, productVariantId);
    if (!item) {
      return null; // Ítem no controlado por unidad de vitrina (ej. bebida por receta de taza)
    }

    const stockBefore = item.currentStock;
    item.deduct(quantity);
    const stockAfter = item.currentStock;

    await this.stockRepo.saveStockItem(item);

    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId,
      type: 'SALE_DEDUCTION',
      quantityChange: -quantity,
      stockBefore,
      stockAfter,
      reason: 'Venta en mostrador',
      referenceId: orderId,
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);

    if (item.isOutOfStock()) {
      this.logger.warn(`[STOCK AGOTADO] "${item.productName}" ha quedado en 0 unidades en vitrina.`);
    } else if (item.isLowStock()) {
      this.logger.warn(
        `[ALERTA DE MÍNIMO] "${item.productName}" tiene stock crítico: ${item.currentStock} unidades restantes.`,
      );
    }

    return {
      variantId: productVariantId,
      productName: item.productName,
      quantityDeducted: quantity,
      remainingStock: stockAfter,
      isLowStock: item.isLowStock(),
      isOutOfStock: item.isOutOfStock(),
    };
  }

  /**
   * Restaura el stock ante una anulación de orden o devolución de ítem.
   */
  public async reverseForVoid(
    storeId: string,
    productVariantId: string,
    quantity: number,
    orderId: string,
    reason: string,
  ): Promise<ShowcaseStockItem | null> {
    const item = await this.stockRepo.findStockItem(storeId, productVariantId);
    if (!item) return null;

    const stockBefore = item.currentStock;
    item.replenish(quantity);
    const stockAfter = item.currentStock;

    await this.stockRepo.saveStockItem(item);

    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId,
      type: 'VOID_REVERSAL',
      quantityChange: quantity,
      stockBefore,
      stockAfter,
      reason: `Reversión por anulación/devolución: ${reason}`,
      referenceId: orderId,
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);
    this.logger.log(`Stock restaurado para "${item.productName}": +${quantity} unidades`);
    return item;
  }

  /**
   * Reposición de stock por horneado matutino o recepción de lote.
   */
  public async replenishStock(
    storeId: string,
    productVariantId: string,
    quantity: number,
    reason: string,
  ): Promise<ShowcaseStockItem> {
    const item = await this.stockRepo.findStockItem(storeId, productVariantId);
    if (!item) {
      throw new Error(`Ítem de stock ${productVariantId} no encontrado para reposición.`);
    }

    const stockBefore = item.currentStock;
    item.replenish(quantity);
    const stockAfter = item.currentStock;

    await this.stockRepo.saveStockItem(item);

    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId,
      type: 'RESTOCK',
      quantityChange: quantity,
      stockBefore,
      stockAfter,
      reason,
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);
    return item;
  }

  /**
   * Ingresa un lote terminado de producción/horneado a la vitrina, actualizando stock y costo unitario.
   */
  public async receiveProductionBatch(input: {
    storeId: string;
    productId: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitCost: Money;
    batchNumber: string;
  }): Promise<ShowcaseStockItem> {
    let item = await this.stockRepo.findStockItem(input.storeId, input.productVariantId);
    let stockBefore = 0;

    if (!item) {
      item = new ShowcaseStockItem({
        id: uuidv4(),
        storeId: input.storeId,
        productId: input.productId,
        productVariantId: input.productVariantId,
        productName: input.productName,
        variantName: input.variantName,
        currentStock: input.quantity,
        minStockAlert: 5,
        allowNegative: true,
        unitCost: input.unitCost,
        lastUpdated: new Date(),
      });
    } else {
      stockBefore = item.currentStock;
      item.replenish(input.quantity);
      item.unitCost = input.unitCost;
    }

    await this.stockRepo.saveStockItem(item);

    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId: input.storeId,
      type: 'RESTOCK',
      quantityChange: input.quantity,
      stockBefore,
      stockAfter: item.currentStock,
      reason: `Ingreso de lote de producción #${input.batchNumber}`,
      referenceId: input.batchNumber,
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);
    this.logger.log(
      `[PRODUCCIÓN -> VITRINA] Recibidas ${input.quantity} unidades de "${input.productName}" (Lote #${input.batchNumber}, Costo: ${input.unitCost.format()})`,
    );
    return item;
  }

  /**
   * Ajuste de conteo físico para cuadres de vitrina.
   */
  public async adjustPhysicalCount(
    storeId: string,
    productVariantId: string,
    newCount: number,
    reason: string,
  ): Promise<ShowcaseStockItem> {
    const item = await this.stockRepo.findStockItem(storeId, productVariantId);
    if (!item) {
      throw new Error(`Ítem de stock ${productVariantId} no encontrado para ajuste físico.`);
    }

    const stockBefore = item.currentStock;
    item.setPhysicalCount(newCount);
    const stockAfter = item.currentStock;
    const diff = stockAfter - stockBefore;

    await this.stockRepo.saveStockItem(item);

    const movement = new StockMovement({
      id: uuidv4(),
      stockItemId: item.id,
      storeId,
      type: 'MANUAL_ADJUSTMENT',
      quantityChange: diff,
      stockBefore,
      stockAfter,
      reason,
      createdAt: new Date(),
    });

    await this.stockRepo.saveMovement(movement);
    return item;
  }

  /**
   * Comprueba si el ítem está disponible (stock > 0).
   * Utilizado para alimentar el AvailabilityPort del POS.
   */
  public async isProductVariantAvailable(storeId: string, productVariantId: string): Promise<boolean> {
    const item = await this.stockRepo.findStockItem(storeId, productVariantId);
    if (!item) {
      return true; // Si no tiene control unitario de stock en vitrina, está disponible
    }
    return item.currentStock > 0;
  }

  /**
   * Consulta los productos con alertas de stock bajo o agotado.
   */
  public async getLowStockAlerts(storeId: string): Promise<ShowcaseStockItem[]> {
    const all = await this.stockRepo.findAllStockItems(storeId);
    return all.filter((item) => item.isLowStock() || item.isOutOfStock());
  }

  public async getStockItem(storeId: string, productVariantId: string): Promise<ShowcaseStockItem | null> {
    return this.stockRepo.findStockItem(storeId, productVariantId);
  }

  public async getMovements(stockItemId: string): Promise<StockMovement[]> {
    return this.stockRepo.findMovementsByItem(stockItemId);
  }
}
