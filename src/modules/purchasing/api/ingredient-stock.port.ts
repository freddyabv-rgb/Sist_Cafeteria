import { Money } from '@shared/types/money';

export interface IngredientDeductionInput {
  ingredientId: string;
  quantityUnits: number;
  unit?: string;
}

export interface WasteDeductionResult {
  movementId: string;
  ingredientId: string;
  ingredientName: string;
  quantityUnits: number;
  unitCostDec: number;
  totalCost: Money;
  stockBalanceAfter: number;
}

export interface IngredientInfo {
  id: string;
  code: string;
  name: string;
  inventoryUnit: string;
  currentStock: number;
  currentAverageCostDec: number;
}

export interface IngredientStockPort {
  /**
   * Consulta el stock disponible de un insumo en su unidad base.
   */
  getIngredientStock(storeId: string, ingredientId: string): Promise<number>;

  /**
   * Consulta información maestra y costo actual del insumo.
   */
  getIngredientInfo?(storeId: string, ingredientId: string): Promise<IngredientInfo | null>;

  /**
   * Descuenta insumos por preparación de receta tras cobro de venta.
   */
  deductRecipeIngredients(
    storeId: string,
    deductions: IngredientDeductionInput[],
    orderId: string,
    orderNumber: string,
  ): Promise<void>;

  /**
   * Registra una salida de insumos por merma o calibración de molino.
   */
  recordWasteOrCalibration(
    storeId: string,
    ingredientId: string,
    quantityUnits: number,
    type: 'WASTE_DISPOSAL' | 'GRINDER_CALIBRATION',
    reason: string,
    userId: string,
    documentReference?: string,
  ): Promise<WasteDeductionResult>;

  /**
   * Descuenta materias primas consumidas en un lote de producción de obrador / pastelería.
   */
  deductProductionIngredients?(
    storeId: string,
    deductions: IngredientDeductionInput[],
    batchId: string,
    batchNumber: string,
    bakerUserId: string,
  ): Promise<WasteDeductionResult[]>;
}
