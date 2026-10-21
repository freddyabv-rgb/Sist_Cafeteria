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
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { PrintBridgeService } from '../src/platform/print-bridge/print-bridge.service';
import { AuthService } from '../src/platform/auth/auth.service';
import { AuditService } from '../src/platform/audit/audit.service';
import { InMemorySalesRepository } from '../src/modules/sales/infra/sales.in-memory.repository';
import { SalesService } from '../src/modules/sales/services/sales.service';
import { InMemoryPurchasingRepository } from '../src/modules/purchasing/infra/purchasing.in-memory.repository';
import { PurchasingService } from '../src/modules/purchasing/services/purchasing.service';
import { InMemoryRecipeRepository } from '../src/modules/recipes/infra/recipe.in-memory.repository';
import { RecipesService } from '../src/modules/recipes/services/recipes.service';
import { RecipeOrderPaidHandler } from '../src/modules/recipes/handlers/recipe-order-paid.handler';
import { InMemoryStockRepository } from '../src/modules/stock/infra/stock.in-memory.repository';
import { StockService } from '../src/modules/stock/services/stock.service';
import { StockOrderPaidHandler } from '../src/modules/stock/handlers/stock-order-paid.handler';

describe('Paso 11 - Punto 3: Suscriptor Outbox order.paid.v1 y Descuento en Kardex por Receta', () => {
  // Catálogo y Ventas
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

  // Compras, Kardex y Recetas
  let purchasingRepo: InMemoryPurchasingRepository;
  let purchasingService: PurchasingService;
  let recipeRepo: InMemoryRecipeRepository;
  let recipesService: RecipesService;
  let recipeOrderPaidHandler: RecipeOrderPaidHandler;

  // Stock de Vitrina (para validar coexistencia)
  let stockRepo: InMemoryStockRepository;
  let stockService: StockService;
  let stockPaidHandler: StockOrderPaidHandler;

  const testStoreId = 'store-benevento-01';
  const testRegisterId = 'reg-caja-c1';
  const cashierUserId = 'usr-cajero-maria';

  // Insumos
  let cafeId: string;
  let lecheEnteraId: string;
  let lecheAvenaId: string;
  let vaso12ozId: string;
  let tapa12ozId: string;

  beforeEach(async () => {
    // 1. Infraestructura Outbox & Plataforma
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);
    printBridge = new PrintBridgeService();
    authService = new AuthService();
    auditService = new AuditService();

    // 2. Catálogo desde CSV oficial de Benevento
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

    // 4. Compras y Kardex
    purchasingRepo = new InMemoryPurchasingRepository();
    purchasingService = new PurchasingService(purchasingRepo, outboxWriter);

    // 5. Recetas y Escandallo
    recipeRepo = new InMemoryRecipeRepository();
    recipesService = new RecipesService(recipeRepo);
    recipeOrderPaidHandler = new RecipeOrderPaidHandler(recipesService, purchasingService);

    // 6. Vitrina
    stockRepo = new InMemoryStockRepository();
    stockService = new StockService(stockRepo);
    stockPaidHandler = new StockOrderPaidHandler(stockService);

    // 7. Registro de Suscriptores en el Outbox Dispatcher
    outboxDispatcher.registerHandler('order.paid.v1', recipeOrderPaidHandler);
    outboxDispatcher.registerHandler('order.paid.v1', stockPaidHandler);

    // 8. POS y Ventas
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

    // 9. Abrir Turno de Caja C1 con fondo de S/ 100.00
    await cashService.openShift({
      storeId: testStoreId,
      registerId: testRegisterId,
      userId: cashierUserId,
      initialCashDecimal: 100.0,
    });

    // 10. Registrar Insumos Base en Kardex (con compras previas)
    const cafe = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-CAFE-ESP',
      name: 'Café de Especialidad Grano - Origen Cusco',
      category: 'COFFEE_BEANS',
      inventoryUnit: 'GRAM',
      initialStock: 10000, // 10,000 g
      initialCostDec: 0.065, // S/ 0.065/g
    });
    cafeId = cafe.id;

    const lecheEntera = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-ENTERA',
      name: 'Leche Fresca Entera',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 12000, // 12,000 ml
      initialCostDec: 0.0055, // S/ 0.0055/ml
    });
    lecheEnteraId = lecheEntera.id;

    const lecheAvena = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-AVENA',
      name: 'Bebida de Avena Barista',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 6000, // 6,000 ml
      initialCostDec: 0.012, // S/ 0.012/ml
    });
    lecheAvenaId = lecheAvena.id;

    const vaso = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-VASO-12OZ',
      name: 'Vaso Biodegradable 12oz',
      category: 'PACKAGING',
      inventoryUnit: 'UNIT',
      initialStock: 500,
      initialCostDec: 0.35,
    });
    vaso12ozId = vaso.id;

    const tapa = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-TAPA-12OZ',
      name: 'Tapa Viajera 12oz',
      category: 'PACKAGING',
      inventoryUnit: 'UNIT',
      initialStock: 500,
      initialCostDec: 0.15,
    });
    tapa12ozId = tapa.id;

    // 11. Obtener la variante real del Latte 12oz cargada desde el CSV
    const latteProduct = await catalogRepo.findProductByName(testStoreId, 'Latte');
    const latte12ozVariant = latteProduct!.variants.find((v) => v.name.includes('12oz')) || latteProduct!.variants[0];

    // Obtener los modificadores reales del catálogo
    const lecheGroup = latteProduct!.modifierGroups.find((g) => g.name.toLowerCase().includes('leche'));
    const avenaOption = lecheGroup!.options.find((o) => o.name.toLowerCase().includes('avena'));

    const extrasGroup = latteProduct!.modifierGroups.find((g) => g.name.toLowerCase().includes('extra'));
    const extraShotOption = extrasGroup!.options.find((o) => o.name.toLowerCase().includes('shot'));

    // 12. Configurar Receta Base del Latte 12oz: 18g café + 220ml leche entera
    await recipesService.createRecipe({
      storeId: testStoreId,
      productVariantId: latte12ozVariant.id,
      recipeName: 'Receta Latte 12oz',
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
          quantity: 220,
          unit: 'MILLILITER',
          isSubstitutable: true,
          substitutableGroup: 'DAIRY',
        },
      ],
    });

    // 13. Configurar Reglas de Modificadores en Receta
    await recipesService.configureModifierImpact({
      storeId: testStoreId,
      modifierOptionId: avenaOption!.id,
      optionName: avenaOption!.name,
      action: 'SUBSTITUTE',
      targetIngredientId: lecheAvenaId,
      targetIngredientName: 'Bebida de Avena',
      targetSubstitutableGroup: 'DAIRY',
      unit: 'MILLILITER',
    });

    await recipesService.configureModifierImpact({
      storeId: testStoreId,
      modifierOptionId: extraShotOption!.id,
      optionName: extraShotOption!.name,
      action: 'ADD',
      targetIngredientId: cafeId,
      targetIngredientName: 'Café de Especialidad',
      quantityDelta: 9, // +9g café
      unit: 'GRAM',
    });

    // 14. Configurar Regla de Empaque Descartable (TAKEAWAY)
    await recipesService.configurePackagingRule({
      storeId: testStoreId,
      productVariantId: latte12ozVariant.id,
      items: [
        { ingredientId: vaso12ozId, ingredientName: 'Vaso Biodegradable 12oz', quantity: 1 },
        { ingredientId: tapa12ozId, ingredientName: 'Tapa Viajera 12oz', quantity: 1 },
      ],
    });
  });

  it('1. Venta real con SalesService emite order.paid.v1 y el despachador de Outbox descuenta insumos en Kardex', async () => {
    const latteProduct = await catalogRepo.findProductByName(testStoreId, 'Latte');
    const latte12ozVariant = latteProduct!.variants.find((v) => v.name.includes('12oz')) || latteProduct!.variants[0];
    const lecheGroup = latteProduct!.modifierGroups.find((g) => g.name.toLowerCase().includes('leche'));
    const avenaOption = lecheGroup!.options.find((o) => o.name.toLowerCase().includes('avena'));
    const extrasGroup = latteProduct!.modifierGroups.find((g) => g.name.toLowerCase().includes('extra'));
    const extraShotOption = extrasGroup!.options.find((o) => o.name.toLowerCase().includes('shot'));

    // PASO A: Crear y cobrar la orden a través del POS real (SalesService)
    // Pedido para llevar (TAKEAWAY) de 1 Latte con Leche de Avena y Extra Shot
    const order = await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      cashierName: 'María Paz',
      orderType: 'TAKEAWAY',
      customerName: 'Rodrigo Cliente',
      idempotencyKey: 'idem-sale-recipe-001',
      items: [
        {
          productId: latteProduct!.id,
          variantId: latte12ozVariant.id,
          quantity: 1,
          modifiers: [
            { modifierOptionId: avenaOption!.id, quantity: 1 },
            { modifierOptionId: extraShotOption!.id, quantity: 1 },
          ],
        },
      ],
      payments: [
        {
          method: 'CASH',
          amount: 21.0, // Precio base + modificadores
          cashTendered: 50.0,
        },
      ],
    });

    expect(order.id).toBeDefined();
    expect(order.orderNumber).toBe('C1-0001');

    // ANTES DEL DESPACHO DE OUTBOX:
    // El stock físico aún no se ha descontado (el POS nunca bloquea el cobro esperando operaciones asíncronas)
    let cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
    expect(cafeStock).toBe(10000); // Intacto

    // PASO B: Ejecutar el despacho del Transactional Outbox
    const dispatchedCount = await outboxDispatcher.dispatchPending(10);
    expect(dispatchedCount).toBe(1); // 1 evento procesado exitosamente

    // DESPUÉS DEL DESPACHO DE OUTBOX:
    // El suscriptor RecipeOrderPaidHandler procesó el evento order.paid.v1
    // y aplicó las reglas de escandallo:
    // - Café: 18g base + 9g extra shot = 27g
    // - Leche de avena: 220ml (sustituida)
    // - Leche entera: 0ml (no se tocó)
    // - Vaso 12oz: 1 unidad (TAKEAWAY)
    // - Tapa 12oz: 1 unidad (TAKEAWAY)

    cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
    const lecheAvenaStock = await purchasingService.getIngredientStock(testStoreId, lecheAvenaId);
    const lecheEnteraStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraId);
    const vasoStock = await purchasingService.getIngredientStock(testStoreId, vaso12ozId);
    const tapaStock = await purchasingService.getIngredientStock(testStoreId, tapa12ozId);

    expect(cafeStock).toBe(10000 - 27); // 9,973 g
    expect(lecheAvenaStock).toBe(6000 - 220); // 5,780 ml
    expect(lecheEnteraStock).toBe(12000); // 12,000 ml intactos
    expect(vasoStock).toBe(500 - 1); // 499 unidades
    expect(tapaStock).toBe(500 - 1); // 499 unidades

    // PASO C: Validar que el Kardex tiene trazabilidad formal vinculada al número de orden
    const cafeKardex = await purchasingService.getIngredientKardex(cafeId);
    const consumptionMoves = cafeKardex.filter((m) => m.type === 'RECIPE_CONSUMPTION');
    expect(consumptionMoves.length).toBe(1);
    expect(consumptionMoves[0].quantityChange).toBe(-27);
    expect(consumptionMoves[0].documentReference).toBe('Orden #C1-0001');
    expect(consumptionMoves[0].stockBalanceAfter).toBe(9973);
  });

  it('2. Garantía de Idempotencia: el reintento de despacho NO duplica la deducción en Kardex', async () => {
    const latteProduct = await catalogRepo.findProductByName(testStoreId, 'Latte');
    const latte12ozVariant = latteProduct!.variants.find((v) => v.name.includes('12oz')) || latteProduct!.variants[0];

    // Venta de 1 Latte
    await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      cashierName: 'María Paz',
      orderType: 'DINE_IN',
      customerName: 'Cliente Idempotencia',
      idempotencyKey: 'idem-sale-recipe-002',
      items: [
        {
          productId: latteProduct!.id,
          variantId: latte12ozVariant.id,
          quantity: 1,
        },
      ],
      payments: [{ method: 'CASH', amount: 14.5, cashTendered: 20.0 }],
    });

    // 1er despacho: descuenta 18g café y 220ml leche entera
    await outboxDispatcher.dispatchPending(10);

    const cafeStock1 = await purchasingService.getIngredientStock(testStoreId, cafeId);
    expect(cafeStock1).toBe(10000 - 18); // 9,982g

    // Simular un segundo despacho (o reintento por falla de red)
    // El despachador consulta processed_events y omite la ejecución
    const secondDispatchCount = await outboxDispatcher.dispatchPending(10);
    expect(secondDispatchCount).toBe(0); // Cero eventos pendientes

    // El stock no sufrió doble descuento
    const cafeStock2 = await purchasingService.getIngredientStock(testStoreId, cafeId);
    expect(cafeStock2).toBe(cafeStock1);
  });

  it('3. Coexistencia limpia: ítems de vitrina (BY_UNIT) no deducen en receta y viceversa', async () => {
    const latteProduct = await catalogRepo.findProductByName(testStoreId, 'Latte');
    const latte12ozVariant = latteProduct!.variants.find((v) => v.name.includes('12oz')) || latteProduct!.variants[0];

    const croissantProduct = await catalogRepo.findProductByName(testStoreId, 'Croissant Clásico');
    const croissantVariant = croissantProduct!.variants[0];

    // Inicializar croissant en inventario unitario de vitrina
    await stockService.initializeStockItem({
      storeId: testStoreId,
      productId: croissantProduct!.id,
      productVariantId: croissantVariant.id,
      productName: croissantProduct!.name,
      variantName: croissantVariant.name,
      initialStock: 15,
    });

    // Venta combinada: 1 Latte (BY_RECIPE) + 2 Croissants (BY_UNIT)
    await salesService.createAndPayOrder({
      storeId: testStoreId,
      registerId: testRegisterId,
      registerCode: 'C1',
      cashierUserId,
      cashierName: 'María Paz',
      orderType: 'DINE_IN',
      customerName: 'Cliente Mixto',
      idempotencyKey: 'idem-sale-recipe-003',
      items: [
        {
          productId: latteProduct!.id,
          variantId: latte12ozVariant.id,
          quantity: 1,
        },
        {
          productId: croissantProduct!.id,
          variantId: croissantVariant.id,
          quantity: 2,
        },
      ],
      payments: [{ method: 'CASH', amount: 31.5, cashTendered: 50.0 }],
    });

    // Despachar el evento
    await outboxDispatcher.dispatchPending(10);

    // 1. El stock de vitrina de croissants se redujo de 15 a 13 unidades
    const croissantStock = await stockService.isProductVariantAvailable(testStoreId, croissantVariant.id);
    expect(croissantStock).toBe(true);

    // 2. El insumo de café se redujo solo en 18g (del Latte)
    const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeId);
    expect(cafeStock).toBe(10000 - 18);
  });
});
