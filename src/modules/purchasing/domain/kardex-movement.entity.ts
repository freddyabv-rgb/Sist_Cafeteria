import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type KardexMovementType =
  | 'PURCHASE_RECEIPT'
  | 'RECIPE_CONSUMPTION'
  | 'WASTE_DISPOSAL'
  | 'GRINDER_CALIBRATION'
  | 'PHYSICAL_INVENTORY_ADJUSTMENT';

export interface KardexMovementProps {
  id: string;
  storeId: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  type: KardexMovementType;
  documentReference: string; // ej. "F001-0004521", "Order #C1-0001", "Ajuste Conteo Semanal"
  quantityChange: number; // Positivo (entradas), negativo (salidas)
  unitCostDec: number; // Costo unitario aplicado en este movimiento
  totalMovementCost: Money; // Valor monetario del movimiento
  stockBalanceAfter: number; // Saldo de existencias resultante
  cppAfterDec: number; // Costo Promedio Ponderado resultante
  totalInventoryValueAfter: Money; // Valorización total del inventario tras el movimiento
  reason: string;
  createdAt: Date;
}

export class KardexMovement extends BaseEntity {
  public storeId: string;
  public ingredientId: string;
  public ingredientCode: string;
  public ingredientName: string;
  public type: KardexMovementType;
  public documentReference: string;
  public quantityChange: number;
  public unitCostDec: number;
  public totalMovementCost: Money;
  public stockBalanceAfter: number;
  public cppAfterDec: number;
  public totalInventoryValueAfter: Money;
  public reason: string;
  public createdAt: Date;

  constructor(props: KardexMovementProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.ingredientId = props.ingredientId;
    this.ingredientCode = props.ingredientCode;
    this.ingredientName = props.ingredientName;
    this.type = props.type;
    this.documentReference = props.documentReference;
    this.quantityChange = props.quantityChange;
    this.unitCostDec = props.unitCostDec;
    this.totalMovementCost = props.totalMovementCost;
    this.stockBalanceAfter = props.stockBalanceAfter;
    this.cppAfterDec = props.cppAfterDec;
    this.totalInventoryValueAfter = props.totalInventoryValueAfter;
    this.reason = props.reason;
    this.createdAt = props.createdAt;
  }
}
