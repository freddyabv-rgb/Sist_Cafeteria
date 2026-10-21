import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';

export type OrderChannel = 'POS' | 'QR' | 'PICKUP';
export type OrderType = 'TAKEAWAY' | 'DINE_IN';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED';
export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface OrderProps {
  id: string;
  storeId: string;
  registerId: string;
  shiftId: string;
  orderNumber: string; // ej. "C1-0001"
  idempotencyKey: string;
  channel: OrderChannel;
  orderType: OrderType;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  customerName?: string;
  customerDocType?: string;
  customerDocNumber?: string;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  tipTotal: Money;
  roundingAdjustment: Money;
  total: Money;
  voidReason?: string;
  voidedByUserId?: string;
  paidAt?: Date;
  createdAt: Date;
  items?: OrderItem[];
  payments?: Payment[];
}

export class Order extends BaseEntity {
  public storeId: string;
  public registerId: string;
  public shiftId: string;
  public orderNumber: string;
  public idempotencyKey: string;
  public channel: OrderChannel;
  public orderType: OrderType;
  public paymentStatus: PaymentStatus;
  public status: OrderStatus;
  public customerName?: string;
  public customerDocType?: string;
  public customerDocNumber?: string;
  public subtotal: Money;
  public discountTotal: Money;
  public taxTotal: Money;
  public tipTotal: Money;
  public roundingAdjustment: Money;
  public total: Money;
  public voidReason?: string;
  public voidedByUserId?: string;
  public paidAt?: Date;
  public createdAt: Date;
  public items: OrderItem[];
  public payments: Payment[];

  constructor(props: OrderProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.registerId = props.registerId;
    this.shiftId = props.shiftId;
    this.orderNumber = props.orderNumber;
    this.idempotencyKey = props.idempotencyKey;
    this.channel = props.channel;
    this.orderType = props.orderType;
    this.paymentStatus = props.paymentStatus;
    this.status = props.status;
    this.customerName = props.customerName;
    this.customerDocType = props.customerDocType;
    this.customerDocNumber = props.customerDocNumber;
    this.subtotal = props.subtotal;
    this.discountTotal = props.discountTotal;
    this.taxTotal = props.taxTotal;
    this.tipTotal = props.tipTotal;
    this.roundingAdjustment = props.roundingAdjustment;
    this.total = props.total;
    this.voidReason = props.voidReason;
    this.voidedByUserId = props.voidedByUserId;
    this.paidAt = props.paidAt;
    this.createdAt = props.createdAt;
    this.items = props.items || [];
    this.payments = props.payments || [];
  }

  public isPaid(): boolean {
    return this.paymentStatus === 'PAID';
  }

  public markAsPaid(payment: Payment): void {
    this.payments.push(payment);
    this.paymentStatus = 'PAID';
    this.status = 'RECEIVED';
    this.paidAt = payment.paidAt;
  }
}
