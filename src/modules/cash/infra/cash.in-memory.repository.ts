import { ICashRepository, ShiftPaymentsBreakdown } from './cash.repository.interface';
import { RegisterShift } from '../domain/register-shift.entity';
import { CashTransaction } from '../domain/cash-transaction.entity';
import { ShiftPaymentRecord } from '../api/cash-shift.port';
import { Money } from '@shared/types/money';

export class InMemoryCashRepository implements ICashRepository {
  private shifts = new Map<string, RegisterShift>();
  private transactions = new Map<string, CashTransaction[]>();
  private payments = new Map<string, ShiftPaymentRecord[]>();

  public async saveShift(shift: RegisterShift): Promise<void> {
    this.shifts.set(shift.id, shift);
  }

  public async findShiftById(id: string): Promise<RegisterShift | null> {
    return this.shifts.get(id) || null;
  }

  public async findActiveShift(storeId: string, registerId: string): Promise<RegisterShift | null> {
    for (const shift of this.shifts.values()) {
      if (shift.storeId === storeId && shift.registerId === registerId && shift.isOpen()) {
        return shift;
      }
    }
    return null;
  }

  public async saveTransaction(transaction: CashTransaction): Promise<void> {
    const list = this.transactions.get(transaction.shiftId) || [];
    list.push(transaction);
    this.transactions.set(transaction.shiftId, list);
  }

  public async findTransactionsByShift(shiftId: string): Promise<CashTransaction[]> {
    return this.transactions.get(shiftId) || [];
  }

  public async saveShiftPayment(shiftId: string, payment: ShiftPaymentRecord): Promise<void> {
    const list = this.payments.get(shiftId) || [];
    list.push(payment);
    this.payments.set(shiftId, list);
  }

  public async getShiftPaymentsBreakdown(shiftId: string): Promise<ShiftPaymentsBreakdown> {
    const list = this.payments.get(shiftId) || [];

    let cashSales = Money.zero('PEN');
    let digitalWalletSales = Money.zero('PEN');
    let cardSales = Money.zero('PEN');
    let transferSales = Money.zero('PEN');
    let totalTips = Money.zero('PEN');
    let grossSalesTotal = Money.zero('PEN');

    for (const p of list) {
      if (p.method === 'CASH') cashSales = cashSales.add(p.amount);
      if (p.method === 'DIGITAL_WALLET') digitalWalletSales = digitalWalletSales.add(p.amount);
      if (p.method === 'CARD') cardSales = cardSales.add(p.amount);
      if (p.method === 'TRANSFER') transferSales = transferSales.add(p.amount);

      totalTips = totalTips.add(p.tipAmount);
      grossSalesTotal = grossSalesTotal.add(p.amount);
    }

    return {
      cashSales,
      digitalWalletSales,
      cardSales,
      transferSales,
      totalTips,
      grossSalesTotal,
      payments: list,
    };
  }

  public async getCashSalesTotal(shiftId: string): Promise<Money> {
    const breakdown = await this.getShiftPaymentsBreakdown(shiftId);
    return breakdown.cashSales;
  }

  public clear(): void {
    this.shifts.clear();
    this.transactions.clear();
    this.payments.clear();
  }
}
