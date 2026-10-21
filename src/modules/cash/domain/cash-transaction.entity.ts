import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type CashTransactionType = 'EXPENSE' | 'CASH_DROP' | 'FLOAT_IN';

export interface CashTransactionProps {
  id: string;
  shiftId: string;
  type: CashTransactionType;
  amount: Money;
  reason: string;
  approvedByUserId?: string;
  createdAt: Date;
}

export class CashTransaction extends BaseEntity {
  public shiftId: string;
  public type: CashTransactionType;
  public amount: Money;
  public reason: string;
  public approvedByUserId?: string;
  public createdAt: Date;

  constructor(props: CashTransactionProps) {
    super(props.id);
    this.shiftId = props.shiftId;
    this.type = props.type;
    this.amount = props.amount;
    this.reason = props.reason;
    this.approvedByUserId = props.approvedByUserId;
    this.createdAt = props.createdAt;
  }
}
