import { RegisterShift } from '../domain/register-shift.entity';
import { CashTransaction } from '../domain/cash-transaction.entity';
import { ShiftPaymentRecord } from '../api/cash-shift.port';
import { Money } from '@shared/types/money';

export interface ShiftPaymentsBreakdown {
  cashSales: Money;
  digitalWalletSales: Money;
  cardSales: Money;
  transferSales: Money;
  totalTips: Money;
  grossSalesTotal: Money;
  payments: ShiftPaymentRecord[];
}

export interface ICashRepository {
  saveShift(shift: RegisterShift): Promise<void>;
  findShiftById(id: string): Promise<RegisterShift | null>;
  findActiveShift(storeId: string, registerId: string): Promise<RegisterShift | null>;
  
  saveTransaction(transaction: CashTransaction): Promise<void>;
  findTransactionsByShift(shiftId: string): Promise<CashTransaction[]>;

  // Registro y consulta de pagos vinculados al turno
  saveShiftPayment(shiftId: string, payment: ShiftPaymentRecord): Promise<void>;
  getShiftPaymentsBreakdown(shiftId: string): Promise<ShiftPaymentsBreakdown>;
  getCashSalesTotal(shiftId: string): Promise<Money>;
}
