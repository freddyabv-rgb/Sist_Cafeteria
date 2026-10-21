import { InMemoryCashRepository } from '../src/modules/cash/infra/cash.in-memory.repository';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { CashService } from '../src/modules/cash/services/cash.service';
import { Money } from '../src/shared-kernel/types/money';

describe('Paso 2: Módulo de Turnos de Caja y Control de Efectivo Mínimo', () => {
  let cashRepo: InMemoryCashRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let cashService: CashService;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-caja-mostrador-c1';
  const cashierUserId = 'usr-cajero-maria';
  const supervisorUserId = 'usr-supervisor-carlos';

  beforeEach(() => {
    cashRepo = new InMemoryCashRepository();
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    cashService = new CashService(cashRepo, outboxWriter);
  });

  it('debe abrir un turno de caja con fondo inicial y evitar doble apertura en la misma caja', async () => {
    // 1. Apertura exitosa con fondo de S/ 100.00
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    expect(shift.id).toBeDefined();
    expect(shift.status).toBe('OPEN');
    expect(shift.initialCash.toDecimal()).toBe(100.0);
    expect(shift.initialCash.format()).toBe('S/ 100.00');

    // 2. Verificar a través del puerto CashShiftPort
    const active = await cashService.getActiveShift(testStoreId, testRegisterId);
    expect(active).not.toBeNull();
    expect(active!.shiftId).toBe(shift.id);

    // 3. Intento de abrir un segundo turno en la misma caja debe fallar
    await expect(
      cashService.openShift(testStoreId, testRegisterId, 'otro-cajero', 50.0),
    ).rejects.toThrow('Ya existe un turno abierto');
  });

  it('debe registrar egresos, retiros parciales (cash drop) e ingresos de sencillo en turno abierto', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    // 1. Egreso menor: Compra de bolsa de hielo S/ 15.00
    const expense = await cashService.recordExpense(
      shift.id,
      15.0,
      'Bolsa de hielo para cold brew',
      supervisorUserId,
    );
    expect(expense.type).toBe('EXPENSE');
    expect(expense.amount.toDecimal()).toBe(15.0);

    // 2. Retiro de seguridad (Cash Drop): S/ 50.00 a bóveda
    const drop = await cashService.recordCashDrop(
      shift.id,
      50.0,
      'Retiro parcial de seguridad a bóveda',
      supervisorUserId,
    );
    expect(drop.type).toBe('CASH_DROP');
    expect(drop.amount.toDecimal()).toBe(50.0);

    // 3. Ingreso de sencillo (Float In): S/ 20.00 en monedas
    const floatIn = await cashService.recordFloatIn(
      shift.id,
      20.0,
      'Ingreso adicional de monedas para cambio',
    );
    expect(floatIn.type).toBe('FLOAT_IN');
    expect(floatIn.amount.toDecimal()).toBe(20.0);
  });

  it('debe calcular síncronamente el efectivo esperado y ejecutar el arqueo ciego sin descuadre', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    // Movimientos de caja
    await cashService.recordExpense(shift.id, 15.0, 'Compra hielo', supervisorUserId);
    await cashService.recordCashDrop(shift.id, 50.0, 'Retiro bóveda', supervisorUserId);
    await cashService.recordFloatIn(shift.id, 20.0, 'Monedas sencillo');

    // Registrar ventas en efectivo a través del puerto
    await cashService.recordCashPayment(shift.id, Money.fromDecimal(17.0));
    await cashService.recordCashPayment(shift.id, Money.fromDecimal(35.5));

    // Cálculo síncrono del sistema:
    // 100.00 (Fondo) + 52.50 (Ventas) - 15.00 (Gasto) - 50.00 (Retiro) + 20.00 (Entrada) = 107.50
    const calc = await cashService.calculateExpectedCash(shift.id);
    expect(calc.initialCash.toDecimal()).toBe(100.0);
    expect(calc.cashSalesTotal.toDecimal()).toBe(52.5);
    expect(calc.expensesTotal.toDecimal()).toBe(15.0);
    expect(calc.cashDropsTotal.toDecimal()).toBe(50.0);
    expect(calc.floatInsTotal.toDecimal()).toBe(20.0);
    expect(calc.expectedCash.toDecimal()).toBe(107.5);

    // Arqueo ciego: Cajero cuenta dinero y declara S/ 107.50
    const summary = await cashService.closeShift(shift.id, 107.5, cashierUserId);

    expect(summary.declaredCash.toDecimal()).toBe(107.5);
    expect(summary.expectedCash.toDecimal()).toBe(107.5);
    expect(summary.difference.toDecimal()).toBe(0.0);
    expect(summary.isExact).toBe(true);

    // Verificar que se emitió el evento shift.closed.v1 al outbox
    const pendingEvents = await outboxStorage.findPending(10);
    expect(pendingEvents.length).toBe(1);
    expect(pendingEvents[0].eventType).toBe('shift.closed.v1');

    const eventPayload = JSON.parse(pendingEvents[0].payload);
    expect(eventPayload.payload.shiftId).toBe(shift.id);
    expect(eventPayload.payload.expectedCash).toBe(107.5);
    expect(eventPayload.payload.declaredCash).toBe(107.5);
    expect(eventPayload.payload.difference).toBe(0.0);
  });

  it('debe registrar el descuadre si la declaración del cajero difiere del esperado', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);
    await cashService.recordCashPayment(shift.id, Money.fromDecimal(50.0));

    // Esperado: 100 + 50 = S/ 150.00
    // Cajero declara S/ 147.00 (faltante de S/ 3.00)
    const summary = await cashService.closeShift(
      shift.id,
      147.0,
      cashierUserId,
      supervisorUserId,
    );

    expect(summary.expectedCash.toDecimal()).toBe(150.0);
    expect(summary.declaredCash.toDecimal()).toBe(147.0);
    expect(summary.difference.toDecimal()).toBe(-3.0);
    expect(summary.isExact).toBe(false);
  });

  it('debe rechazar operaciones y cobros cuando la caja está cerrada', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);
    await cashService.closeShift(shift.id, 100.0, cashierUserId);

    // Intentar registrar un gasto posterior al cierre
    await expect(
      cashService.recordExpense(shift.id, 10.0, 'Taxis', supervisorUserId),
    ).rejects.toThrow('No se pueden registrar movimientos en un turno inexistente o cerrado');

    // Intentar cerrar por segunda vez
    await expect(
      cashService.closeShift(shift.id, 100.0, cashierUserId),
    ).rejects.toThrow('El turno ya fue cerrado previamente');
  });
});
