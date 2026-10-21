import { BaseEntity } from '@shared/types/entity';

export type StockMovementType =
  | 'SALE_DEDUCTION'
  | 'INITIAL_COUNT'
  | 'RESTOCK'
  | 'MANUAL_ADJUSTMENT'
  | 'VOID_REVERSAL';

export interface StockMovementProps {
  id: string;
  stockItemId: string;
  storeId: string;
  type: StockMovementType;
  quantityChange: number; // Negativo para salidas, positivo para entradas
  stockBefore: number;
  stockAfter: number;
  reason: string;
  referenceId?: string; // ej. orderId
  createdAt: Date;
}

export class StockMovement extends BaseEntity {
  public stockItemId: string;
  public storeId: string;
  public type: StockMovementType;
  public quantityChange: number;
  public stockBefore: number;
  public stockAfter: number;
  public reason: string;
  public referenceId?: string;
  public createdAt: Date;

  constructor(props: StockMovementProps) {
    super(props.id);
    this.stockItemId = props.stockItemId;
    this.storeId = props.storeId;
    this.type = props.type;
    this.quantityChange = props.quantityChange;
    this.stockBefore = props.stockBefore;
    this.stockAfter = props.stockAfter;
    this.reason = props.reason;
    this.referenceId = props.referenceId;
    this.createdAt = props.createdAt;
  }
}
