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
import { CreateOrderCommand } from '../src/modules/sales/api/create-order.dto';

describe('Paso 6: Pagos Digitales, Mixtos y Registro de Propinas', () => {
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
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    printBridge = new PrintBridgeService();

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
    );
  });

  it('debe procesar un pago con Billetera Digital (Yape) con número de operación sin alterar la gaveta de efectivo', async () => {
    // 1. Abrir caja con fondo de S/ 100.00
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const frappe = products.find((p) => p.name === 'Frappé de Moka')!;
    const frappe16oz = frappe.variants.find((v) => v.name === '16oz')!;

    const toston = products.find((p) => p.name === 'Tostón con Palta')!;
    const tostonPortion = toston.variants[0];

    // Total: S/ 16.00 + S/ 16.00 = S/ 32.00
    const command: CreateOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      orderType: 'DINE_IN',
      customerName: 'Rodrigo Paz',
      idempotencyKey: 'yape-pay-001',
      items: [
        { productId: frappe.id, variantId: frappe16oz.id, quantity: 1 },
        { productId: toston.id, variantId: tostonPortion.id, quantity: 1 },
      ],
      payments: [
        {
          method: 'DIGITAL_WALLET',
          provider: 'YAPE',
          reference: 'OP-89241',
          amount: 32.0,
        },
      ],
    };

    const order = await salesService.createAndPayOrder(command);
    expect(order.isPaid()).toBe(true);
    expect(order.total.toDecimal()).toBe(32.0);
    expect(order.payments[0].method).toBe('DIGITAL_WALLET');
    expect(order.payments[0].provider).toBe('YAPE');
    expect(order.payments[0].reference).toBe('OP-89241');

    // La gaveta de efectivo en caja NO debe incrementarse (sigue en S/ 100.00)
    const expected = await cashService.calculateExpectedCash(shift.id);
    expect(expected.expectedCash.toDecimal()).toBe(100.0);
    expect(expected.breakdown.digitalWalletSales.toDecimal()).toBe(32.0);
    expect(expected.breakdown.cashSales.toDecimal()).toBe(0.0);
  });

  it('debe registrar un pago con Tarjeta (POS) y registrar propina voluntaria sin afectar el IGV', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const cappuccino = products.find((p) => p.name === 'Cappuccino')!;
    const cap12oz = cappuccino.variants.find((v) => v.name === '12oz')!; // S/ 12.00

    const command: CreateOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'card-tip-001',
      items: [
        { productId: cappuccino.id, variantId: cap12oz.id, quantity: 1 },
      ],
      payments: [
        {
          method: 'CARD',
          provider: 'VISA',
          reference: 'VCH-9941',
          amount: 12.0,
          tipAmount: 3.0, // Propina voluntaria de S/ 3.00
        },
      ],
    };

    const order = await salesService.createAndPayOrder(command);
    expect(order.total.toDecimal()).toBe(12.0);
    expect(order.tipTotal.toDecimal()).toBe(3.0);

    // IGV calculado solo sobre el café (S/ 12.00 / 1.18 = 10.17 subtotal, 1.83 IGV)
    expect(order.subtotal.toDecimal()).toBe(10.17);
    expect(order.taxTotal.toDecimal()).toBe(1.83);

    // En caja: ventas con tarjeta S/ 12.00, propinas S/ 3.00
    const expected = await cashService.calculateExpectedCash(shift.id);
    expect(expected.breakdown.cardSales.toDecimal()).toBe(12.0);
    expect(expected.breakdown.totalTips.toDecimal()).toBe(3.0);
  });

  it('debe procesar un pago mixto (Split Payment: Mitad Efectivo + Mitad Plin) con cálculo de vuelto', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const gelato = products.find((p) => p.name === 'Gelato Doble')!;
    const gelato2Bolas = gelato.variants[0]; // S/ 15.00

    // Pedido: 2 Gelatos Dobles = S/ 30.00
    // Pago 1: S/ 10.00 en efectivo (entregó billete de S/ 20.00 -> Vuelto: S/ 10.00)
    // Pago 2: S/ 20.00 con Plin (Referencia PLIN-551)
    const command: CreateOrderCommand = {
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'DINE_IN',
      customerName: 'Familia Morales',
      idempotencyKey: 'split-payment-001',
      items: [
        { productId: gelato.id, variantId: gelato2Bolas.id, quantity: 2 },
      ],
      payments: [
        {
          method: 'CASH',
          amount: 10.0,
          cashTendered: 20.0, // Vuelto S/ 10.00
        },
        {
          method: 'DIGITAL_WALLET',
          provider: 'PLIN',
          reference: 'PLIN-551',
          amount: 20.0,
        },
      ],
    };

    const order = await salesService.createAndPayOrder(command);
    expect(order.total.toDecimal()).toBe(30.0);
    expect(order.payments.length).toBe(2);

    const cashPay = order.payments.find((p) => p.method === 'CASH')!;
    expect(cashPay.amount.toDecimal()).toBe(10.0);
    expect(cashPay.cashTendered!.toDecimal()).toBe(20.0);
    expect(cashPay.changeDue!.toDecimal()).toBe(10.0);

    const plinPay = order.payments.find((p) => p.method === 'DIGITAL_WALLET')!;
    expect(plinPay.amount.toDecimal()).toBe(20.0);
    expect(plinPay.provider).toBe('PLIN');

    // La gaveta de efectivo solo debe sumar los S/ 10.00 de efectivo
    const expected = await cashService.calculateExpectedCash(shift.id);
    // Fondo S/ 100 + S/ 10 Efectivo = S/ 110.00
    expect(expected.expectedCash.toDecimal()).toBe(110.0);
    expect(expected.breakdown.digitalWalletSales.toDecimal()).toBe(20.0);
  });

  it('debe generar el Cierre Z con desglose financiero exacto por medio de pago para conciliación bancaria', async () => {
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const americano = products.find((p) => p.name === 'Americano')!;
    const americano8oz = americano.variants[0]; // S/ 8.00

    // Venta 1: Efectivo S/ 8.00
    await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'z-sale-1',
      items: [{ productId: americano.id, variantId: americano8oz.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 8.0, cashTendered: 10.0 }],
    });

    // Venta 2: Yape S/ 16.00
    await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'z-sale-2',
      items: [{ productId: americano.id, variantId: americano8oz.id, quantity: 2 }],
      payments: [{ method: 'DIGITAL_WALLET', provider: 'YAPE', reference: 'Y-101', amount: 16.0 }],
    });

    // Venta 3: Tarjeta S/ 8.00 + Propina S/ 2.00
    await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      cashierUserId,
      orderType: 'TAKEAWAY',
      idempotencyKey: 'z-sale-3',
      items: [{ productId: americano.id, variantId: americano8oz.id, quantity: 1 }],
      payments: [{ method: 'CARD', provider: 'MASTERCARD', reference: 'V-202', amount: 8.0, tipAmount: 2.0 }],
    });

    // Cierre Z: Cajero declara el efectivo exacto en gaveta (Fondo S/ 100 + Venta efectivo S/ 8 = S/ 108.00)
    const summary = await cashService.closeShift(shift.id, 108.0, cashierUserId);

    expect(summary.declaredCash.toDecimal()).toBe(108.0);
    expect(summary.expectedCash.toDecimal()).toBe(108.0);
    expect(summary.difference.toDecimal()).toBe(0.0);
    expect(summary.isExact).toBe(true);

    // Conciliación de otros medios de pago
    expect(summary.cashSalesTotal.toDecimal()).toBe(8.0);
    expect(summary.digitalWalletSalesTotal.toDecimal()).toBe(16.0);
    expect(summary.cardSalesTotal.toDecimal()).toBe(8.0);
    expect(summary.totalTips.toDecimal()).toBe(2.0);
    expect(summary.grossSalesTotal.toDecimal()).toBe(32.0); // 8 + 16 + 8
  });
});
