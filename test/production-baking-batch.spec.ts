import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { InMemoryCatalogRepository } from '../src/modules/catalog/infra/catalog.in-memory.repository';
import { CsvImporterService } from '../src/modules/catalog/services/csv-importer.service';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { PricingService } from '../src/modules/catalog/services/pricing.service';
import { InMemoryStockRepository } from '../src/modules/stock/infra/stock.in-memory.repository';
import { StockService } from '../src/modules/stock/services/stock.service';
import { InMemoryPurchasingRepository } from '../src/modules/purchasing/infra/purchasing.in-memory.repository';
import { PurchasingService } from '../src/modules/purchasing/services/purchasing.service';
import { InMemoryProductionRepository } from '../src/modules/production/infra/production.in-memory.repository';
import { ProductionService } from '../src/modules/production/services/production.service';
import { InMemoryCashRepository } from '../src/modules/cash/infra/cash.in-memory.repository';
import { CashService } from '../src/modules/cash/services/cash.service';
import { InMemorySalesRepository } from '../src/modules/sales/infra/sales.in-memory.repository';
import { SalesService } from '../src/modules/sales/services/sales.service';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { PrintBridgeService } from '../src/platform/print-bridge/print-bridge.service';
import { AuthService } from '../src/platform/auth/auth.service';
import { AuditService } from '../src/platform/audit/audit.service';

describe('Paso 14: Producción y Obrador de Pastelería (Recetas Maestras y Lotes de Horneado)', () => {
  // Plataforma y Catálogo
  let catalogRepo: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let catalogService: CatalogService;
  let pricingService: PricingService;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let printBridge: PrintBridgeService;
  let authService: AuthService;
  let auditService: AuditService;

  // Compras y Kardex (Materia Prima)
  let purchasingRepo: InMemoryPurchasingRepository;
  let purchasingService: PurchasingService;

  // Stock de Vitrina (Producto Terminado)
  let stockRepo: InMemoryStockRepository;
  let stockService: StockService;

  // Producción / Obrador
  let productionRepo: InMemoryProductionRepository;
  let productionService: ProductionService;

  // Ventas POS (para probar consumo de lo producido)
  let cashRepo: InMemoryCashRepository;
  let cashService: CashService;
  let salesRepo: InMemorySalesRepository;
  let salesService: SalesService;

  const testStoreId = 'store-benevento-01';
  const bakerUserId = 'usr-pastelero-marco';
  const cashierUserId = 'usr-cajero-maria';

  // IDs de Materia Prima
  let harinaId: string;
  let mantequillaId: string;
  let lecheId: string;
  let azucarId: string;
  let levaduraId: string;

  // Variante terminada del catálogo
  let croissantProductVariantId: string;

  beforeEach(async () => {
    // 1. Infraestructura y Plataforma
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    printBridge = new PrintBridgeService();
    authService = new AuthService();
    auditService = new AuditService();

    // 2. Catálogo Oficial Benevento
    catalogRepo = new InMemoryCatalogRepository();
    pricingService = new PricingService();
    csvImporter = new CsvImporterService(catalogRepo);
    const csvPath = path.resolve(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await csvImporter.importFromCsv(testStoreId, csvContent);
    catalogService = new CatalogService(catalogRepo, csvImporter);

    const croissant = await catalogRepo.findProductByName(testStoreId, 'Croissant Clásico');
    croissantProductVariantId = croissant!.variants[0].id;

    // 3. Compras y Kardex (Materias Primas de Pastelería)
    purchasingRepo = new InMemoryPurchasingRepository();
    purchasingService = new PurchasingService(purchasingRepo, outboxWriter);

    // 4. Stock de Vitrina
    stockRepo = new InMemoryStockRepository();
    stockService = new StockService(stockRepo);

    // 5. Módulo de Producción / Obrador
    productionRepo = new InMemoryProductionRepository();
    productionService = new ProductionService(
      productionRepo,
      purchasingService, // Implementa IngredientStockPort
      stockService,
      catalogService,
      outboxWriter,
      auditService,
    );

    // 6. POS y Caja
    cashRepo = new InMemoryCashRepository();
    cashService = new CashService(cashRepo, outboxWriter);
    await cashService.openShift({
      storeId: testStoreId,
      registerId: 'reg-caja-c1',
      userId: cashierUserId,
      initialCashDecimal: 100.0,
    });

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

    // 7. Cargar Stock Inicial de Materias Primas en Kardex
    const harina = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-HARINA-ESP',
      name: 'Harina Panadera Especial',
      category: 'GRAINS_AND_FLOUR',
      inventoryUnit: 'GRAM',
      initialStock: 50000, // 50 kg
      initialCostDec: 0.0045, // S/ 4.50 por kg (0.0045 PEN/g)
    });
    harinaId = harina.id;

    const mantequilla = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-MANTEQ-LAM',
      name: 'Mantequilla Artesanal Laminada',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'GRAM',
      initialStock: 20000, // 20 kg
      initialCostDec: 0.028, // S/ 28.00 por kg (0.028 PEN/g)
    });
    mantequillaId = mantequilla.id;

    const leche = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-FRESCA',
      name: 'Leche Fresca Entera',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 12000, // 12 Litros
      initialCostDec: 0.0055, // S/ 5.50 por litro (0.0055 PEN/ml)
    });
    lecheId = leche.id;

    const azucar = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-AZUCAR-BLANCA',
      name: 'Azúcar Blanca Refinada',
      category: 'SWEETENERS_SYRUPS',
      inventoryUnit: 'GRAM',
      initialStock: 10000, // 10 kg
      initialCostDec: 0.0038, // S/ 3.80 por kg
    });
    azucarId = azucar.id;

    const levadura = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LEVADURA-SECA',
      name: 'Levadura Seca Instantánea',
      category: 'OTHER',
      inventoryUnit: 'GRAM',
      initialStock: 2000, // 2 kg
      initialCostDec: 0.045, // S/ 45.00 por kg
    });
    levaduraId = levadura.id;
  });

  describe('1. Recetas Maestras de Obrador / Pastelería', () => {
    it('debe registrar la formulación maestra de horneado vinculada a un producto de vitrina', async () => {
      // Receta para 24 Croissants Clásicos
      const recipe = await productionService.createRecipe({
        storeId: testStoreId,
        name: 'Receta Maestra Croissant Clásico (24u)',
        productVariantId: croissantProductVariantId,
        category: 'PASTRY',
        standardYieldUnits: 24,
        estimatedPrepMinutes: 180,
        instructions: 'Amasado inicial, descanso en frío 12h, empaste con mantequilla laminada, 3 pliegues simples, fermentación 2h y horneado a 180°C por 18 min.',
        ingredients: [
          { ingredientId: harinaId, quantity: 1000, unit: 'GRAM' }, // 1,000g harina
          { ingredientId: mantequillaId, quantity: 500, unit: 'GRAM' }, // 500g mantequilla
          { ingredientId: lecheId, quantity: 350, unit: 'MILLILITER' }, // 350ml leche
          { ingredientId: azucarId, quantity: 100, unit: 'GRAM' }, // 100g azúcar
          { ingredientId: levaduraId, quantity: 25, unit: 'GRAM' }, // 25g levadura
        ],
      });

      expect(recipe.id).toBeDefined();
      expect(recipe.standardYieldUnits).toBe(24);
      expect(recipe.productName).toBe('Croissant Clásico');
      expect(recipe.ingredients.length).toBe(5);
    });

    it('debe rechazar recetas con rendimiento o ingredientes inválidos', async () => {
      await expect(
        productionService.createRecipe({
          storeId: testStoreId,
          name: 'Receta Inválida',
          productVariantId: croissantProductVariantId,
          category: 'PASTRY',
          standardYieldUnits: 0, // Inválido
          ingredients: [{ ingredientId: harinaId, quantity: 500 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Ciclo de Producción: Planificación, Inicio y Finalización del Lote', () => {
    it('debe completar el lote de horneado, descontar materias primas en Kardex y transferir las unidades a Vitrina con su costo real', async () => {
      // 1. Crear Receta Maestra
      const recipe = await productionService.createRecipe({
        storeId: testStoreId,
        name: 'Croissant Clásico Horneado Mañana',
        productVariantId: croissantProductVariantId,
        category: 'PASTRY',
        standardYieldUnits: 24,
        ingredients: [
          { ingredientId: harinaId, quantity: 1000 },
          { ingredientId: mantequillaId, quantity: 500 },
          { ingredientId: lecheId, quantity: 350 },
          { ingredientId: azucarId, quantity: 100 },
          { ingredientId: levaduraId, quantity: 25 },
        ],
      });

      // 2. Planificar Lote matutino de 24 unidades
      const plannedBatch = await productionService.planBatch({
        storeId: testStoreId,
        recipeId: recipe.id,
        targetQuantity: 24,
        bakerUserId,
        bakerName: 'Marco Pastelero',
        notes: 'Horneado de apertura de vitrina 7:00 AM',
      });

      expect(plannedBatch.id).toBeDefined();
      expect(plannedBatch.status).toBe('PLANNED');
      expect(plannedBatch.batchNumber).toContain('LOT-');

      // 3. Iniciar Lote
      const inProgressBatch = await productionService.startBatch(plannedBatch.id, bakerUserId);
      expect(inProgressBatch.status).toBe('IN_PROGRESS');
      expect(inProgressBatch.startedAt).toBeDefined();

      // 4. Completar Lote de Horneado:
      // - 22 unidades aptas para vitrina (doradas, tamaño perfecto)
      // - 2 unidades mermadas (quemadas por gradiente de horno)
      // Total masa horneada: 24 unidades (escala 1.0)
      const { batch: completedBatch, showcaseItem } = await productionService.completeBatch({
        storeId: testStoreId,
        batchId: inProgressBatch.id,
        actualYield: 22,
        wasteUnits: 2,
        bakerUserId,
        notes: 'Lote de excelente volumen y hojaldrado. 2 unidades descartadas por exceso de tostado.',
      });

      expect(completedBatch.status).toBe('COMPLETED');
      expect(completedBatch.actualYield).toBe(22);
      expect(completedBatch.wasteUnits).toBe(2);
      expect(completedBatch.efficiencyRate).toBe(91.67); // 22 / 24 = 91.67%

      // 5. Verificar Costeo Total y Unitario:
      // Harina: 1,000 * 0.0045 = S/ 4.50
      // Mantequilla: 500 * 0.028 = S/ 14.00
      // Leche: 350 * 0.0055 = S/ 1.925
      // Azúcar: 100 * 0.0038 = S/ 0.38
      // Levadura: 25 * 0.045 = S/ 1.125
      // Total costo materias primas: S/ 21.93
      expect(completedBatch.totalCost.toDecimal()).toBe(21.93);

      // Costo unitario real por croissant (S/ 21.93 / 22 unidades aptas = S/ 0.9968)
      expect(completedBatch.unitCost.toDecimal()).toBe(0.9968);

      // 6. Verificar que las materias primas se descontaron en Kardex con tipo PRODUCTION_CONSUMPTION
      const harinaStock = await purchasingService.getIngredientStock(testStoreId, harinaId);
      expect(harinaStock).toBe(50000 - 1000); // 49,000g

      const mantequillaStock = await purchasingService.getIngredientStock(testStoreId, mantequillaId);
      expect(mantequillaStock).toBe(20000 - 500); // 19,500g

      const kardexHarina = await purchasingService.getIngredientKardex(harinaId);
      const prodMove = kardexHarina.find((m) => m.type === 'PRODUCTION_CONSUMPTION');
      expect(prodMove).toBeDefined();
      expect(prodMove!.documentReference).toBe(`Lote #${completedBatch.batchNumber}`);
      expect(prodMove!.quantityChange).toBe(-1000);

      // 7. Verificar que las 22 unidades aptas ingresaron automáticamente a la Vitrina
      expect(showcaseItem.currentStock).toBe(22);
      expect(showcaseItem.unitCost.toDecimal()).toBe(0.9968);

      // 8. Verificar evento Outbox emitido
      const events = await outboxStorage.findUnpublishedEvents();
      const completeEvent = events.find((e) => e.eventType === 'production.batch_completed.v1');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.payload.actualYield).toBe(22);
      expect(completeEvent!.payload.efficiencyRate).toBe(91.67);
      expect(completeEvent!.payload.totalCost).toBe(21.93);
    });
  });

  describe('3. Convivencia con el Punto de Venta (POS)', () => {
    it('debe permitir cobrar inmediatamente en mostrador los croissants horneados en el lote', async () => {
      // 1. Crear receta y producir lote de 20 croissants
      const recipe = await productionService.createRecipe({
        storeId: testStoreId,
        name: 'Croissants Tarde',
        productVariantId: croissantProductVariantId,
        category: 'PASTRY',
        standardYieldUnits: 20,
        ingredients: [{ ingredientId: harinaId, quantity: 800 }],
      });

      const batch = await productionService.planBatch({
        storeId: testStoreId,
        recipeId: recipe.id,
        targetQuantity: 20,
        bakerUserId,
        bakerName: 'Marco',
      });

      await productionService.completeBatch({
        storeId: testStoreId,
        batchId: batch.id,
        actualYield: 20,
        bakerUserId,
      });

      // El stock de vitrina de croissants es ahora 20 unidades
      const croissantProduct = await catalogRepo.findProductByName(testStoreId, 'Croissant Clásico');
      const croissantVariant = croissantProduct!.variants[0];

      const availableInVitrina = await stockService.isProductVariantAvailable(
        testStoreId,
        croissantVariant.id,
      );
      expect(availableInVitrina).toBe(true);

      // 2. Realizar venta en mostrador de 3 Croissants (S/ 7.50 c/u = S/ 22.50)
      const order = await salesService.createAndPayOrder({
        storeId: testStoreId,
        registerId: 'reg-caja-c1',
        registerCode: 'C1',
        cashierUserId,
        cashierName: 'María Paz',
        orderType: 'TAKEAWAY',
        customerName: 'Cliente Merienda',
        idempotencyKey: 'idem-sale-pastry-001',
        items: [
          {
            productId: croissantProduct!.id,
            variantId: croissantVariant.id,
            quantity: 3,
          },
        ],
        payments: [{ method: 'CASH', amount: 22.5, cashTendered: 30.0 }],
      });

      expect(order.id).toBeDefined();

      // 3. Descontar stock de vitrina por la venta
      await stockService.deductForSale(testStoreId, croissantVariant.id, 3, order.id);

      // El stock remanente en vitrina es de 17 croissants
      const stockItem = await stockRepo.findStockItem(testStoreId, croissantVariant.id);
      expect(stockItem!.currentStock).toBe(17);
    });
  });

  describe('4. Reporte de Eficiencia y Costos de Obrador', () => {
    it('debe consolidar el reporte de rendimiento y costeo total de horneado', async () => {
      const recipe = await productionService.createRecipe({
        storeId: testStoreId,
        name: 'Receta Panadería',
        productVariantId: croissantProductVariantId,
        category: 'PASTRY',
        standardYieldUnits: 24,
        ingredients: [
          { ingredientId: harinaId, quantity: 1000 },
          { ingredientId: mantequillaId, quantity: 500 },
        ],
      });

      // Lote 1: Plan 24 -> 22 aptas, 2 mermadas
      const b1 = await productionService.planBatch({
        storeId: testStoreId,
        recipeId: recipe.id,
        targetQuantity: 24,
        bakerUserId,
        bakerName: 'Marco',
      });
      await productionService.completeBatch({
        storeId: testStoreId,
        batchId: b1.id,
        actualYield: 22,
        wasteUnits: 2,
        bakerUserId,
      });

      // Lote 2: Plan 24 -> 24 aptas, 0 mermadas (100% de eficiencia)
      const b2 = await productionService.planBatch({
        storeId: testStoreId,
        recipeId: recipe.id,
        targetQuantity: 24,
        bakerUserId,
        bakerName: 'Marco',
      });
      await productionService.completeBatch({
        storeId: testStoreId,
        batchId: b2.id,
        actualYield: 24,
        wasteUnits: 0,
        bakerUserId,
      });

      // Consultar reporte de eficiencia
      const report = await productionService.getEfficiencyReport(testStoreId);

      expect(report.totalBatches).toBe(2);
      expect(report.totalPlannedUnits).toBe(48);
      expect(report.totalActualYield).toBe(46);
      expect(report.totalWasteUnits).toBe(2);
      expect(report.averageEfficiencyRate).toBe(95.83); // 46 / 48 = 95.83%
      expect(report.batches.length).toBe(2);
    });
  });
});
