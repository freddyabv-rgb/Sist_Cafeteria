import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InMemoryCatalogRepository } from '../src/modules/catalog/infra/catalog.in-memory.repository';
import { CsvImporterService } from '../src/modules/catalog/services/csv-importer.service';
import { InMemoryPurchasingRepository } from '../src/modules/purchasing/infra/purchasing.in-memory.repository';
import { PurchasingService } from '../src/modules/purchasing/services/purchasing.service';
import { InMemoryRecipeRepository } from '../src/modules/recipes/infra/recipe.in-memory.repository';
import { RecipesService } from '../src/modules/recipes/services/recipes.service';
import { InMemoryWasteRepository } from '../src/modules/waste/infra/waste.in-memory.repository';
import { WasteService } from '../src/modules/waste/services/waste.service';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { AuthService } from '../src/platform/auth/auth.service';
import { AuditService } from '../src/platform/audit/audit.service';

describe('Paso 12: Mermas Operativas y Calibración Matutina de Molino', () => {
  let catalogRepo: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let purchasingRepo: InMemoryPurchasingRepository;
  let purchasingService: PurchasingService;
  let recipeRepo: InMemoryRecipeRepository;
  let recipesService: RecipesService;
  let wasteRepo: InMemoryWasteRepository;
  let wasteService: WasteService;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let authService: AuthService;
  let auditService: AuditService;

  const testStoreId = 'store-benevento-01';
  const baristaUserId = 'usr-barista-carlos';
  const supervisorUserId = 'usr-super-lucia';
  const supervisorPin = '4321';

  // IDs de Insumos
  let cafeId: string;
  let lecheEnteraId: string;
  let lecheAvenaId: string;

  beforeEach(async () => {
    // 1. Plataforma (Auth, Audit, Outbox)
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    authService = new AuthService();
    auditService = new AuditService();

    // Crear Barista y Supervisor con PIN
    authService.createUserWithPin(
      baristaUserId,
      testStoreId,
      'Carlos Barista',
      'BARISTA',
      '1111',
    );
    authService.createUserWithPin(
      supervisorUserId,
      testStoreId,
      'Lucía Supervisora',
      'SUPERVISOR',
      supervisorPin,
    );

    // 2. Compras y Kardex
    purchasingRepo = new InMemoryPurchasingRepository();
    purchasingService = new PurchasingService(purchasingRepo, outboxWriter);

    // 3. Catálogo y Recetas
    catalogRepo = new InMemoryCatalogRepository();
    csvImporter = new CsvImporterService(catalogRepo);
    const csvPath = path.resolve(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await csvImporter.importFromCsv(testStoreId, csvContent);

    recipeRepo = new InMemoryRecipeRepository();
    recipesService = new RecipesService(recipeRepo);

    // 4. Servicio de Mermas y Calibración
    wasteRepo = new InMemoryWasteRepository();
    wasteService = new WasteService(
      wasteRepo,
      purchasingService, // Implementa IngredientStockPort
      outboxWriter,
      authService,
      auditService,
      recipesService,
    );

    // 5. Cargar Insumos Base en Kardex
    const cafe = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-CAFE-CUSCO',
      name: 'Café de Especialidad Grano - Origen Cusco',
      category: 'COFFEE_BEANS',
      inventoryUnit: 'GRAM',
      initialStock: 10000, // 10,000 g (10 kg)
      initialCostDec: 0.065, // S/ 0.065 por gramo (S/ 65.00/kg)
    });
    cafeId = cafe.id;

    const leche = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-ENTERA',
      name: 'Leche Fresca Entera',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 12000, // 12,000 ml (12 L)
      initialCostDec: 0.0055, // S/ 0.0055 por ml (S/ 5.50/L)
    });
    lecheEnteraId = leche.id;

    const avena = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-AVENA',
      name: 'Bebida de Avena Barista',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 6000, // 6,000 ml
      initialCostDec: 0.012, // S/ 0.012 por ml (S/ 12.00/L)
    });
    lecheAvenaId = avena.id;

    // 6. Configurar Receta Base de Flat White 8oz para pruebas de Remake
    const flatWhiteProduct = await catalogRepo.findProductByName(testStoreId, 'Flat White');
    const flatWhiteVariant = flatWhiteProduct!.variants[0];
    await recipesService.createRecipe({
      storeId: testStoreId,
      productVariantId: flatWhiteVariant.id,
      recipeName: 'Receta Flat White 8oz',
      yieldQuantity: 1,
      ingredients: [
        {
          ingredientId: cafeId,
          ingredientName: 'Café de Especialidad',
          quantity: 18,
          unit: 'GRAM',
          isSubstitutable: false,
        },
        {
          ingredientId: lecheEnteraId,
          ingredientName: 'Leche Fresca Entera',
          quantity: 150,
          unit: 'MILLILITER',
          isSubstitutable: true,
          substitutableGroup: 'DAIRY',
        },
      ],
    });
  });

  describe('1. Calibración Matutina de Molino (Dial-in)', () => {
    it('debe registrar parámetros técnicos de extracción, descontar purgas en Kardex y emitir grinder.calibrated.v1', async () => {
      // Barista realiza calibración del molino principal:
      // 18.0g dosis in, 36.0g líquido out en 27s (Ratio 1:2.0), molienda "2.4".
      // 3 shots de prueba desechados = 54 gramos de café mermados.
      // Costo: 54g * S/ 0.065 = S/ 3.51
      const calibration = await wasteService.recordGrinderCalibration({
        storeId: testStoreId,
        grinderName: 'Mythos One Principal',
        ingredientId: cafeId,
        targetDrink: 'Espresso Doble 1:2',
        doseInGrams: 18.0,
        yieldOutGrams: 36.0,
        extractionTimeSeconds: 27,
        grindSetting: '2.4',
        testShotsCount: 3,
        totalWastedGrams: 54,
        sensoryNotes: 'Acidez cítrica brillante, notas a caramelo y chocolate con cuerpo sedoso',
        status: 'APPROVED',
        baristaUserId,
        baristaName: 'Carlos Barista',
      });

      expect(calibration.id).toBeDefined();
      expect(calibration.brewRatio).toBe(2.0); // 36 / 18
      expect(calibration.totalWastedGrams).toBe(54);
      expect(calibration.totalCost.toDecimal()).toBe(3.51); // 54 * 0.065

      // Verificar que el stock físico en Kardex disminuyó de 10,000g a 9,946g
      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
      expect(cafeStock).toBe(10000 - 54);

      // Verificar movimiento formal en Kardex
      const cafeKardex = await purchasingService.getIngredientKardex(cafeId);
      const calibMoves = cafeKardex.filter((m) => m.type === 'GRINDER_CALIBRATION');
      expect(calibMoves.length).toBe(1);
      expect(calibMoves[0].quantityChange).toBe(-54);
      expect(calibMoves[0].documentReference).toBe('CALIB_MYTHOS_ONE_PRINCIPAL');
      expect(calibMoves[0].stockBalanceAfter).toBe(9946);
      expect(calibMoves[0].unitCostDec).toBe(0.065);

      // Verificar evento Outbox emitido
      const outboxEvents = await outboxStorage.findUnpublishedEvents();
      const calibEvent = outboxEvents.find((e) => e.eventType === 'grinder.calibrated.v1');
      expect(calibEvent).toBeDefined();
      expect(calibEvent!.payload.grinderName).toBe('Mythos One Principal');
      expect(calibEvent!.payload.brewRatio).toBe(2.0);
      expect(calibEvent!.payload.totalWastedGrams).toBe(54);
      expect(calibEvent!.payload.totalCost).toBe(3.51);
    });

    it('debe rechazar calibración con parámetros inválidos (dosis o tiempo cero)', async () => {
      await expect(
        wasteService.recordGrinderCalibration({
          storeId: testStoreId,
          grinderName: 'Mythos One',
          ingredientId: cafeId,
          doseInGrams: 0, // Inválido
          yieldOutGrams: 36,
          extractionTimeSeconds: 25,
          grindSetting: '2.4',
          testShotsCount: 1,
          totalWastedGrams: 18,
          baristaUserId,
          baristaName: 'Carlos',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Merma Operativa Común: Derrames en Barra (SPILLAGE)', () => {
    it('debe registrar un derrame accidental de leche, descontar en Kardex y no requerir PIN si el costo es menor a S/ 15', async () => {
      // Accidente en barra: se derraman 400ml de leche fresca
      // Costo: 400 * S/ 0.0055 = S/ 2.20 (menor al umbral de S/ 15.00)
      const wasteRecord = await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'SPILLAGE',
        reason: 'Jarra de leche de 400ml derramada accidentalmente al vaporizar',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos Barista',
        items: [{ ingredientId: lecheEnteraId, quantity: 400, unit: 'MILLILITER' }],
      });

      expect(wasteRecord.id).toBeDefined();
      expect(wasteRecord.type).toBe('SPILLAGE');
      expect(wasteRecord.totalCost.toDecimal()).toBe(2.2);
      expect(wasteRecord.supervisorUserId).toBeUndefined(); // Sin PIN por monto bajo

      // Verificar stock en Kardex: 12,000 - 400 = 11,600 ml
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraId);
      expect(lecheStock).toBe(11600);

      // Verificar Kardex
      const kardex = await purchasingService.getIngredientKardex(lecheEnteraId);
      const spillageMoves = kardex.filter((m) => m.type === 'WASTE_DISPOSAL');
      expect(spillageMoves.length).toBe(1);
      expect(spillageMoves[0].quantityChange).toBe(-400);
      expect(spillageMoves[0].reason).toContain('SPILLAGE');

      // Verificar evento Outbox
      const outboxEvents = await outboxStorage.findUnpublishedEvents();
      const wasteEvent = outboxEvents.find((e) => e.eventType === 'waste.registered.v1');
      expect(wasteEvent).toBeDefined();
      expect(wasteEvent!.payload.type).toBe('SPILLAGE');
      expect(wasteEvent!.payload.totalCost).toBe(2.2);
    });
  });

  describe('3. Consumo Interno Autorizado de Personal (STAFF_CONSUMPTION)', () => {
    it('debe registrar el consumo de café y leche del barista de turno de forma justificada', async () => {
      // Barista toma su café de apertura: 18g café + 200ml leche
      // Costo café: 18 * 0.065 = S/ 1.17
      // Costo leche: 200 * 0.0055 = S/ 1.10
      // Total costo: S/ 2.27
      const staffWaste = await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'STAFF_CONSUMPTION',
        reason: 'Café de bienvenida del barista de turno matutino',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos Barista',
        items: [
          { ingredientId: cafeId, quantity: 18, unit: 'GRAM' },
          { ingredientId: lecheEnteraId, quantity: 200, unit: 'MILLILITER' },
        ],
      });

      expect(staffWaste.totalCost.toDecimal()).toBe(2.27);
      expect(staffWaste.items.length).toBe(2);

      // Verificar saldos
      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraId);
      expect(cafeStock).toBe(10000 - 18);
      expect(lecheStock).toBe(12000 - 200);
    });
  });

  describe('4. Bebida Rehecha Vinculada a Comanda (REMAKE)', () => {
    it('debe deducir automáticamente por receta los insumos de una bebida rehecha por error del barista', async () => {
      const flatWhiteProduct = await catalogRepo.findProductByName(testStoreId, 'Flat White');
      const flatWhiteVariant = flatWhiteProduct!.variants[0];

      // Error en barra: El barista preparó un Flat White pero se le quemó la leche al vaporizar
      // Se registra como remake de la Orden #C1-0004
      // Receta Flat White: 18g café + 150ml leche entera
      // Costo: (18 * 0.065) + (150 * 0.0055) = 1.17 + 0.825 = S/ 2.00
      const remakeRecord = await wasteService.recordRemakeOrder({
        storeId: testStoreId,
        orderId: 'ord-test-0004',
        orderNumber: 'C1-0004',
        productVariantId: flatWhiteVariant.id,
        quantity: 1,
        reason: 'Leche sobrecalentada a más de 75°C y textura inadecuada',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos Barista',
      });

      expect(remakeRecord.type).toBe('REMAKE');
      expect(remakeRecord.orderNumber).toBe('C1-0004');
      expect(remakeRecord.items.length).toBe(2);
      expect(remakeRecord.totalCost.toDecimal()).toBe(2.0);

      // Stock de café descontado en 18g y leche en 150ml
      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraId);
      expect(cafeStock).toBe(10000 - 18);
      expect(lecheStock).toBe(12000 - 150);

      // El Kardex registra la referencia a la orden del remake
      const cafeKardex = await purchasingService.getIngredientKardex(cafeId);
      const remakeMove = cafeKardex.find((m) => m.documentReference === 'Orden #C1-0004');
      expect(remakeMove).toBeDefined();
      expect(remakeMove!.quantityChange).toBe(-18);
    });
  });

  describe('5. Control de Mermas Sensibles y Vencimientos con PIN de Supervisor', () => {
    it('debe exigir PIN de supervisor si el costo de la merma supera el umbral de S/ 15.00', async () => {
      // Intento de mermar 2,000 ml de bebida de avena (S/ 24.00) sin PIN
      await expect(
        wasteService.recordWaste({
          storeId: testStoreId,
          type: 'EXPIRED',
          reason: 'Bebida de avena abierta caducada tras 4 días',
          responsibleUserId: baristaUserId,
          responsibleUserName: 'Carlos Barista',
          items: [{ ingredientId: lecheAvenaId, quantity: 2000, unit: 'MILLILITER' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar PIN de supervisor inválido o incorrecto', async () => {
      await expect(
        wasteService.recordWaste({
          storeId: testStoreId,
          type: 'EXPIRED',
          reason: 'Bebida de avena caducada',
          responsibleUserId: baristaUserId,
          responsibleUserName: 'Carlos Barista',
          supervisorPin: '9999', // PIN erróneo
          items: [{ ingredientId: lecheAvenaId, quantity: 2000, unit: 'MILLILITER' }],
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe autorizar con PIN válido, guardar supervisor y registrar evento en AUDIT_LOG', async () => {
      // Merma de 3,000 ml de avena caducada: 3000 * 0.012 = S/ 36.00
      const wasteRecord = await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'EXPIRED',
        reason: 'Lote de avena barista vencido',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos Barista',
        supervisorPin, // PIN correcto '4321'
        items: [{ ingredientId: lecheAvenaId, quantity: 3000, unit: 'MILLILITER' }],
      });

      expect(wasteRecord.totalCost.toDecimal()).toBe(36.0);
      expect(wasteRecord.supervisorUserId).toBe(supervisorUserId);

      // Stock de avena descontado en 3,000ml
      const avenaStock = await purchasingService.getIngredientStock(testStoreId, lecheAvenaId);
      expect(avenaStock).toBe(6000 - 3000);

      // Verificar que se registró la acción sensible en AUDIT_LOG
      const auditLogs = await auditService.getLogsByEntity(wasteRecord.id);
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('WASTE_AUTHORIZED');
      expect(auditLogs[0].userId).toBe(supervisorUserId);
    });
  });

  describe('6. Reporte Consolidado de Mermas y Pérdidas de Barra', () => {
    it('debe generar el balance total valorizado en Soles agrupado por categoría', async () => {
      // 1. Calibración: 54g café = S/ 3.51
      await wasteService.recordGrinderCalibration({
        storeId: testStoreId,
        grinderName: 'Mythos One',
        ingredientId: cafeId,
        doseInGrams: 18,
        yieldOutGrams: 36,
        extractionTimeSeconds: 27,
        grindSetting: '2.4',
        testShotsCount: 3,
        totalWastedGrams: 54,
        baristaUserId,
        baristaName: 'Carlos',
      });

      // 2. Derrame (SPILLAGE): 400ml leche = S/ 2.20
      await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'SPILLAGE',
        reason: 'Derrame en barra',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos',
        items: [{ ingredientId: lecheEnteraId, quantity: 400 }],
      });

      // 3. Consumo Personal (STAFF_CONSUMPTION): 18g café + 200ml leche = S/ 2.27
      await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'STAFF_CONSUMPTION',
        reason: 'Consumo barista',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos',
        items: [
          { ingredientId: cafeId, quantity: 18 },
          { ingredientId: lecheEnteraId, quantity: 200 },
        ],
      });

      // 4. Vencimiento (EXPIRED con PIN): 2000ml avena = S/ 24.00
      await wasteService.recordWaste({
        storeId: testStoreId,
        type: 'EXPIRED',
        reason: 'Avena vencida',
        responsibleUserId: baristaUserId,
        responsibleUserName: 'Carlos',
        supervisorPin,
        items: [{ ingredientId: lecheAvenaId, quantity: 2000 }],
      });

      // Consultar reporte consolidado
      const report = await wasteService.getWasteSummaryReport(testStoreId);

      expect(report.storeId).toBe(testStoreId);
      expect(report.totalCoffeeGramsCalibrated).toBe(54);
      expect(report.totalCalibrationCostDec).toBe(3.51);

      // Costo operacional: S/ 2.20 (derrame) + S/ 2.27 (personal) + S/ 24.00 (vencimiento) = S/ 28.47
      expect(report.totalOperationalWasteCostDec).toBe(28.47);

      // Pérdida total valorizada: S/ 3.51 + S/ 28.47 = S/ 31.98
      expect(report.totalLossCostDec).toBe(31.98);

      // Verificar desglose por tipo
      const calibItem = report.breakdown.find((b) => b.type === 'GRINDER_CALIBRATION');
      expect(calibItem!.count).toBe(1);
      expect(calibItem!.totalCostDec).toBe(3.51);

      const spillageItem = report.breakdown.find((b) => b.type === 'SPILLAGE');
      expect(spillageItem!.count).toBe(1);
      expect(spillageItem!.totalCostDec).toBe(2.2);

      const staffItem = report.breakdown.find((b) => b.type === 'STAFF_CONSUMPTION');
      expect(staffItem!.count).toBe(1);
      expect(staffItem!.totalCostDec).toBe(2.27);

      const expiredItem = report.breakdown.find((b) => b.type === 'EXPIRED');
      expect(expiredItem!.count).toBe(1);
      expect(expiredItem!.totalCostDec).toBe(24.0);
    });
  });
});
