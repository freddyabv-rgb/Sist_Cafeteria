import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type InventoryDimension = 'MASS' | 'VOLUME' | 'DISCRETE';
export type InventoryUnit = 'GRAM' | 'MILLILITER' | 'UNIT';
export type IngredientCategory =
  | 'COFFEE_BEANS'
  | 'DAIRY_AND_PLANT'
  | 'SYRUPS'
  | 'PACKAGING'
  | 'CONSUMABLES';

export interface RawIngredientProps {
  id: string;
  storeId: string;
  code: string; // ej. INS-CAFE-ESP, INS-LECHE-ENT
  name: string;
  category: IngredientCategory;
  inventoryUnit: InventoryUnit;
  currentStock: number; // En unidad de inventario (gramos, ml, unidades)
  minStockAlert: number;
  currentAverageCostDec: number; // Costo Promedio Ponderado por unidad base en Soles (ej. 0.065 PEN/g)
  lastPurchaseDate?: Date;
  isActive: boolean;
}

export class RawIngredient extends BaseEntity {
  public storeId: string;
  public code: string;
  public name: string;
  public category: IngredientCategory;
  public inventoryUnit: InventoryUnit;
  public currentStock: number;
  public minStockAlert: number;
  public currentAverageCostDec: number;
  public lastPurchaseDate?: Date;
  public isActive: boolean;

  constructor(props: RawIngredientProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.code = props.code;
    this.name = props.name;
    this.category = props.category;
    this.inventoryUnit = props.inventoryUnit;
    this.currentStock = props.currentStock;
    this.minStockAlert = props.minStockAlert;
    this.currentAverageCostDec = props.currentAverageCostDec;
    this.lastPurchaseDate = props.lastPurchaseDate;
    this.isActive = props.isActive;
  }

  /**
   * Obtiene la dimensión física de la unidad de inventario para validar conversiones.
   */
  public getDimension(): InventoryDimension {
    switch (this.inventoryUnit) {
      case 'GRAM':
        return 'MASS';
      case 'MILLILITER':
        return 'VOLUME';
      case 'UNIT':
        return 'DISCRETE';
    }
  }

  /**
   * Alerta de stock mínimo alcanzado o superado hacia abajo.
   */
  public isLowStock(): boolean {
    return this.currentStock > 0 && this.currentStock <= this.minStockAlert;
  }

  /**
   * Indica si el insumo está totalmente agotado.
   */
  public isOutOfStock(): boolean {
    return this.currentStock <= 0;
  }

  /**
   * Calcula el valor monetario total del stock actual en base al CPP.
   */
  public getTotalInventoryValue(): Money {
    if (this.currentStock <= 0 || this.currentAverageCostDec <= 0) {
      return Money.zero('PEN');
    }
    const totalDecimal = this.currentStock * this.currentAverageCostDec;
    return Money.fromDecimal(totalDecimal, 'PEN');
  }

  /**
   * Aplica un ingreso por compra recalculando el Costo Promedio Ponderado (CPP).
   * Fórmula:
   * Nuevo CPP = ((Stock Anterior * CPP Anterior) + (Cantidad Ingresada * Costo Unitario Compra)) / (Stock Anterior + Cantidad Ingresada)
   */
  public applyPurchaseEntry(quantityUnits: number, unitCostDec: number, purchaseDate: Date): number {
    if (quantityUnits <= 0) {
      throw new Error(`La cantidad ingresada debe ser positiva. Recibido: ${quantityUnits}`);
    }

    const previousStock = this.currentStock;
    const previousCpp = this.currentAverageCostDec;
    let newCpp = unitCostDec;

    if (previousStock > 0 && previousCpp > 0) {
      const previousTotalValue = previousStock * previousCpp;
      const incomingTotalValue = quantityUnits * unitCostDec;
      newCpp = (previousTotalValue + incomingTotalValue) / (previousStock + quantityUnits);
    } else {
      // Si el stock previo era <= 0 (o saldo inicial), el nuevo costo de compra define el nuevo CPP
      newCpp = unitCostDec;
    }

    this.currentStock += quantityUnits;
    this.currentAverageCostDec = Number(newCpp.toFixed(6)); // Precisión a 6 decimales para mililitros y gramos
    this.lastPurchaseDate = purchaseDate;

    return this.currentAverageCostDec;
  }

  /**
   * Descuenta stock por consumo de receta o merma. Mantiene el CPP intacto.
   */
  public deductStock(quantityUnits: number): void {
    if (quantityUnits <= 0) {
      throw new Error(`La cantidad a descontar debe ser mayor a 0. Recibido: ${quantityUnits}`);
    }
    this.currentStock -= quantityUnits;
  }

  /**
   * Ajuste de inventario físico (toma física de inventario en barra).
   * Retorna la diferencia respecto al stock teórico (positivo = sobrante, negativo = faltante/merma).
   */
  public adjustStock(physicalCount: number): number {
    const diff = physicalCount - this.currentStock;
    this.currentStock = physicalCount;
    return diff;
  }
}
