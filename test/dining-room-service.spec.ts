import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { InMemoryCatalogRepository } from '../src/modules/catalog/infra/catalog.in-memory.repository';
import { CsvImporterService } from '../src/modules/catalog/services/csv-importer.service';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { PricingService } from '../src/modules/catalog/services/pricing.service';
import { InMemoryCashRepository } from '../src/modules/cash/infra/cash.in-memory.repository';
import { CashService } from '../src/modules/cash/services/cash.service';
import { InMemorySalesRepository } from '../src/modules/sales/infra/sales.in-memory.repository';
import { SalesService } from '../src/modules/sales/services/sales.service';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { PrintBridgeService } from '../src/platform/print-bridge/print-bridge.service';
import { AuthService } from '../src/platform/auth/auth.service';
import { AuditService } from '../src/platform/audit/audit.service';
import { InMemoryDiningRepository } from '../src/modules/dining/infra/dining.in-memory.repository';
import { DiningService } from '../src/modules/dining/services/dining.service';

describe('Paso 13: Salón, Mesas y Cuentas Abiertas (Dining & Table Service)', () => {
  // Catálogo y Plataforma
  let catalogRepo: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let catalogService: CatalogService;
  let pricingService: PricingService;
  let cashRepo: InMemoryCashRepository;
  let cashService: CashService;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let outboxDispatcher: OutboxDispatcherService;
  let printBridge: PrintBridgeService;
  let authService: AuthService;
  let auditService: AuditService;
  let salesRepo: InMemorySalesRepository;
  let salesService: SalesService;

  // Salón y Mesas
  let diningRepo: InMemoryDiningRepository;
  let diningService: DiningService;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-caja-c1';
  const cashierUserId = 'usr-cajero-maria';
  const waiterUserId = 'usr-mozo-juan';

  beforeEach(async () => {
    // 1. Infraestructura Outbox & Plataforma
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);
    printBridge = new PrintBridgeService();
    authService = new AuthService();
    auditService = new AuditService();

    // 2. Catálogo oficial desde CSV de Benevento
    catalogRepo = new InMemoryCatalogRepository();
    pricingService = new PricingService();
    csvImporter = new CsvImporterService(catalogRepo);
    const csvPath = path.resolve(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await csvImporter.importFromCsv(testStoreId, csvContent);
    catalogService = new CatalogService(catalogRepo, pricingService);

    // 3. Caja
    cashRepo = new InMemoryCashRepository();
    cashService = new CashService(cashRepo, outboxWriter);

    // Abrir turno de caja
    await cashService.openShift({
      storeId: testStoreId,
      registerId: testRegisterId,
      userId: cashierUserId,
      initialCashDecimal: 100.0,
    });

    // 4. Ventas POS
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

    // 5. Salón y Mesas
    diningRepo = new InMemoryDiningRepository();
    diningService = new DiningService(
      diningRepo,
      catalogService,
      pricingService,
      salesService,
      outboxWriter,
      auditService,
    );
  });

  describe('1. Creación y Apertura de Mesas', () => {
    it('debe crear mesas en distintas zonas del salón y permitir abrir comanda a mesa disponible', async () => {
      // Crear mesas físicas
      const mesa1 = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M01',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      const mesaTerraza = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'T01',
        zone: 'TERRAZA',
        capacity: 2,
      });

      expect(mesa1.id).toBeDefined();
      expect(mesa1.status).toBe('AVAILABLE');
      expect(mesaTerraza.zone).toBe('TERRAZA');

      // Abrir cuenta de Mesa 1 (2 comensales, atiende Mozo Juan)
      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: mesa1.id,
        waiterUserId,
        waiterName: 'Juan Mesero',
        paxCount: 2,
        customerName: 'Familia Ramírez',
      });

      expect(tab.id).toBeDefined();
      expect(tab.status).toBe('OPEN');
      expect(tab.tableNumber).toBe('M01');
      expect(tab.paxCount).toBe(2);

      // Verificar que la mesa física pasó a estar OCCUPIED
      const updatedTable = await diningRepo.findTableById(mesa1.id);
      expect(updatedTable!.status).toBe('OCCUPIED');
      expect(updatedTable!.currentTabId).toBe(tab.id);

      // Verificar evento outbox emitido
      const events = await outboxStorage.findUnpublishedEvents();
      const openEvent = events.find((e) => e.eventType === 'table.opened.v1');
      expect(openEvent).toBeDefined();
      expect(openEvent!.payload.tableNumber).toBe('M01');
      expect(openEvent!.payload.paxCount).toBe(2);
    });

    it('debe rechazar la apertura de una mesa que ya está ocupada', async () => {
      const mesa = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M02',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      await diningService.openTableTab({
        storeId: testStoreId,
        tableId: mesa.id,
        waiterUserId,
        waiterName: 'Juan',
        paxCount: 2,
      });

      // Intentar abrir la misma mesa nuevamente
      await expect(
        diningService.openTableTab({
          storeId: testStoreId,
          tableId: mesa.id,
          waiterUserId: 'otro-mozo',
          waiterName: 'Pedro',
          paxCount: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Rondas Incrementales de Pedidos', () => {
    it('debe permitir agregar rondas continuas de bebidas y alimentos calculando precios y emitiendo órdenes a cocina/barra', async () => {
      const table = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M03',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: table.id,
        waiterUserId,
        waiterName: 'Juan Mesero',
        paxCount: 2,
      });

      // Obtener productos reales del catálogo
      const cappuccinoProduct = await catalogRepo.findProductByName(testStoreId, 'Cappuccino');
      const cap12oz = cappuccinoProduct!.variants.find((v) => v.name.includes('12oz'))!;
      const lecheGroup = cappuccinoProduct!.modifierGroups.find((g) => g.name.toLowerCase().includes('leche'))!;
      const avenaOption = lecheGroup.options.find((o) => o.name.toLowerCase().includes('avena'))!;

      const croissantProduct = await catalogRepo.findProductByName(testStoreId, 'Croissant Clásico');
      const croissantVariant = croissantProduct!.variants[0];

      // RONDA 1: 1 Cappuccino 12oz con Avena (S/ 12.00 base + S/ 3.00 avena = S/ 15.00) + 1 Croissant (S/ 7.50)
      const tabAfterR1 = await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [
          {
            productId: cappuccinoProduct!.id,
            variantId: cap12oz.id,
            quantity: 1,
            modifiers: [{ modifierOptionId: avenaOption.id, quantity: 1 }],
          },
          {
            productId: croissantProduct!.id,
            variantId: croissantVariant.id,
            quantity: 1,
          },
        ],
      });

      expect(tabAfterR1.items.length).toBe(2);
      expect(tabAfterR1.currentRoundNumber).toBe(1);
      expect(tabAfterR1.calculateTotal().toDecimal()).toBe(22.5); // 15.00 + 7.50

      // RONDA 2: El cliente pide un segundo pedido (1 Tostón con Palta - S/ 16.00)
      const tostonProduct = await catalogRepo.findProductByName(testStoreId, 'Tostón con Palta');
      const tostonVariant = tostonProduct!.variants[0];

      const tabAfterR2 = await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [
          {
            productId: tostonProduct!.id,
            variantId: tostonVariant.id,
            quantity: 1,
            notes: 'Sin cebolla, palta bien madura',
          },
        ],
      });

      expect(tabAfterR2.items.length).toBe(3);
      expect(tabAfterR2.currentRoundNumber).toBe(2);
      expect(tabAfterR2.calculateTotal().toDecimal()).toBe(38.5); // 22.50 + 16.00

      // Verificar que los ítems están etiquetados por su estación correspondiente
      const capItem = tabAfterR2.items.find((i) => i.productName.includes('Cappuccino'));
      const croissantItem = tabAfterR2.items.find((i) => i.productName.includes('Croissant'));
      const tostonItem = tabAfterR2.items.find((i) => i.productName.includes('Tostón'));

      expect(capItem!.station).toBe('BARRA');
      expect(croissantItem!.station).toBe('VITRINA');
      expect(tostonItem!.station).toBe('COCINA');

      // Verificar evento Outbox de ronda enviado para KDS
      const events = await outboxStorage.findUnpublishedEvents();
      const round2Event = events.find(
        (e) => e.eventType === 'table.round_ordered.v1' && (e.payload as any).roundNumber === 2,
      );
      expect(round2Event).toBeDefined();
      expect(round2Event!.payload.items[0].notes).toBe('Sin cebolla, palta bien madura');
    });
  });

  describe('3. Transferencia y Unión de Mesas', () => {
    it('debe transferir la cuenta abierta de una mesa a otra mesa disponible liberando la mesa origen', async () => {
      const mesa4 = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M04',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      const mesaTerraza = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'T02',
        zone: 'TERRAZA',
        capacity: 4,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: mesa4.id,
        waiterUserId,
        waiterName: 'Juan Mesero',
        paxCount: 3,
        customerName: 'Cliente Terraza',
      });

      // Transferir a Mesa T02
      const transferredTab = await diningService.transferTab({
        storeId: testStoreId,
        tabId: tab.id,
        targetTableId: mesaTerraza.id,
        transferredByUserId: waiterUserId,
        reason: 'Clientes prefieren fumar o sentarse al aire libre',
      });

      expect(transferredTab.tableNumber).toBe('T02');

      // Mesa 4 debe quedar AVAILABLE
      const oldTable = await diningRepo.findTableById(mesa4.id);
      expect(oldTable!.status).toBe('AVAILABLE');
      expect(oldTable!.currentTabId).toBeUndefined();

      // Mesa Terraza debe quedar OCCUPIED con la cuenta
      const newTable = await diningRepo.findTableById(mesaTerraza.id);
      expect(newTable!.status).toBe('OCCUPIED');
      expect(newTable!.currentTabId).toBe(tab.id);

      // Audit log registrado
      const logs = await auditService.getLogsByEntity(tab.id);
      expect(logs.some((l) => l.action === 'TABLE_TRANSFERRED')).toBe(true);
    });

    it('debe fusionar dos mesas para atención de grupos grandes', async () => {
      const mesa5 = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M05',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      const mesa6 = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M06',
        zone: 'SALON_PRINCIPAL',
        capacity: 4,
      });

      const primaryTab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: mesa5.id,
        waiterUserId,
        waiterName: 'Juan',
        paxCount: 6,
      });

      const result = await diningService.mergeTables({
        storeId: testStoreId,
        primaryTableId: mesa5.id,
        secondaryTableId: mesa6.id,
        mergedByUserId: waiterUserId,
      });

      expect(result.secondaryTable.mergedWithTableId).toBe(mesa5.id);
      expect(result.secondaryTable.status).toBe('OCCUPIED');
    });
  });

  describe('4. Pre-cuenta de Mesa (Xprinter XP-80T Buffer)', () => {
    it('debe emitir el ticket de pre-cuenta con desglose financiero y propina sugerida del 10%', async () => {
      const table = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M07',
        zone: 'SALON_PRINCIPAL',
        capacity: 2,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: table.id,
        waiterUserId,
        waiterName: 'Juan Mesero',
        paxCount: 2,
      });

      const latteProduct = await catalogRepo.findProductByName(testStoreId, 'Latte');
      const latte12oz = latteProduct!.variants[0];

      await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [{ productId: latteProduct!.id, variantId: latte12oz.id, quantity: 2 }],
      });

      // Total 2 Lattes a S/ 12.00 = S/ 24.00
      const { tab: updatedTab, printBuffer } = await diningService.printPreBill({
        storeId: testStoreId,
        tabId: tab.id,
      });

      expect(updatedTab.status).toBe('BILL_REQUESTED');

      // Verificar que la mesa física pasó a estado BILL_PRINTED
      const currentTable = await diningRepo.findTableById(table.id);
      expect(currentTable!.status).toBe('BILL_PRINTED');

      // Verificar que el buffer ESC/POS contiene datos clave
      const bufferText = printBuffer.toString('utf-8');
      expect(bufferText).toContain('PRE-CUENTA DE MESA');
      expect(bufferText).toContain('M07');
      expect(bufferText).toContain('Juan Mesero');
      expect(bufferText).toContain('TOTAL CONSUMO:');
      expect(bufferText).toContain('24.00');
      expect(bufferText).toContain('PROPINA SUGERIDA (10%):');
      expect(bufferText).toContain('2.40'); // 10% de S/ 24.00 = S/ 2.40
      expect(bufferText).toContain('TOTAL C/ PROPINA SUG.:');
      expect(bufferText).toContain('26.40');
    });
  });

  describe('5. División de Cuentas (Split Check)', () => {
    it('debe calcular la división equitativa entre N personas', async () => {
      const table = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M08',
        zone: 'SALON_PRINCIPAL',
        capacity: 3,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: table.id,
        waiterUserId,
        waiterName: 'Juan',
        paxCount: 3,
      });

      const flatWhiteProduct = await catalogRepo.findProductByName(testStoreId, 'Flat White');
      const fwVariant = flatWhiteProduct!.variants[0];

      // 3 Flat Whites a S/ 11.00 = S/ 33.00
      await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [{ productId: flatWhiteProduct!.id, variantId: fwVariant.id, quantity: 3 }],
      });

      // Dividir entre 3 comensales
      const splitResult = await diningService.splitCheckEqual(tab.id, 3);
      expect(splitResult.totalGross).toBe(33.0);
      expect(splitResult.numberOfSplits).toBe(3);
      expect(splitResult.amountPerPerson).toBe(11.0);
    });

    it('debe calcular la división por ítems seleccionados', async () => {
      const table = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M09',
        zone: 'SALON_PRINCIPAL',
        capacity: 2,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: table.id,
        waiterUserId,
        waiterName: 'Juan',
        paxCount: 2,
      });

      const coldBrewProduct = await catalogRepo.findProductByName(testStoreId, 'Cold Brew');
      const cbVariant = coldBrewProduct!.variants[0];

      const tiramisuProduct = await catalogRepo.findProductByName(testStoreId, 'Tiramisú Tradicional');
      const tiramisuVariant = tiramisuProduct!.variants[0];

      // 1 Cold Brew (S/ 12.00) + 1 Tiramisú (S/ 15.00) = Total S/ 27.00
      const updatedTab = await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [
          { productId: coldBrewProduct!.id, variantId: cbVariant.id, quantity: 1 },
          { productId: tiramisuProduct!.id, variantId: tiramisuVariant.id, quantity: 1 },
        ],
      });

      const cbItem = updatedTab.items.find((i) => i.productName.includes('Cold Brew'))!;
      const splitResult = await diningService.splitCheckByItems(tab.id, [cbItem.id]);

      expect(splitResult.selectedItemsTotal).toBe(12.0);
      expect(splitResult.remainingItemsTotal).toBe(15.0);
      expect(splitResult.selectedItemsCount).toBe(1);
      expect(splitResult.remainingItemsCount).toBe(1);
    });
  });

  describe('6. Cobro Final en POS y Liberación Automática de Mesa', () => {
    it('debe cobrar la comanda en SalesService, emitir order.paid.v1, cerrar la cuenta y liberar la mesa física a AVAILABLE', async () => {
      const table = await diningService.createTable({
        storeId: testStoreId,
        tableNumber: 'M10',
        zone: 'SALON_PRINCIPAL',
        capacity: 2,
      });

      const tab = await diningService.openTableTab({
        storeId: testStoreId,
        tableId: table.id,
        waiterUserId,
        waiterName: 'Juan Mesero',
        paxCount: 2,
        customerName: 'Cliente Mesa 10',
      });

      const americanoProduct = await catalogRepo.findProductByName(testStoreId, 'Americano');
      const americanoVariant = americanoProduct!.variants[0]; // S/ 8.00

      await diningService.addRoundToTab({
        storeId: testStoreId,
        tabId: tab.id,
        waiterUserId,
        items: [{ productId: americanoProduct!.id, variantId: americanoVariant.id, quantity: 2 }],
      });

      // Total 2 Americanos = S/ 16.00
      // Cobrar con Tarjeta en Caja
      const { tab: closedTab, order } = await diningService.closeAndPayTab({
        storeId: testStoreId,
        tabId: tab.id,
        registerId: testRegisterId,
        registerCode: 'C1',
        cashierUserId,
        cashierName: 'María Paz',
        idempotencyKey: 'idem-dining-pay-001',
        payments: [
          {
            method: 'CARD',
            provider: 'VISA',
            reference: 'OP-459128',
            amount: 16.0,
            tipAmount: 2.0, // Propina de S/ 2.00
          },
        ],
      });

      // 1. La orden formal fue generada en el módulo de ventas
      expect(order.id).toBeDefined();
      expect(order.orderNumber).toBe('C1-0001');
      expect(order.orderType).toBe('DINE_IN');
      expect(order.total.toDecimal()).toBe(16.0);
      expect(order.tipTotal.toDecimal()).toBe(2.0);

      // 2. La comanda de salón quedó cerrada y vinculada
      expect(closedTab.status).toBe('CLOSED');
      expect(closedTab.salesOrderId).toBe(order.id);

      // 3. La mesa física vuelve a quedar disponible de inmediato
      const freedTable = await diningRepo.findTableById(table.id);
      expect(freedTable!.status).toBe('AVAILABLE');
      expect(freedTable!.currentTabId).toBeUndefined();

      // 4. El Transactional Outbox emitió order.paid.v1 para la comanda de mesa
      const events = await outboxStorage.findUnpublishedEvents();
      const paidEvent = events.find((e) => e.eventType === 'order.paid.v1');
      expect(paidEvent).toBeDefined();
      expect(paidEvent!.payload.orderType).toBe('DINE_IN');
      expect(paidEvent!.payload.customerName).toContain('Mesa M10');
    });
  });
});
