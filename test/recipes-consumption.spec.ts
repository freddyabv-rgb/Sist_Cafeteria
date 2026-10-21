import { InMemoryPurchasingRepository } from '../src/modules/purchasing/infra/purchasing.in-memory.repository';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { PurchasingService } from '../src/modules/purchasing/services/purchasing.service';
import { InMemoryRecipeRepository } from '../src/modules/recipes/infra/recipe.in-memory.repository';
import { RecipesService } from '../src/modules/recipes/services/recipes.service';
import { RecipeOrderPaidHandler } from '../src/modules/recipes/handlers/recipe-order-paid.handler';
import { DomainEvent } from '../src/shared-kernel/types/domain-event';

describe('Paso 11: Recetas de Taza (Escandallo de Barra por gramos de café y ml de leche)', () => {
  let purchasingRepo: InMemoryPurchasingRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let outboxDispatcher: OutboxDispatcherService;
  let purchasingService: PurchasingService;

  let recipeRepo: InMemoryRecipeRepository;
  let recipesService: RecipesService;
  let recipeOrderPaidHandler: RecipeOrderPaidHandler;

  const testStoreId = 'store-benevento-01';

  // IDs de Insumos Base
  let cafeIngredientId: string;
  let lecheEnteraIngredientId: string;
  let lecheAvenaIngredientId: string;
  let jarabeVainillaIngredientId: string;
  let vaso12ozIngredientId: string;
  let tapa12ozIngredientId: string;

  // IDs de Variantes de Menú
  const varLatte12oz = 'var-latte-12oz';
  const varEspresso8oz = 'var-espresso-8oz';
  const varFlatWhite8oz = 'var-flatwhite-8oz';

  // IDs de Opciones de Modificadores
  const optLecheAvena = 'opt-leche-avena';
  const optExtraShot = 'opt-extra-shot';
  const optJarabeVainilla = 'opt-jarabe-vainilla';

  beforeEach(async () => {
    purchasingRepo = new InMemoryPurchasingRepository();
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);
    purchasingService = new PurchasingService(purchasingRepo, outboxWriter);

    recipeRepo = new InMemoryRecipeRepository();
    recipesService = new RecipesService(recipeRepo);
    recipeOrderPaidHandler = new RecipeOrderPaidHandler(recipesService, purchasingService);

    outboxDispatcher.registerHandler('order.paid.v1', recipeOrderPaidHandler);

    // 1. Inicializar Insumos en el Catálogo de Compras
    const cafe = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-CAFE-ESP',
      name: 'Café de Especialidad Grano - Origen Cusco',
      category: 'COFFEE_BEANS',
      inventoryUnit: 'GRAM',
      initialStock: 10000, // 10,000 g (10kg)
      initialCostDec: 0.065, // S/ 0.065 por gramo (S/ 65.00/kg)
    });
    cafeIngredientId = cafe.id;

    const lecheEntera = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-ENTERA',
      name: 'Leche Fresca Entera',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 12000, // 12,000 ml (12 Litros)
      initialCostDec: 0.0055, // S/ 0.0055 por ml (S/ 5.50/Litro)
    });
    lecheEnteraIngredientId = lecheEntera.id;

    const lecheAvena = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-LECHE-AVENA',
      name: 'Bebida de Avena Barista',
      category: 'DAIRY_AND_PLANT',
      inventoryUnit: 'MILLILITER',
      initialStock: 6000, // 6,000 ml (6 Litros)
      initialCostDec: 0.012, // S/ 0.012 por ml (S/ 12.00/Litro)
    });
    lecheAvenaIngredientId = lecheAvena.id;

    const jarabe = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-JARABE-VAINILLA',
      name: 'Jarabe de Vainilla Francesa',
      category: 'SYRUPS',
      inventoryUnit: 'MILLILITER',
      initialStock: 1000, // 1,000 ml (1 Botella)
      initialCostDec: 0.035, // S/ 0.035 por ml (S/ 35.00/Botella)
    });
    jarabeVainillaIngredientId = jarabe.id;

    const vaso = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-VASO-12OZ',
      name: 'Vaso Biodegradable 12oz',
      category: 'PACKAGING',
      inventoryUnit: 'UNIT',
      initialStock: 500,
      initialCostDec: 0.35, // S/ 0.35 c/u
    });
    vaso12ozIngredientId = vaso.id;

    const tapa = await purchasingService.registerIngredient({
      storeId: testStoreId,
      code: 'INS-TAPA-12OZ',
      name: 'Tapa Viajera Biodegradable 12oz',
      category: 'PACKAGING',
      inventoryUnit: 'UNIT',
      initialStock: 500,
      initialCostDec: 0.15, // S/ 0.15 c/u
    });
    tapa12ozIngredientId = tapa.id;

    // 2. Configurar Recetas Base
    // A. Receta Espresso Single (8oz): 9g café
    await recipesService.createRecipe({
      storeId: testStoreId,
      productVariantId: varEspresso8oz,
      recipeName: 'Receta Espresso Single',
      yieldQuantity: 1,
      ingredients: [
        {
          ingredientId: cafeIngredientId,
          ingredientName: 'Café de Especialidad',
          quantity: 9, // 9 gramos
          unit: 'GRAM',
          isSubstitutable: false,
        },
      ],
    });

    // B. Receta Latte (12oz): 18g café + 220ml leche entera (sustituible)
    await recipesService.createRecipe({
      storeId: testStoreId,
      productVariantId: varLatte12oz,
      recipeName: 'Receta Latte 12oz',
      yieldQuantity: 1,
      ingredients: [
        {
          ingredientId: cafeIngredientId,
          ingredientName: 'Café de Especialidad',
          quantity: 18, // 18 gramos
          unit: 'GRAM',
          isSubstitutable: false,
        },
        {
          ingredientId: lecheEnteraIngredientId,
          ingredientName: 'Leche Fresca Entera',
          quantity: 220, // 220 ml
          unit: 'MILLILITER',
          isSubstitutable: true,
          substitutableGroup: 'DAIRY',
        },
      ],
    });

    // C. Receta Flat White (8oz): 18g café + 150ml leche entera (sustituible)
    await recipesService.createRecipe({
      storeId: testStoreId,
      productVariantId: varFlatWhite8oz,
      recipeName: 'Receta Flat White 8oz',
      yieldQuantity: 1,
      ingredients: [
        {
          ingredientId: cafeIngredientId,
          ingredientName: 'Café de Especialidad',
          quantity: 18, // 18 gramos
          unit: 'GRAM',
          isSubstitutable: false,
        },
        {
          ingredientId: lecheEnteraIngredientId,
          ingredientName: 'Leche Fresca Entera',
          quantity: 150, // 150 ml
          unit: 'MILLILITER',
          isSubstitutable: true,
          substitutableGroup: 'DAIRY',
        },
      ],
    });

    // 3. Configurar Impacto de Modificadores
    // A. Leche de Avena: Sustituye la leche del grupo 'DAIRY'
    await recipesService.configureModifierImpact({
      storeId: testStoreId,
      modifierOptionId: optLecheAvena,
      optionName: 'Leche de Avena',
      action: 'SUBSTITUTE',
      targetIngredientId: lecheAvenaIngredientId,
      targetIngredientName: 'Bebida de Avena',
      targetSubstitutableGroup: 'DAIRY',
      unit: 'MILLILITER',
    });

    // B. Extra Shot Espresso: Suma 9g de café
    await recipesService.configureModifierImpact({
      storeId: testStoreId,
      modifierOptionId: optExtraShot,
      optionName: 'Extra Shot Espresso',
      action: 'ADD',
      targetIngredientId: cafeIngredientId,
      targetIngredientName: 'Café de Especialidad',
      quantityDelta: 9,
      unit: 'GRAM',
    });

    // C. Shot Jarabe de Vainilla: Suma 20ml de jarabe
    await recipesService.configureModifierImpact({
      storeId: testStoreId,
      modifierOptionId: optJarabeVainilla,
      optionName: 'Shot Jarabe Vainilla',
      action: 'ADD',
      targetIngredientId: jarabeVainillaIngredientId,
      targetIngredientName: 'Jarabe de Vainilla',
      quantityDelta: 20,
      unit: 'MILLILITER',
    });

    // 4. Configurar Regla de Empaque Descartable (TAKEAWAY) para Latte 12oz
    await recipesService.configurePackagingRule({
      storeId: testStoreId,
      productVariantId: varLatte12oz,
      items: [
        {
          ingredientId: vaso12ozIngredientId,
          ingredientName: 'Vaso Biodegradable 12oz',
          quantity: 1,
        },
        {
          ingredientId: tapa12ozIngredientId,
          ingredientName: 'Tapa Viajera 12oz',
          quantity: 1,
        },
      ],
    });
  });

  describe('1. Costeo Teórico por Taza (Escandallo)', () => {
    it('debe calcular el costo teórico exacto de un Espresso Single (8oz)', async () => {
      const costsMap = new Map<string, number>([
        [cafeIngredientId, 0.065], // S/ 0.065 por gramo
      ]);

      const cost = await recipesService.calculateTheoreticalCost(testStoreId, varEspresso8oz, costsMap);

      expect(cost.productVariantId).toBe(varEspresso8oz);
      // 9g * 0.065 = S/ 0.585
      expect(cost.totalCost).toBe(0.585);
      expect(cost.breakdown.length).toBe(1);
      expect(cost.breakdown[0].subtotalCost).toBe(0.585);
    });

    it('debe calcular el costo teórico exacto de un Latte (12oz)', async () => {
      const costsMap = new Map<string, number>([
        [cafeIngredientId, 0.065], // 18g * 0.065 = S/ 1.17
        [lecheEnteraIngredientId, 0.0055], // 220ml * 0.0055 = S/ 1.21
      ]);

      const cost = await recipesService.calculateTheoreticalCost(testStoreId, varLatte12oz, costsMap);

      // Costo total = 1.17 + 1.21 = S/ 2.38
      expect(cost.totalCost).toBe(2.38);
      expect(cost.breakdown.length).toBe(2);
      expect(cost.breakdown[0].subtotalCost).toBe(1.17);
      expect(cost.breakdown[1].subtotalCost).toBe(1.21);
    });
  });

  describe('2. Consumo en Salón (DINE_IN) — Sin Descartables', () => {
    it('debe descontar café y leche fresca sin tocar los vasos descartables', async () => {
      // Pedido de 1 Latte 12oz en salón (DINE_IN)
      const orderPaidEvent: DomainEvent<any> = {
        eventId: 'evt-order-dinein-1',
        eventType: 'order.paid.v1',
        schemaVersion: 1,
        occurredAt: new Date(),
        storeId: testStoreId,
        payload: {
          orderId: 'ord-dinein-001',
          orderNumber: 'C1-0010',
          orderType: 'DINE_IN',
          items: [
            {
              orderItemId: 'item-1',
              productVariantId: varLatte12oz,
              productName: 'Latte',
              variantName: '12oz',
              station: 'BARRA',
              quantity: 1,
              modifiers: [],
            },
          ],
        },
      };

      // Publicar en Outbox y despachar
      await outboxWriter.writeEvent(orderPaidEvent);
      const unpublished = await outboxStorage.findUnpublishedEvents();
      await outboxDispatcher.dispatchSingleEvent(unpublished[0]);

      // Verificar existencias resultantes
      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeIngredientId);
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraIngredientId);
      const vasoStock = await purchasingService.getIngredientStock(testStoreId, vaso12ozIngredientId);

      // Café: 10,000g - 18g = 9,982g
      expect(cafeStock).toBe(9982);
      // Leche: 12,000ml - 220ml = 11,780ml
      expect(lecheStock).toBe(11780);
      // Vasos: No se descontaron por ser DINE_IN (se sirve en taza de cerámica)
      expect(vasoStock).toBe(500);

      // Verificar Kardex de café y leche
      const cafeKardex = await purchasingService.getIngredientKardex(cafeIngredientId);
      const recipeDeductions = cafeKardex.filter((m) => m.type === 'RECIPE_CONSUMPTION');
      expect(recipeDeductions.length).toBe(1);
      expect(recipeDeductions[0].quantityChange).toBe(-18);
      expect(recipeDeductions[0].documentReference).toBe('Orden #C1-0010');
    });
  });

  describe('3. Consumo Para Llevar (TAKEAWAY) con Modificadores Avanzados', () => {
    it('debe aplicar sustitución de leche por avena, extra shot, jarabe y descartables', async () => {
      // 1 Latte 12oz para llevar (TAKEAWAY) con:
      // - Leche de Avena (sustituye 220ml de leche entera por 220ml de avena)
      // - Extra Shot (+9g café -> total 27g)
      // - Shot Jarabe de Vainilla (+20ml jarabe)
      // - Descartables (1 vaso 12oz + 1 tapa 12oz)
      const orderPaidEvent: DomainEvent<any> = {
        eventId: 'evt-order-takeaway-1',
        eventType: 'order.paid.v1',
        schemaVersion: 1,
        occurredAt: new Date(),
        storeId: testStoreId,
        payload: {
          orderId: 'ord-takeaway-002',
          orderNumber: 'C1-0020',
          orderType: 'TAKEAWAY',
          items: [
            {
              orderItemId: 'item-2',
              productVariantId: varLatte12oz,
              productName: 'Latte',
              variantName: '12oz',
              station: 'BARRA',
              quantity: 1,
              modifiers: [
                { modifierOptionId: optLecheAvena, quantity: 1 },
                { modifierOptionId: optExtraShot, quantity: 1 },
                { modifierOptionId: optJarabeVainilla, quantity: 1 },
              ],
            },
          ],
        },
      };

      await outboxWriter.writeEvent(orderPaidEvent);
      const unpublished = await outboxStorage.findUnpublishedEvents();
      await outboxDispatcher.dispatchSingleEvent(unpublished[0]);

      // Verificar existencias
      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeIngredientId);
      const lecheEnteraStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraIngredientId);
      const lecheAvenaStock = await purchasingService.getIngredientStock(testStoreId, lecheAvenaIngredientId);
      const jarabeStock = await purchasingService.getIngredientStock(testStoreId, jarabeVainillaIngredientId);
      const vasoStock = await purchasingService.getIngredientStock(testStoreId, vaso12ozIngredientId);
      const tapaStock = await purchasingService.getIngredientStock(testStoreId, tapa12ozIngredientId);

      // Café: 10,000g - (18 + 9)g = 9,973g
      expect(cafeStock).toBe(9973);

      // Leche entera: NINGÚN descuento (permanece en 12,000ml)
      expect(lecheEnteraStock).toBe(12000);

      // Leche de avena: 6,000ml - 220ml = 5,780ml
      expect(lecheAvenaStock).toBe(5780);

      // Jarabe vainilla: 1,000ml - 20ml = 980ml
      expect(jarabeStock).toBe(980);

      // Descartables (TAKEAWAY):
      // Vaso 12oz: 500 - 1 = 499 unidades
      expect(vasoStock).toBe(499);
      // Tapa 12oz: 500 - 1 = 499 unidades
      expect(tapaStock).toBe(499);
    });
  });

  describe('4. Pedidos con Múltiples Unidades y Filtrado por Estación', () => {
    it('debe multiplicar proporcionalmente insumos en ventas de 2 Flat Whites', async () => {
      // 2 Flat Whites 8oz en salón (DINE_IN)
      // Cada uno: 18g café + 150ml leche entera
      // Total esperado: 36g café y 300ml leche entera
      const orderPaidEvent: DomainEvent<any> = {
        eventId: 'evt-order-multi-1',
        eventType: 'order.paid.v1',
        schemaVersion: 1,
        occurredAt: new Date(),
        storeId: testStoreId,
        payload: {
          orderId: 'ord-multi-003',
          orderNumber: 'C1-0030',
          orderType: 'DINE_IN',
          items: [
            {
              orderItemId: 'item-3',
              productVariantId: varFlatWhite8oz,
              productName: 'Flat White',
              variantName: '8oz',
              station: 'BARRA',
              quantity: 2,
              modifiers: [],
            },
          ],
        },
      };

      await outboxWriter.writeEvent(orderPaidEvent);
      const unpublished = await outboxStorage.findUnpublishedEvents();
      await outboxDispatcher.dispatchSingleEvent(unpublished[0]);

      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeIngredientId);
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraIngredientId);

      // Café: 10,000g - 36g = 9,964g
      expect(cafeStock).toBe(9964);
      // Leche: 12,000ml - 300ml = 11,700ml
      expect(lecheStock).toBe(11700);
    });

    it('no debe descontar recetas de barra si la comanda solo contiene ítems de VITRINA', async () => {
      const orderPaidEvent: DomainEvent<any> = {
        eventId: 'evt-order-vitrina-only',
        eventType: 'order.paid.v1',
        schemaVersion: 1,
        occurredAt: new Date(),
        storeId: testStoreId,
        payload: {
          orderId: 'ord-vitrina-004',
          orderNumber: 'C1-0040',
          orderType: 'TAKEAWAY',
          items: [
            {
              orderItemId: 'item-4',
              productVariantId: 'var-croissant-unit',
              productName: 'Croissant Francés',
              variantName: 'Unidad',
              station: 'VITRINA', // No es BARRA
              quantity: 2,
              modifiers: [],
            },
          ],
        },
      };

      await outboxWriter.writeEvent(orderPaidEvent);
      const unpublished = await outboxStorage.findUnpublishedEvents();
      await outboxDispatcher.dispatchSingleEvent(unpublished[0]);

      const cafeStock = await purchasingService.getIngredientStock(testStoreId, cafeIngredientId);
      const lecheStock = await purchasingService.getIngredientStock(testStoreId, lecheEnteraIngredientId);

      // Stock permanece 100% inalterado
      expect(cafeStock).toBe(10000);
      expect(lecheStock).toBe(12000);
    });
  });
});
