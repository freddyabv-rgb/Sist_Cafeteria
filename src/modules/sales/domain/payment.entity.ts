import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type PaymentMethod = 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'TRANSFER';
export type PaymentRecordStatus = 'COMPLETED' | 'REFUNDED' | 'VOIDED';

export interface PaymentProps {
  id: string;
  orderId: string;
  idempotencyKey: string;
  method: PaymentMethod;
  provider?: string;    // "YAPE", "PLIN", "VISA", etc.
  reference?: string;   // Nro de operación / voucher
  status: PaymentRecordStatus;
  amount: Money;
  tipAmount: Money;
  cashTendered?: Money;
  changeDue?: Money;
  paidAt: Date;
}

export class Payment extends BaseEntity {
  public orderId: string;
  public idempotencyKey: string;
  public method: PaymentMethod;
  public provider?: string;
  public reference?: string;
  public status: PaymentRecordStatus;
  public amount: Money;
  public tipAmount: Money;
  public cashTendered?: Money;
  public changeDue?: Money;
  public paidAt: Date;

  constructor(props: PaymentProps) {
    super(props.id);
    this.orderId = props.orderId;
    this.idempotencyKey = props.idempotencyKey;
    this.method = props.method;
    this.provider = props.provider;
    this.reference = props.reference;
    this.status = props.status;
    this.amount = props.amount;
    this.tipAmount = props.tipAmount;
    this.cashTendered = props.cashTendered;
    this.changeDue = props.changeDue;
    this.paidAt = props.paidAt;
  }
}
