import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';
import { CashTransaction } from './cash-transaction.entity';

export type ShiftStatus = 'OPEN' | 'CLOSED';

export interface RegisterShiftProps {
  id: string;
  storeId: string;
  registerId: string;
  userId: string;
  closedByUserId?: string;
  openedAt: Date;
  closedAt?: Date;
  initialCash: Money;
  declaredCash?: Money;
  expectedCashSnapshot?: Money;
  difference?: Money;
  approvedByUserId?: string;
  status: ShiftStatus;
  transactions?: CashTransaction[];
}

export class RegisterShift extends BaseEntity {
  public storeId: string;
  public registerId: string;
  public userId: string;
  public closedByUserId?: string;
  public openedAt: Date;
  public closedAt?: Date;
  public initialCash: Money;
  public declaredCash?: Money;
  public expectedCashSnapshot?: Money;
  public difference?: Money;
  public approvedByUserId?: string;
  public status: ShiftStatus;
  public transactions: CashTransaction[];

  constructor(props: RegisterShiftProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.registerId = props.registerId;
    this.userId = props.userId;
    this.closedByUserId = props.closedByUserId;
    this.openedAt = props.openedAt;
    this.closedAt = props.closedAt;
    this.initialCash = props.initialCash;
    this.declaredCash = props.declaredCash;
    this.expectedCashSnapshot = props.expectedCashSnapshot;
    this.difference = props.difference;
    this.approvedByUserId = props.approvedByUserId;
    this.status = props.status;
    this.transactions = props.transactions || [];
  }

  public isOpen(): boolean {
    return this.status === 'OPEN';
  }

  public addTransaction(transaction: CashTransaction): void {
    if (!this.isOpen()) {
      throw new Error('No se pueden registrar transacciones en un turno cerrado.');
    }
    this.transactions.push(transaction);
  }

  public closeShift(
    declaredCash: Money,
    expectedCash: Money,
    closedByUserId: string,
    approvedByUserId?: string,
  ): void {
    if (!this.isOpen()) {
      throw new Error('El turno ya se encuentra cerrado.');
    }

    this.declaredCash = declaredCash;
    this.expectedCashSnapshot = expectedCash;
    this.difference = declaredCash.subtract(expectedCash);
    this.closedByUserId = closedByUserId;
    this.approvedByUserId = approvedByUserId;
    this.closedAt = new Date();
    this.status = 'CLOSED';
  }
}
