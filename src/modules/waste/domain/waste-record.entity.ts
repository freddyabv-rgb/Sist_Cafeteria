import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type WasteType =
  | 'REMAKE'
  | 'SPILLAGE'
  | 'STAFF_CONSUMPTION'
  | 'EXPIRED'
  | 'MACHINE_PURGE';

export interface WasteItemLine {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCostDec: number;
  totalCost: Money;
}

export interface WasteRecordProps {
  id: string;
  storeId: string;
  type: WasteType;
  reason: string;
  orderId?: string; // Si está vinculado a un pedido de venta rehecho
  orderNumber?: string;
  responsibleUserId: string;
  responsibleUserName: string;
  supervisorUserId?: string; // Aprobador por PIN si supera umbral
  items: WasteItemLine[];
  totalCost: Money;
  createdAt?: Date;
}

export class WasteRecord extends BaseEntity {
  public storeId: string;
  public type: WasteType;
  public reason: string;
  public orderId?: string;
  public orderNumber?: string;
  public responsibleUserId: string;
  public responsibleUserName: string;
  public supervisorUserId?: string;
  public items: WasteItemLine[];
  public totalCost: Money;
  public createdAt: Date;

  constructor(props: WasteRecordProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.type = props.type;
    this.reason = props.reason;
    this.orderId = props.orderId;
    this.orderNumber = props.orderNumber;
    this.responsibleUserId = props.responsibleUserId;
    this.responsibleUserName = props.responsibleUserName;
    this.supervisorUserId = props.supervisorUserId;
    this.items = props.items;
    this.totalCost = props.totalCost;
    this.createdAt = props.createdAt || new Date();
  }
}
