import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { DomainEvent } from '@shared/types/domain-event';
import { OutboxWriterService } from '@platform/outbox/outbox-writer.service';
import { ICashRepository, ShiftPaymentsBreakdown } from '../infra/cash.repository.interface';
import { RegisterShift } from '../domain/register-shift.entity';
import { CashTransaction, CashTransactionType } from '../domain/cash-transaction.entity';
import { CashShiftPort, ActiveShiftInfo, ShiftPaymentRecord } from '../api/cash-shift.port';

export interface ShiftCloseSummary {
  shiftId: string;
  storeId: string;
  registerId: string;
  openedAt: Date;
  closedAt: Date;
  openedByUserId: string;
  closedByUserId: string;
  initialCash: Money;
  cashSalesTotal: Money;
  digitalWalletSalesTotal: Money;
  cardSalesTotal: Money;
  transferSalesTotal: Money;
  totalTips: Money;
  grossSalesTotal: Money;
  expensesTotal: Money;
  cashDropsTotal: Money;
  floatInsTotal: Money;
  expectedCash: Money; // Solo efectivo físico en gaveta
  declaredCash: Money; // Arqueo ciego
  difference: Money;   // declared - expected
  isExact: boolean;
  transactions: CashTransaction[];
}

@Injectable()
export class CashService implements CashShiftPort {
  constructor(
    @Inject('CASH_REPOSITORY')
    private readonly cashRepo: ICashRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  public async openShift(
    storeIdOrDto:
      | string
      | {
          storeId: string;
          registerId: string;
          userId: string;
          initialCashDecimal?: number;
          initialCashAmount?: number;
        },
    registerId?: string,
    userId?: string,
    initialCashAmount?: number,
  ): Promise<RegisterShift> {
    let sId: string;
    let rId: string;
    let uId: string;
    let amount: number;

    if (typeof storeIdOrDto === 'string') {
      sId = storeIdOrDto;
      rId = registerId!;
      uId = userId!;
      amount = initialCashAmount ?? 0;
    } else {
      sId = storeIdOrDto.storeId;
      rId = storeIdOrDto.registerId;
      uId = storeIdOrDto.userId;
      amount = storeIdOrDto.initialCashDecimal ?? storeIdOrDto.initialCashAmount ?? 0;
    }

    const existing = await this.cashRepo.findActiveShift(sId, rId);
    if (existing) {
      throw new BadRequestException(
        `Ya existe un turno abierto (ID: ${existing.id}) para esta caja. Debe cerrarse antes de abrir uno nuevo.`,
      );
    }

    if (amount < 0) {
      throw new BadRequestException('El fondo inicial de caja no puede ser negativo.');
    }

    const initialCash = Money.fromDecimal(amount, 'PEN');
    const shift = new RegisterShift({
      id: uuidv4(),
      storeId: sId,
      registerId: rId,
      userId: uId,
      openedAt: new Date(),
      initialCash,
      status: 'OPEN',
    });

    await this.cashRepo.saveShift(shift);
    return shift;
  }

  public async recordExpense(
    shiftId: string,
    amount: number,
    reason: string,
    approvedByUserId: string,
  ): Promise<CashTransaction> {
    return this.createTransaction(shiftId, 'EXPENSE', amount, reason, approvedByUserId);
  }

  public async recordCashDrop(
    shiftId: string,
    amount: number,
    reason: string,
    approvedByUserId: string,
  ): Promise<CashTransaction> {
    return this.createTransaction(shiftId, 'CASH_DROP', amount, reason, approvedByUserId);
  }

  public async recordFloatIn(
    shiftId: string,
    amount: number,
    reason: string,
    approvedByUserId?: string,
  ): Promise<CashTransaction> {
    return this.createTransaction(shiftId, 'FLOAT_IN', amount, reason, approvedByUserId);
  }

  /**
   * Registra un pago en el turno con su método correspondiente y propina.
   */
  public async recordPayment(shiftId: string, payment: ShiftPaymentRecord): Promise<void> {
    await this.cashRepo.saveShiftPayment(shiftId, payment);
  }

  public async recordCashPayment(shiftId: string, amount: Money): Promise<void> {
    await this.recordPayment(shiftId, {
      method: 'CASH',
      amount,
      tipAmount: Money.zero(amount.currency),
    });
  }

  public async recordCashRefund(shiftId: string, amount: Money): Promise<void> {
    await this.recordPayment(shiftId, {
      method: 'CASH',
      amount: amount.multiply(-1),
      tipAmount: Money.zero(amount.currency),
    });
  }

  /**
   * Calcula el efectivo esperado de gaveta y el desglose de ventas por método de pago.
   */
  public async calculateExpectedCash(shiftId: string): Promise<{
    expectedCash: Money;
    initialCash: Money;
    cashSalesTotal: Money;
    breakdown: ShiftPaymentsBreakdown;
    expensesTotal: Money;
    cashDropsTotal: Money;
    floatInsTotal: Money;
    transactions: CashTransaction[];
  }> {
    const shift = await this.cashRepo.findShiftById(shiftId);
    if (!shift) {
      throw new NotFoundException(`Turno ${shiftId} no encontrado.`);
    }

    const txs = await this.cashRepo.findTransactionsByShift(shiftId);
    const breakdown = await this.cashRepo.getShiftPaymentsBreakdown(shiftId);

    let expensesTotal = Money.zero('PEN');
    let cashDropsTotal = Money.zero('PEN');
    let floatInsTotal = Money.zero('PEN');

    for (const tx of txs) {
      if (tx.type === 'EXPENSE') expensesTotal = expensesTotal.add(tx.amount);
      if (tx.type === 'CASH_DROP') cashDropsTotal = cashDropsTotal.add(tx.amount);
      if (tx.type === 'FLOAT_IN') floatInsTotal = floatInsTotal.add(tx.amount);
    }

    // El efectivo esperado en gaveta física SOLO considera ventas en CASH
    const expectedCash = shift.initialCash
      .add(breakdown.cashSales)
      .subtract(expensesTotal)
      .subtract(cashDropsTotal)
      .add(floatInsTotal);

    return {
      expectedCash,
      initialCash: shift.initialCash,
      cashSalesTotal: breakdown.cashSales,
      breakdown,
      expensesTotal,
      cashDropsTotal,
      floatInsTotal,
      transactions: txs,
    };
  }

  /**
   * Cierre Z de turno con arqueo ciego y desglose completo para conciliación bancaria.
   */
  public async closeShift(
    shiftId: string,
    declaredCashAmount: number,
    closedByUserId: string,
    approvedByUserId?: string,
  ): Promise<ShiftCloseSummary> {
    const shift = await this.cashRepo.findShiftById(shiftId);
    if (!shift) {
      throw new NotFoundException(`Turno ${shiftId} no encontrado.`);
    }

    if (!shift.isOpen()) {
      throw new BadRequestException('El turno ya fue cerrado previamente.');
    }

    const calculations = await this.calculateExpectedCash(shiftId);
    const declaredCash = Money.fromDecimal(declaredCashAmount, 'PEN');

    shift.closeShift(
      declaredCash,
      calculations.expectedCash,
      closedByUserId,
      approvedByUserId,
    );

    await this.cashRepo.saveShift(shift);

    const difference = shift.difference!;
    const isExact = difference.toCents() === 0;

    // Publicación del evento de dominio en Outbox con desglose multi-canal
    const closeEvent: DomainEvent<{
      shiftId: string;
      registerId: string;
      initialCash: number;
      expectedCash: number;
      declaredCash: number;
      difference: number;
      salesBreakdown: {
        cash: number;
        digitalWallets: number;
        cards: number;
        transfers: number;
        tips: number;
        grossTotal: number;
      };
      closedByUserId: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'shift.closed.v1',
      schemaVersion: 2,
      occurredAt: new Date().toISOString(),
      storeId: shift.storeId,
      correlationId: `shift-close-${shift.id}`,
      actor: { userId: closedByUserId, registerId: shift.registerId },
      payload: {
        shiftId: shift.id,
        registerId: shift.registerId,
        initialCash: shift.initialCash.toDecimal(),
        expectedCash: calculations.expectedCash.toDecimal(),
        declaredCash: declaredCash.toDecimal(),
        difference: difference.toDecimal(),
        salesBreakdown: {
          cash: calculations.breakdown.cashSales.toDecimal(),
          digitalWallets: calculations.breakdown.digitalWalletSales.toDecimal(),
          cards: calculations.breakdown.cardSales.toDecimal(),
          transfers: calculations.breakdown.transferSales.toDecimal(),
          tips: calculations.breakdown.totalTips.toDecimal(),
          grossTotal: calculations.breakdown.grossSalesTotal.toDecimal(),
        },
        closedByUserId,
      },
    };

    await this.outboxWriter.write(closeEvent);

    return {
      shiftId: shift.id,
      storeId: shift.storeId,
      registerId: shift.registerId,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt!,
      openedByUserId: shift.userId,
      closedByUserId,
      initialCash: shift.initialCash,
      cashSalesTotal: calculations.breakdown.cashSales,
      digitalWalletSalesTotal: calculations.breakdown.digitalWalletSales,
      cardSalesTotal: calculations.breakdown.cardSales,
      transferSalesTotal: calculations.breakdown.transferSales,
      totalTips: calculations.breakdown.totalTips,
      grossSalesTotal: calculations.breakdown.grossSalesTotal,
      expensesTotal: calculations.expensesTotal,
      cashDropsTotal: calculations.cashDropsTotal,
      floatInsTotal: calculations.floatInsTotal,
      expectedCash: calculations.expectedCash,
      declaredCash,
      difference,
      isExact,
      transactions: calculations.transactions,
    };
  }

  public async getActiveShift(storeId: string, registerId: string): Promise<ActiveShiftInfo | null> {
    const shift = await this.cashRepo.findActiveShift(storeId, registerId);
    if (!shift) return null;
    return {
      shiftId: shift.id,
      storeId: shift.storeId,
      registerId: shift.registerId,
      userId: shift.userId,
      openedAt: shift.openedAt,
      initialCash: shift.initialCash,
    };
  }

  public async assertActiveShift(storeId: string, registerId: string): Promise<ActiveShiftInfo> {
    const info = await this.getActiveShift(storeId, registerId);
    if (!info) {
      throw new BadRequestException('No hay un turno de caja abierto para registrar operaciones.');
    }
    return info;
  }

  private async createTransaction(
    shiftId: string,
    type: CashTransactionType,
    amount: number,
    reason: string,
    approvedByUserId?: string,
  ): Promise<CashTransaction> {
    const shift = await this.cashRepo.findShiftById(shiftId);
    if (!shift || !shift.isOpen()) {
      throw new BadRequestException('No se pueden registrar movimientos en un turno inexistente o cerrado.');
    }

    if (amount <= 0) {
      throw new BadRequestException('El monto de la transacción debe ser mayor a cero.');
    }

    const tx = new CashTransaction({
      id: uuidv4(),
      shiftId,
      type,
      amount: Money.fromDecimal(amount, 'PEN'),
      reason,
      approvedByUserId,
      createdAt: new Date(),
    });

    await this.cashRepo.saveTransaction(tx);
    return tx;
  }
}
