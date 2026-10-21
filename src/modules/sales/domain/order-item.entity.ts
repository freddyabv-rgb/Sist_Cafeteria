import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type PrepStation = 'BARRA' | 'COCINA' | 'VITRINA';
export type ItemPrepStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'VOIDED';

export interface OrderItemModifierProps {
  id: string;
  orderItemId: string;
  modifierOptionId: string;
  groupName: string;   // Snapshot inmutable
  optionName: string;  // Snapshot inmutable
  quantity: number;
  priceDelta: Money;
  highlightKds: boolean;
}

export class OrderItemModifier extends BaseEntity {
  public orderItemId: string;
  public modifierOptionId: string;
  public groupName: string;
  public optionName: string;
  public quantity: number;
  public priceDelta: Money;
  public highlightKds: boolean;

  constructor(props: OrderItemModifierProps) {
    super(props.id);
    this.orderItemId = props.orderItemId;
    this.modifierOptionId = props.modifierOptionId;
    this.groupName = props.groupName;
    this.optionName = props.optionName;
    this.quantity = props.quantity;
    this.priceDelta = props.priceDelta;
    this.highlightKds = props.highlightKds;
  }
}

export interface OrderItemProps {
  id: string;
  orderId: string;
  productVariantId: string;
  productName: string; // Snapshot inmutable
  variantName: string; // Snapshot inmutable
  station: PrepStation;
  trackingMode?: 'BY_UNIT' | 'BY_RECIPE' | 'NONE';
  status: ItemPrepStatus;
  quantity: number;
  unitPrice: Money;
  discountAmount: Money;
  taxCode: string;
  taxAmount: Money;
  totalPrice: Money;
  notes?: string;
  voidReason?: string;
  modifiers?: OrderItemModifier[];
}

export class OrderItem extends BaseEntity {
  public orderId: string;
  public productVariantId: string;
  public productName: string;
  public variantName: string;
  public station: PrepStation;
  public trackingMode: 'BY_UNIT' | 'BY_RECIPE' | 'NONE';
  public status: ItemPrepStatus;
  public quantity: number;
  public unitPrice: Money;
  public discountAmount: Money;
  public taxCode: string;
  public taxAmount: Money;
  public totalPrice: Money;
  public notes?: string;
  public voidReason?: string;
  public modifiers: OrderItemModifier[];

  constructor(props: OrderItemProps) {
    super(props.id);
    this.orderId = props.orderId;
    this.productVariantId = props.productVariantId;
    this.productName = props.productName;
    this.variantName = props.variantName;
    this.station = props.station;
    this.trackingMode = props.trackingMode || 'NONE';
    this.status = props.status;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.discountAmount = props.discountAmount;
    this.taxCode = props.taxCode;
    this.taxAmount = props.taxAmount;
    this.totalPrice = props.totalPrice;
    this.notes = props.notes;
    this.voidReason = props.voidReason;
    this.modifiers = props.modifiers || [];
  }
}
