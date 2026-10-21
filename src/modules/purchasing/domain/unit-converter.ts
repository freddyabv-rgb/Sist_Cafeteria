import { InventoryUnit, InventoryDimension } from './raw-ingredient.entity';

export type PurchaseUnit =
  | 'BAG_25KG'
  | 'BAG_1KG'
  | 'BAG_500G'
  | 'BAG_250G'
  | 'KG'
  | 'BOX_12L'
  | 'BOX_6L'
  | 'BOTTLE_1L'
  | 'BOTTLE_750ML'
  | 'LITER'
  | 'PACK_1000_UNITS'
  | 'PACK_500_UNITS'
  | 'PACK_100_UNITS'
  | 'PACK_50_UNITS'
  | 'UNIT';

export interface ConversionRule {
  purchaseUnit: PurchaseUnit;
  targetInventoryUnit: InventoryUnit;
  dimension: InventoryDimension;
  factor: number; // Cantidad de unidades base que contiene 1 unidad de compra
}

export class UnitConverter {
  private static readonly RULES: Record<PurchaseUnit, ConversionRule> = {
    BAG_25KG: {
      purchaseUnit: 'BAG_25KG',
      targetInventoryUnit: 'GRAM',
      dimension: 'MASS',
      factor: 25000,
    },
    BAG_1KG: {
      purchaseUnit: 'BAG_1KG',
      targetInventoryUnit: 'GRAM',
      dimension: 'MASS',
      factor: 1000,
    },
    BAG_500G: {
      purchaseUnit: 'BAG_500G',
      targetInventoryUnit: 'GRAM',
      dimension: 'MASS',
      factor: 500,
    },
    BAG_250G: {
      purchaseUnit: 'BAG_250G',
      targetInventoryUnit: 'GRAM',
      dimension: 'MASS',
      factor: 250,
    },
    KG: {
      purchaseUnit: 'KG',
      targetInventoryUnit: 'GRAM',
      dimension: 'MASS',
      factor: 1000,
    },
    BOX_12L: {
      purchaseUnit: 'BOX_12L',
      targetInventoryUnit: 'MILLILITER',
      dimension: 'VOLUME',
      factor: 12000,
    },
    BOX_6L: {
      purchaseUnit: 'BOX_6L',
      targetInventoryUnit: 'MILLILITER',
      dimension: 'VOLUME',
      factor: 6000,
    },
    BOTTLE_1L: {
      purchaseUnit: 'BOTTLE_1L',
      targetInventoryUnit: 'MILLILITER',
      dimension: 'VOLUME',
      factor: 1000,
    },
    BOTTLE_750ML: {
      purchaseUnit: 'BOTTLE_750ML',
      targetInventoryUnit: 'MILLILITER',
      dimension: 'VOLUME',
      factor: 750,
    },
    LITER: {
      purchaseUnit: 'LITER',
      targetInventoryUnit: 'MILLILITER',
      dimension: 'VOLUME',
      factor: 1000,
    },
    PACK_1000_UNITS: {
      purchaseUnit: 'PACK_1000_UNITS',
      targetInventoryUnit: 'UNIT',
      dimension: 'DISCRETE',
      factor: 1000,
    },
    PACK_500_UNITS: {
      purchaseUnit: 'PACK_500_UNITS',
      targetInventoryUnit: 'UNIT',
      dimension: 'DISCRETE',
      factor: 500,
    },
    PACK_100_UNITS: {
      purchaseUnit: 'PACK_100_UNITS',
      targetInventoryUnit: 'UNIT',
      dimension: 'DISCRETE',
      factor: 100,
    },
    PACK_50_UNITS: {
      purchaseUnit: 'PACK_50_UNITS',
      targetInventoryUnit: 'UNIT',
      dimension: 'DISCRETE',
      factor: 50,
    },
    UNIT: {
      purchaseUnit: 'UNIT',
      targetInventoryUnit: 'UNIT',
      dimension: 'DISCRETE',
      factor: 1,
    },
  };

  /**
   * Obtiene la regla de conversión para una unidad de compra dada.
   */
  public static getRule(unit: PurchaseUnit): ConversionRule {
    const rule = this.RULES[unit];
    if (!rule) {
      throw new Error(`Unidad de compra no soportada: ${unit}`);
    }
    return rule;
  }

  /**
   * Valida compatibilidad dimensional y calcula la cantidad equivalente en unidades base de inventario.
   */
  public static convertToBaseUnits(
    purchaseUnit: PurchaseUnit,
    packagesCount: number,
    expectedInventoryUnit: InventoryUnit,
  ): number {
    const rule = this.getRule(purchaseUnit);

    if (rule.targetInventoryUnit !== expectedInventoryUnit) {
      throw new Error(
        `Incompatibilidad de dimensiones: la unidad de compra "${purchaseUnit}" corresponde a "${rule.targetInventoryUnit}" pero el insumo se gestiona en "${expectedInventoryUnit}".`,
      );
    }

    if (packagesCount <= 0) {
      throw new Error(`La cantidad de bultos/paquetes debe ser mayor a 0. Recibido: ${packagesCount}`);
    }

    return packagesCount * rule.factor;
  }
}
