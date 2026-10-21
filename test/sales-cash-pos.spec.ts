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
import { InMemorySalesRepository } from '../src/modules/sales/infra/sales.in-memory.repository';
import { SalesService } from '../src/modules/sales/services/sales.service';
import { CreateCashOrderCommand } from '../src/modules/sales/api/create-cash-order.dto';

describe('Paso 3: POS de Mostrador — Venta en Efectivo y Emisión de Ticket (HITO DEMO REAL)', () => {
  let catalogRepo: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let catalogService: CatalogService;
  let pricingService: PricingService;

  let cashRepo: InMemoryCashRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let cashService: CashService;

  let printBridge: PrintBridgeService;
  let salesRepo: InMemorySalesRepository;
  let salesService: SalesService;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-mostrador-c1';
  const cashierUserId = 'usr-cajero-maria';

  beforeEach(async () => {
    // 1. Inicializar infraestructura y Outbox
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    printBridge = new PrintBridgeService(); // opera en modo 'mock' por defecto

    // 2. Inicializar Catálogo y cargar menú real de Benevento
    catalogRepo = new InMemoryCatalogRepository();
    csvImporter = new CsvImporterService(catalogRepo);
    catalogService = new CatalogService(catalogRepo, csvImporter);
    pricingService = new PricingService();

    const csvPath = path.join(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await catalogService.importFromCsv(testStoreId, csvContent);

    // 3. Inicializar Caja
    cashRepo = new InMemoryCashRepository();
    cashService = new CashService(cashRepo, outboxWriter);

    // 4. Inicializar Ventas
    salesRepo = new InMemorySalesRepository();
    salesService = new SalesService(
      salesRepo,
      cashService, // Implementa CashShiftPort
      catalogService,
      pricingService,
      outboxWriter,
      printBridge,
    );
  });

  it('debe completar el flujo de venta en efectivo, correlativo C1-0001, registro en caja y Outbox', async () => {
    // A. Abrir turno de caja con fondo inicial de S/ 100.00
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);
    expect(shift.isOpen()).toBe(true);

    // B. Obtener IDs de productos del menú
    const products = await catalogService.getProducts(testStoreId);
    const latte = products.find((p) => p.name === 'Latte')!;
    const latte12oz = latte.variants.find((v) => v.name === '12oz')!;
    const oatMilkOption = latte.modifierGroups
      .find((g) => g.name === 'Tipo de Leche')!
      .options.find((o) => o.name === 'Leche de Avena')!;
    const extraShotOption = latte.modifierGroups
      .find((g) => g.name === 'Extras de Café')!
      .options.find((o) => o.name === 'Extra Shot Espresso')!;

    const croissant = products.find((p) => p.name === 'Croissant Clásico')!;
    const croissantUnit = croissant.variants.find((v) => v.name === 'Unidad')!;

    // C. Armar comando de cobro rápido de mostrador:
    // Ítem 1: 1 Latte 12oz (S/ 12.00) + Leche Avena (S/ 2.50) + 1 Shot Extra (S/ 3.00) = S/ 17.50
    // Ítem 2: 1 Croissant Clásico (S/ 7.50)
    // Total = S/ 25.00. Efectivo entregado: S/ 50.00 -> Vuelto: S/ 25.00
    const command: CreateCashOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      cashierName: 'María Gómez',
      orderType: 'TAKEAWAY',
      customerName: 'Alejandro Rossi',
      idempotencyKey: 'pos-touch-event-0001',
      cashTendered: 50.0,
      items: [
        {
          productId: latte.id,
          variantId: latte12oz.id,
          quantity: 1,
          modifiers: [
            { modifierOptionId: oatMilkOption.id, quantity: 1 },
            { modifierOptionId: extraShotOption.id, quantity: 1 },
          ],
        },
        {
          productId: croissant.id,
          variantId: croissantUnit.id,
          quantity: 1,
        },
      ],
    };

    // D. Ejecutar cobro rápido en mostrador
    const order = await salesService.createAndPayCashOrder(command);

    // 1. Verificación de la orden
    expect(order.orderNumber).toBe('C1-0001');
    expect(order.isPaid()).toBe(true);
    expect(order.total.toDecimal()).toBe(25.0);
    expect(order.total.format()).toBe('S/ 25.00');

    // Desglose IGV 18%: 25.00 / 1.18 = 21.19, IGV = 3.81
    expect(order.subtotal.toDecimal()).toBe(21.19);
    expect(order.taxTotal.toDecimal()).toBe(3.81);

    // 2. Verificación de pago y vuelto
    expect(order.payments.length).toBe(1);
    const payment = order.payments[0];
    expect(payment.method).toBe('CASH');
    expect(payment.amount.toDecimal()).toBe(25.0);
    expect(payment.cashTendered!.toDecimal()).toBe(50.0);
    expect(payment.changeDue!.toDecimal()).toBe(25.0);

    // 3. Verificación de enrutamiento por estación
    expect(order.items.length).toBe(2);
    const itemBarra = order.items.find((i) => i.productName === 'Latte')!;
    expect(itemBarra.station).toBe('BARRA');
    expect(itemBarra.modifiers.length).toBe(2);
    expect(itemBarra.modifiers[0].highlightKds).toBe(true);

    const itemVitrina = order.items.find((i) => i.productName === 'Croissant Clásico')!;
    expect(itemVitrina.station).toBe('VITRINA');

    // 4. Verificación de sincronización con la Caja
    const shiftSales = await cashRepo.getCashSalesTotal(shift.id);
    expect(shiftSales.toDecimal()).toBe(25.0);

    const shiftExpected = await cashService.calculateExpectedCash(shift.id);
    // Fondo S/ 100 + Venta S/ 25 = S/ 125.00
    expect(shiftExpected.expectedCash.toDecimal()).toBe(125.0);

    // 5. Verificación de emisión de evento 'order.paid.v1' al Transactional Outbox
    const pendingEvents = await outboxStorage.findPending(10);
    expect(pendingEvents.length).toBe(1);
    expect(pendingEvents[0].eventType).toBe('order.paid.v1');

    const eventData = JSON.parse(pendingEvents[0].payload);
    expect(eventData.payload.orderNumber).toBe('C1-0001');
    expect(eventData.payload.customerName).toBe('Alejandro Rossi');
    expect(eventData.payload.totals.total).toBe(25.0);
    expect(eventData.payload.items.length).toBe(2);
  });

  it('debe garantizar IDEMPOTENCIA: doble pulsación no duplica la orden ni suma doble en caja', async () => {
    await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const croissant = products.find((p) => p.name === 'Croissant Clásico')!;
    const croissantUnit = croissant.variants[0];

    const command: CreateCashOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'touch-double-click-key-123',
      cashTendered: 10.0,
      items: [
        {
          productId: croissant.id,
          variantId: croissantUnit.id,
          quantity: 1,
        },
      ],
    };

    // Primera pulsación de cobro
    const order1 = await salesService.createAndPayCashOrder(command);
    expect(order1.orderNumber).toBe('C1-0001');

    // Segunda pulsación con la misma clave (simulando doble toque accidental en pantalla táctil)
    const order2 = await salesService.createAndPayCashOrder(command);
    expect(order2.id).toBe(order1.id);
    expect(order2.orderNumber).toBe('C1-0001');

    // La caja debe tener solo 1 venta (S/ 7.50), NO duplicada
    const shift = (await cashService.getActiveShift(testStoreId, testRegisterId))!;
    const shiftSales = await cashRepo.getCashSalesTotal(shift.shiftId);
    expect(shiftSales.toDecimal()).toBe(7.5);
  });

  it('debe rechazar la venta si el efectivo entregado es menor al total a pagar', async () => {
    await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const croissant = products.find((p) => p.name === 'Croissant Clásico')!;
    const croissantUnit = croissant.variants[0];

    const command: CreateCashOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'fail-cash-tendered-01',
      cashTendered: 5.0, // Insuficiente para un croissant de S/ 7.50
      items: [
        {
          productId: croissant.id,
          variantId: croissantUnit.id,
          quantity: 1,
        },
      ],
    };

    await expect(salesService.createAndPayCashOrder(command)).rejects.toThrow(
      'Efectivo insuficiente',
    );
  });

  it('debe rechazar la venta si la caja no tiene un turno abierto', async () => {
    const products = await catalogService.getProducts(testStoreId);
    const croissant = products.find((p) => p.name === 'Croissant Clásico')!;

    const command: CreateCashOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'no-open-shift-order',
      cashTendered: 10.0,
      items: [
        {
          productId: croissant.id,
          variantId: croissant.variants[0].id,
          quantity: 1,
        },
      ],
    };

    await expect(salesService.createAndPayCashOrder(command)).rejects.toThrow(
      'No hay un turno de caja abierto para registrar operaciones',
    );
  });
});
