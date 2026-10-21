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
import { ReportsService } from '../src/modules/reports/services/reports.service';

describe('Paso 8: Reportes Básicos Operativos y Cierre Z Diario', () => {
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
  let reportsService: ReportsService;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-mostrador-c1';
  const cashierUserId = 'usr-cajero-maria';
  const supervisorUserId = 'usr-sup-carlos';
  const testDateStr = '2026-10-11';

  beforeEach(async () => {
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    printBridge = new PrintBridgeService();

    authService = new AuthService();
    auditService = new AuditService();
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

    reportsService = new ReportsService(salesRepo, cashRepo);
  });

  it('debe simular una jornada real de cafetería y generar el reporte diario, ranking de productos y horas pico', async () => {
    // 1. Apertura de caja matutina con fondo de S/ 100.00
    const shift = await cashService.openShift(testStoreId, testRegisterId, cashierUserId, 100.0);

    const products = await catalogService.getProducts(testStoreId);
    const americano = products.find((p) => p.name === 'Americano')!;
    const croissant = products.find((p) => p.name === 'Croissant Clásico')!;
    const latte = products.find((p) => p.name === 'Latte')!;
    const oatMilkOption = latte.modifierGroups
      .find((g) => g.name === 'Tipo de Leche')!
      .options.find((o) => o.name === 'Leche de Avena')!;
    const cappuccino = products.find((p) => p.name === 'Cappuccino')!;
    const toston = products.find((p) => p.name === 'Tostón con Palta')!;
    const gelato = products.find((p) => p.name === 'Gelato Doble')!;
    const tiramisu = products.find((p) => p.name === 'Tiramisú Tradicional')!;
    const coldBrew = products.find((p) => p.name === 'Cold Brew')!;

    // Helper para simular pedidos con hora específica
    const createOrderAtHour = async (
      idempotencyKey: string,
      items: any[],
      payments: any[],
      orderType: 'TAKEAWAY' | 'DINE_IN',
      isoTimeStr: string,
    ) => {
      const order = await salesService.createAndPayOrder({
        storeId: testStoreId,
        registerId: testRegisterId,
        cashierUserId,
        orderType,
        idempotencyKey,
        items,
        payments,
      });
      // Ajustar paidAt para simular la hora del día en la jornada
      order.paidAt = new Date(isoTimeStr);
      order.createdAt = new Date(isoTimeStr);
      await salesRepo.saveOrder(order);
      return order;
    };

    // --- HORAS PICAS MATUTINAS (08:00 - 09:30) ---
    // Pedido 1 (08:15): Americano 8oz (S/ 8.00) + Croissant (S/ 7.50) = S/ 15.50 (Efectivo)
    await createOrderAtHour(
      'order-0815',
      [
        { productId: americano.id, variantId: americano.variants[0].id, quantity: 1 },
        { productId: croissant.id, variantId: croissant.variants[0].id, quantity: 1 },
      ],
      [{ method: 'CASH', amount: 15.5, cashTendered: 20.0 }],
      'TAKEAWAY',
      `${testDateStr}T08:15:00.000Z`,
    );

    // Pedido 2 (08:45): 2 Lattes 12oz con Avena (2 x S/ 14.50 = S/ 29.00) (Yape)
    await createOrderAtHour(
      'order-0845',
      [
        {
          productId: latte.id,
          variantId: latte.variants.find((v) => v.name === '12oz')!.id,
          quantity: 2,
          modifiers: [{ modifierOptionId: oatMilkOption.id, quantity: 1 }],
        },
      ],
      [{ method: 'DIGITAL_WALLET', provider: 'YAPE', reference: 'Y-0845', amount: 29.0 }],
      'TAKEAWAY',
      `${testDateStr}T08:45:00.000Z`,
    );

    // Pedido 3 (09:20): 1 Cappuccino 12oz (S/ 12.00) + Propina S/ 3.00 (Visa)
    await createOrderAtHour(
      'order-0920',
      [
        {
          productId: cappuccino.id,
          variantId: cappuccino.variants.find((v) => v.name === '12oz')!.id,
          quantity: 1,
        },
      ],
      [{ method: 'CARD', provider: 'VISA', reference: 'V-0920', amount: 12.0, tipAmount: 3.0 }],
      'DINE_IN',
      `${testDateStr}T09:20:00.000Z`,
    );

    // --- MEDIODÍA (12:30) ---
    // Pedido 4: 1 Tostón con Palta (S/ 16.00) (Efectivo)
    await createOrderAtHour(
      'order-1230',
      [{ productId: toston.id, variantId: toston.variants[0].id, quantity: 1 }],
      [{ method: 'CASH', amount: 16.0, cashTendered: 20.0 }],
      'DINE_IN',
      `${testDateStr}T12:30:00.000Z`,
    );

    // --- HORA PICO VESPERTINA (16:30 - 17:30) ---
    // Pedido 5 (16:45): 2 Gelatos Dobles (2 x S/ 15.00 = S/ 30.00) (Plin)
    await createOrderAtHour(
      'order-1645',
      [{ productId: gelato.id, variantId: gelato.variants[0].id, quantity: 2 }],
      [{ method: 'DIGITAL_WALLET', provider: 'PLIN', reference: 'P-1645', amount: 30.0 }],
      'DINE_IN',
      `${testDateStr}T16:45:00.000Z`,
    );

    // Pedido 6 (17:15): 1 Tiramisú (S/ 15.00) + 1 Cold Brew (S/ 12.00) = S/ 27.00 (Efectivo)
    await createOrderAtHour(
      'order-1715',
      [
        { productId: tiramisu.id, variantId: tiramisu.variants[0].id, quantity: 1 },
        { productId: coldBrew.id, variantId: coldBrew.variants[0].id, quantity: 1 },
      ],
      [{ method: 'CASH', amount: 27.0, cashTendered: 30.0 }],
      'TAKEAWAY',
      `${testDateStr}T17:15:00.000Z`,
    );

    // Movimiento menor en caja: Compra de hielo S/ 15.00
    await cashService.recordExpense(shift.id, 15.0, 'Bolsa de hielo', supervisorUserId);

    // 2. VALIDACIÓN DEL REPORTE DIARIO DE VENTAS
    const dailyReport = await reportsService.getDailySalesReport(testStoreId, testDateStr);

    expect(dailyReport.metrics.orderCount).toBe(6);
    expect(dailyReport.metrics.itemsCount).toBe(9); // 2 + 2 + 1 + 1 + 2 + 2

    // Ventas netas: 15.50 + 29.00 + 12.00 + 16.00 + 30.00 + 27.00 = S/ 129.50
    expect(dailyReport.metrics.netSales).toBe(129.5);
    expect(dailyReport.metrics.tipsTotal).toBe(3.0);

    // Desglose tributario: Subtotal + IGV = 129.50
    expect(
      Math.round((dailyReport.metrics.subtotalTaxable + dailyReport.metrics.taxIgv) * 100) / 100,
    ).toBe(129.5);

    // Ticket promedio: 129.50 / 6 = S/ 21.58
    expect(dailyReport.metrics.averageTicket).toBe(21.58);

    // Desglose de pagos:
    // Efectivo: 15.50 + 16.00 + 27.00 = S/ 58.50
    expect(dailyReport.byPaymentMethod.cash).toBe(58.5);
    // Billeteras digitales: 29.00 (Yape) + 30.00 (Plin) = S/ 59.00
    expect(dailyReport.byPaymentMethod.digitalWallets).toBe(59.0);
    // Tarjetas: S/ 12.00
    expect(dailyReport.byPaymentMethod.cards).toBe(12.0);

    // 3. VALIDACIÓN DEL RANKING TOP PRODUCTOS
    const topProducts = await reportsService.getTopProductsReport(testStoreId, testDateStr, 5);
    expect(topProducts.length).toBeGreaterThanOrEqual(4);

    // Gelato Doble (2 unidades x S/ 15 = S/ 30.00) y Latte (2 unidades x S/ 14.50 = S/ 29.00)
    expect(topProducts[0].productName).toBe('Gelato Doble');
    expect(topProducts[0].revenue).toBe(30.0);
    expect(topProducts[0].unitsSold).toBe(2);

    expect(topProducts[1].productName).toBe('Latte');
    expect(topProducts[1].revenue).toBe(29.0);

    // 4. VALIDACIÓN DEL ANÁLISIS DE VENTAS POR HORA (HORAS PICO)
    const hourlyAnalysis = await reportsService.getHourlySalesAnalysis(testStoreId, testDateStr);
    expect(hourlyAnalysis.length).toBe(24);

    const morningHour8 = hourlyAnalysis.find((h) => h.hour === 8)!;
    expect(morningHour8.orderCount).toBe(2);
    expect(morningHour8.revenue).toBe(44.5); // 15.50 + 29.00
    expect(morningHour8.isPeakHour).toBe(true);

    const afternoonHour16 = hourlyAnalysis.find((h) => h.hour === 16)!;
    expect(afternoonHour16.orderCount).toBe(1);
    expect(afternoonHour16.revenue).toBe(30.0);
    expect(afternoonHour16.isPeakHour).toBe(true);

    // 5. VALIDACIÓN DEL CIERRE Z Y CONCILIACIÓN
    // Efectivo en gaveta física: Fondo S/ 100 + Ventas Efectivo S/ 58.50 - Hielo S/ 15.00 = S/ 143.50
    const shiftSummary = await cashService.closeShift(shift.id, 143.5, cashierUserId);

    expect(shiftSummary.expectedCash.toDecimal()).toBe(143.5);
    expect(shiftSummary.declaredCash.toDecimal()).toBe(143.5);
    expect(shiftSummary.difference.toDecimal()).toBe(0.0);
    expect(shiftSummary.isExact).toBe(true);

    // Conciliación formal: la venta bruta de caja coincide exactamente con el reporte diario
    expect(shiftSummary.grossSalesTotal.toDecimal()).toBe(dailyReport.metrics.netSales);
  });
});
