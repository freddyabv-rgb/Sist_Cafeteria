import * as fs from 'fs';
import * as path from 'path';
import { InMemoryCatalogRepository } from '../src/modules/catalog/infra/catalog.in-memory.repository';
import { CsvImporterService } from '../src/modules/catalog/services/csv-importer.service';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { PricingService } from '../src/modules/catalog/services/pricing.service';
import { InMemoryCashRepository } from '../src/modules/cash/infra/cash.in-memory.repository';
import { CashService } from '../src/modules/cash/services/cash.service';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { PrintBridgeService } from '../src/platform/print-bridge/print-bridge.service';
import { AuthService } from '../src/platform/auth/auth.service';
import { AuditService } from '../src/platform/audit/audit.service';
import { InMemorySalesRepository } from '../src/modules/sales/infra/sales.in-memory.repository';
import { SalesService } from '../src/modules/sales/services/sales.service';

describe('Paso 7: Módulo de Correcciones, Permisos y Auditoría', () => {
  let catalogRepo: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let catalogService: CatalogService;
  let pricingService: PricingService;

  let cashRepo: InMemoryCashRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let cashService: CashService;

  let printBridge: PrintBridgeService;
  let authService: AuthService;
  let auditService: AuditService;
  let salesRepo: InMemorySalesRepository;
  let salesService: SalesService;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-mostrador-c1';
  const cashierUserId = 'usr-cajero-maria';
  const supervisorUserId = 'usr-sup-carlos';

  beforeEach(async () => {
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    printBridge = new PrintBridgeService();

    authService = new AuthService();
    auditService = new AuditService();

    // Crear usuarios de prueba con PIN hasheado
    authService.createUserWithPin(cashierUserId, testStoreId, 'María Gómez', 'CASHIER', '1234');
    authService.createUserWithPin(supervisorUserId, testStoreId, 'Carlos Supervisor', 'SUPERVISOR', '8888');

    catalogRepo = new InMemoryCatalogRepository();
    csvImporter = new CsvImporterService(catalogRepo);
    catalogService = new CatalogService(catalogRepo, csvImporter);
    pricingService = new PricingService();

    const csvPath = path.join(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await catalogService.importFromCsv(testStoreId, csvContent);

    cashRepo = new InMemoryCashRepository();
    cashService = new CashService(cashRepo, outboxWriter);

    salesRepo = new InMemorySalesRepository();
    salesService = new SalesService(
      salesRepo,
      cashService,
      catalogService,
      pricingService,
      outboxWriter,
      printBridge,
      authService,
      auditService,
    );
  });

  it('debe validar la autorización por PIN de Supervisor rechazando roles sin privilegios o PIN erróneo', () => {
    // 1. PIN de cajero normal (rol CASHIER) intentando autorizar acción de supervisor
    expect(() =>
      authService.authorizeSupervisorAction(testStoreId, '1234'),
    ).toThrow('no cuenta con permisos');

    // 2. PIN inexistente
    expect(() =>
      authService.authorizeSupervisorAction(testStoreId, '0000'),
    ).toThrow('PIN de supervisor inválido');

    // 3. PIN de supervisor correcto (rol SUPERVISOR)
    const supervisor = authService.authorizeSupervisorAction(testStoreId, '8888');
    expect(supervisor.id).toBe(supervisorUserId);
    expect(supervisor.name).toBe('Carlos Supervisor');
  });

  it('debe anular un pedido pagado en efectivo con PIN de supervisor, ajustar la caja y registrar en AUDIT_LOG', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const americano = products.find((p) => p.name === 'Americano')!;
    const americano8oz = americano.variants[0]; // S/ 8.00

    // Venta en efectivo de S/ 8.00
    const order = await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'void-test-sale-01',
      items: [{ productId: americano.id, variantId: americano8oz.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 8.0, cashTendered: 10.0 }],
    });

    // La caja tiene S/ 108.00 (Fondo 100 + Venta 8)
    let shiftCalc = await cashService.calculateExpectedCash(shift.id);
    expect(shiftCalc.expectedCash.toDecimal()).toBe(108.0);

    // Cliente cancela inmediatamente. Intentar anular sin motivo debe fallar
    await expect(
      salesService.voidOrder({
        orderId: order.id,
        reason: '',
        supervisorPin: '8888',
      }),
    ).rejects.toThrow('El motivo de anulación es obligatorio');

    // Anulación formal con motivo y PIN de supervisor
    const voidedOrder = await salesService.voidOrder({
      orderId: order.id,
      reason: 'Cliente canceló por emergencia personal',
      supervisorPin: '8888',
      deviceInfo: 'Tablet Mostrador 01',
    });

    expect(voidedOrder.status).toBe('CANCELLED');
    expect(voidedOrder.paymentStatus).toBe('VOIDED');
    expect(voidedOrder.voidReason).toBe('Cliente canceló por emergencia personal');
    expect(voidedOrder.voidedByUserId).toBe(supervisorUserId);

    // La caja se ajusta síncronamente devolviendo el efectivo (vuelve a S/ 100.00)
    shiftCalc = await cashService.calculateExpectedCash(shift.id);
    expect(shiftCalc.expectedCash.toDecimal()).toBe(100.0);

    // Verificar que se emitió el evento de compensación order.voided.v1 en Outbox
    const pendingEvents = await outboxStorage.findPending(10);
    const voidEvent = pendingEvents.find((e) => e.eventType === 'order.voided.v1');
    expect(voidEvent).toBeDefined();

    const voidPayload = JSON.parse(voidEvent!.payload);
    expect(voidPayload.payload.orderId).toBe(order.id);
    expect(voidPayload.payload.totalVoidedAmount).toBe(8.0);
    expect(voidPayload.payload.approvedByUserId).toBe(supervisorUserId);

    // Verificar registro inmutable en AUDIT_LOG
    const auditLogs = await auditService.getLogsByEntity(order.id);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].action).toBe('VOID_ORDER');
    expect(auditLogs[0].userId).toBe(supervisorUserId);
    expect(auditLogs[0].afterState!['refundedCash']).toBe(8.0);
  });

  it('debe realizar la devolución parcial de un ítem devuelto ajustando la caja y emitiendo order.refunded.v1', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const americano = products.find((p) => p.name === 'Americano')!;
    const croissant = products.find((p) => p.name === 'Croissant de Almendras')!;

    // Pedido: Americano (S/ 8.00) + Croissant (S/ 11.00) = Total S/ 19.00
    const order = await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'DINE_IN',
      idempotencyKey: 'refund-item-test-01',
      items: [
        { productId: americano.id, variantId: americano.variants[0].id, quantity: 1 },
        { productId: croissant.id, variantId: croissant.variants[0].id, quantity: 1 },
      ],
      payments: [{ method: 'CASH', amount: 19.0, cashTendered: 20.0 }],
    });

    const croissantItem = order.items.find((i) => i.productName === 'Croissant de Almendras')!;

    // Devolución del croissant con PIN de supervisor
    const refundedOrder = await salesService.refundOrderItem({
      orderId: order.id,
      orderItemId: croissantItem.id,
      reason: 'Error en vitrina, cliente devolvió el producto intacto',
      supervisorPin: '8888',
    });

    expect(refundedOrder.paymentStatus).toBe('PARTIALLY_REFUNDED');
    const refundedItem = refundedOrder.items.find((i) => i.id === croissantItem.id)!;
    expect(refundedItem.status).toBe('VOIDED');

    // La caja descuenta los S/ 11.00 del croissant devuelto: 100 (Fondo) + 19 - 11 = S/ 108.00
    const shiftCalc = await cashService.calculateExpectedCash(shift.id);
    expect(shiftCalc.expectedCash.toDecimal()).toBe(108.0);

    // Evento order.refunded.v1 emitido al Outbox
    const pendingEvents = await outboxStorage.findPending(10);
    const refundEvent = pendingEvents.find((e) => e.eventType === 'order.refunded.v1');
    expect(refundEvent).toBeDefined();

    const refundPayload = JSON.parse(refundEvent!.payload);
    expect(refundPayload.payload.orderId).toBe(order.id);
    expect(refundPayload.payload.refundAmount).toBe(11.0);
    expect(refundPayload.payload.productName).toBe('Croissant de Almendras');

    // Auditoría registrada
    const auditLogs = await auditService.getLogsByEntity(croissantItem.id);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].action).toBe('REFUND_ITEM');
  });

  it('debe aplicar descuentos comerciales autorizados por supervisor y registrar en auditoría', async () => {
    await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const toston = products.find((p) => p.name === 'Tostón con Palta')!; // S/ 16.00

    // Descuento del 20% (S/ 3.20 de descuento -> Total a pagar S/ 12.80)
    // Sin PIN de supervisor debe fallar
    await expect(
      salesService.createAndPayOrder({
        storeId: testStoreId,
        registerId: testRegisterId,
        cashierUserId,
        orderType: 'TAKEAWAY',
        idempotencyKey: 'disc-fail-pin',
        items: [{ productId: toston.id, variantId: toston.variants[0].id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 12.8 }],
        discount: {
          type: 'PERCENTAGE',
          value: 20,
          reason: 'Convenio Institucional',
        },
      }),
    ).rejects.toThrow('Descuentos mayores al 10% requieren PIN de supervisor');

    // Con PIN de supervisor correcto
    const order = await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'disc-success-pin',
      items: [{ productId: toston.id, variantId: toston.variants[0].id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 12.8, cashTendered: 20.0 }],
      discount: {
        type: 'PERCENTAGE',
        value: 20,
        reason: 'Convenio Institucional',
        supervisorPin: '8888',
      },
    });

    expect(order.discountTotal.toDecimal()).toBe(3.2);
    expect(order.total.toDecimal()).toBe(12.8);

    // Auditoría de descuento grabada
    const auditLogs = await auditService.getLogsByEntity(order.id);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].action).toBe('DISCOUNT_APPLIED');
    expect(auditLogs[0].afterState!['discountTotal']).toBe(3.2);
  });
});
