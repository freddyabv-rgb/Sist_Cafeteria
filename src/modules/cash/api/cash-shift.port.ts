import { Money } from '@shared/types/money';

export interface ActiveShiftInfo {
  shiftId: string;
  storeId: string;
  registerId: string;
  userId: string;
  openedAt: Date;
  initialCash: Money;
}

export type PaymentMethodType = 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'TRANSFER';

export interface ShiftPaymentRecord {
  method: PaymentMethodType;
  provider?: string;    // "YAPE", "PLIN", "VISA", etc.
  reference?: string;   // Nro de operación / voucher
  amount: Money;
  tipAmount: Money;
}

/**
 * Puerto de Turno de Caja (CashShiftPort).
 * Utilizado por el módulo de Ventas (POS) para validar turno abierto
 * y registrar los cobros desglosados por medio de pago y propinas.
 */
export interface CashShiftPort {
  getActiveShift(storeId: string, registerId: string): Promise<ActiveShiftInfo | null>;
  assertActiveShift(storeId: string, registerId: string): Promise<ActiveShiftInfo>;
  recordPayment(shiftId: string, payment: ShiftPaymentRecord): Promise<void>;
  recordCashPayment(shiftId: string, amount: Money): Promise<void>;
  recordCashRefund(shiftId: string, amount: Money): Promise<void>;
}
