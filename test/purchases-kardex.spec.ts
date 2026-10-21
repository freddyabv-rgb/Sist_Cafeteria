import { InMemoryPurchasingRepository } from '../src/modules/purchasing/infra/purchasing.in-memory.repository';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { PurchasingService } from '../src/modules/purchasing/services/purchasing.service';
import { UnitConverter } from '../src/modules/purchasing/domain/unit-converter';

describe('Paso 10: Compras, Proveedores, Kardex y Costo Promedio Ponderado (CPP)', () => {
  let purchasingRepo: InMemoryPurchasingRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let purchasingService: PurchasingService;

  const testStoreId = 'store-benevento-01';
  const supervisorUserId = 'usr-sup-carlos';

  beforeEach(() => {
    purchasingRepo = new InMemoryPurchasingRepository();
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    purchasingService = new PurchasingService(purchasingRepo, outboxWriter);
  });

  describe('1. Proveedores y Validación de RUC', () => {
    it('debe registrar un proveedor exitosamente con RUC de 11 dígitos', async () => {
      const supplier = await purchasingService.registerSupplier({
        storeId: testStoreId,
        taxId: '20601234567',
        legalName: 'CAFÉ ORIGEN CUSCO S.A.C.',
        commercialName: 'Café Origen Cusco',
        contactName: 'Rodrigo Huamán',
        phone: '984123456',
        email: 'ventas@origencusco.pe',
        leadTimeDays: 3,
      });

      expect(supplier.id).toBeDefined();
      expect(supplier.taxId).toBe('20601234567');
      expect(supplier.commercialName).toBe('Café Origen Cusco');
      expect(supplier.leadTimeDays).toBe(3);
    });

    it('debe rechazar un proveedor con RUC inválido (no 11 dígitos)', async () => {
      await expect(
        purchasingService.registerSupplier({
          storeId: testStoreId,
          taxId: '12345678', // 8 dígitos (DNI en vez de RUC)
          legalName: 'PROVEEDOR INVALIDO S.A.C.',
          commercialName: 'Invalido',
          contactName: 'Juan',
          phone: '999888777',
          email: 'invalido@test.pe',
        }),
      ).rejects.toThrow('El RUC del proveedor debe tener exactamente 11 dígitos');
    });

    it('debe rechazar proveedores duplicados con el mismo RUC en la tienda', async () => {
      await purchasingService.registerSupplier({
        storeId: testStoreId,
        taxId: '20609876543',
        legalName: 'LACTEOS DEL SUR S.A.C.',
        commercialName: 'Lácteos del Sur',
        contactName: 'María Paz',
        phone: '954321654',
        email: 'ventas@lacteosdelsur.pe',
      });

      await expect(
        purchasingService.registerSupplier({
          storeId: testStoreId,
          taxId: '20609876543',
          legalName: 'LACTEOS DEL SUR DUPLICADO S.A.C.',
          commercialName: 'Duplicado',
          contactName: 'Pedro',
          phone: '911222333',
          email: 'dup@test.pe',
        }),
      ).rejects.toThrow('Ya existe un proveedor registrado con el RUC');
    });
  });

  describe('2. Conversión de Unidades de Compra', () => {
    it('debe convertir bolsas de café (1kg) a gramos (1,000g)', () => {
      const grams = UnitConverter.convertToBaseUnits('BAG_1KG', 5, 'GRAM');
      expect(grams).toBe(5000); // 5 x 1000g
    });

    it('debe convertir cajas de leche (12L) a mililitros (12,000ml)', () => {
      const ml = UnitConverter.convertToBaseUnits('BOX_12L', 2, 'MILLILITER');
      expect(ml).toBe(24000); // 2 x 12,000ml
    });

    it('debe convertir paquetes de vasos a unidades (PACK_50_UNITS -> 50)', () => {
      const units = UnitConverter.convertToBaseUnits('PACK_50_UNITS', 4, 'UNIT');
      expect(units).toBe(200); // 4 x 50
    });

    it('debe rechazar conversiones de dimensiones incompatibles (Volumen a Masa)', () => {
      expect(() => {
        UnitConverter.convertToBaseUnits('BOX_12L', 1, 'GRAM');
      }).toThrow('Incompatibilidad de dimensiones');
    });
  });

  describe('3. Recepción de Compras y Costo Promedio Ponderado (CPP)', () => {
    it('debe calcular el CPP exacto en compras sucesivas a diferente precio', async () => {
      // 1. Registrar proveedor
      const supplier = await purchasingService.registerSupplier({
        storeId: testStoreId,
        taxId: '20601112223',
        legalName: 'FINCA LA CHIRIMOYAS S.A.C.',
        commercialName: 'Finca Chirimoyas',
        contactName: 'Carlos Finca',
        phone: '987111222',
        email: 'cafe@chirimoyas.pe',
      });

      // 2. Registrar insumo de café de especialidad
      const coffee = await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-CAFE-ESP',
        name: 'Café de Especialidad Grano - Origen Cusco',
        category: 'COFFEE_BEANS',
        inventoryUnit: 'GRAM',
        minStockAlert: 2000, // 2kg
      });

      expect(coffee.currentStock).toBe(0);
      expect(coffee.currentAverageCostDec).toBe(0);

      // 3. Primera Compra: 10 bolsas de 1kg a S/ 60.00 c/u
      // Total: 10,000 gramos, S/ 600.00 -> Costo por gramo = 0.060000 PEN/g
      const purchase1 = await purchasingService.receivePurchaseOrder({
        storeId: testStoreId,
        supplierId: supplier.id,
        documentType: 'FACTURA',
        documentNumber: 'F001-000100',
        receivedByUserId: supervisorUserId,
        items: [
          {
            ingredientId: coffee.id,
            purchaseUnit: 'BAG_1KG',
            packagesCount: 10,
            costPerPackageDecimal: 60.0,
          },
        ],
      });

      expect(purchase1.total.toDecimal()).toBe(600.0);
      expect(purchase1.subtotal.toDecimal() + purchase1.taxAmount.toDecimal()).toBe(600.0);

      // Verificar stock y CPP tras Compra 1
      const coffeeAfterP1 = await purchasingRepo.findIngredientById(coffee.id);
      expect(coffeeAfterP1!.currentStock).toBe(10000); // 10,000g
      expect(coffeeAfterP1!.currentAverageCostDec).toBe(0.06);
      expect(coffeeAfterP1!.getTotalInventoryValue().toDecimal()).toBe(600.0);

      // Verificar Kardex de Compra 1
      const kardexP1 = await purchasingService.getIngredientKardex(coffee.id);
      expect(kardexP1.length).toBe(1);
      expect(kardexP1[0].type).toBe('PURCHASE_RECEIPT');
      expect(kardexP1[0].quantityChange).toBe(10000);
      expect(kardexP1[0].unitCostDec).toBe(0.06);
      expect(kardexP1[0].stockBalanceAfter).toBe(10000);
      expect(kardexP1[0].cppAfterDec).toBe(0.06);
      expect(kardexP1[0].totalInventoryValueAfter.toDecimal()).toBe(600.0);

      // 4. Segunda Compra: 5 bolsas de 1kg a S/ 75.00 c/u (Costo mayor)
      // Entran 5,000 gramos a S/ 375.00 (0.075 PEN/g)
      // Stock Anterior: 10,000g @ 0.060 = S/ 600.00
      // Entrada:         5,000g @ 0.075 = S/ 375.00
      // Total Ponderado: 15,000g por S/ 975.00
      // Nuevo CPP = 975.00 / 15,000 = 0.065000 PEN/g (S/ 65.00 / kg)
      const purchase2 = await purchasingService.receivePurchaseOrder({
        storeId: testStoreId,
        supplierId: supplier.id,
        documentType: 'FACTURA',
        documentNumber: 'F001-000155',
        receivedByUserId: supervisorUserId,
        items: [
          {
            ingredientId: coffee.id,
            purchaseUnit: 'BAG_1KG',
            packagesCount: 5,
            costPerPackageDecimal: 75.0,
          },
        ],
      });

      expect(purchase2.total.toDecimal()).toBe(375.0);

      const coffeeAfterP2 = await purchasingRepo.findIngredientById(coffee.id);
      expect(coffeeAfterP2!.currentStock).toBe(15000); // 15,000g
      expect(coffeeAfterP2!.currentAverageCostDec).toBe(0.065); // CPP exacto: 0.065 PEN/g
      expect(coffeeAfterP2!.getTotalInventoryValue().toDecimal()).toBe(975.0);

      // Verificar Kardex de Compra 2
      const kardexP2 = await purchasingService.getIngredientKardex(coffee.id);
      expect(kardexP2.length).toBe(2);
      expect(kardexP2[1].quantityChange).toBe(5000);
      expect(kardexP2[1].stockBalanceAfter).toBe(15000);
      expect(kardexP2[1].cppAfterDec).toBe(0.065);
      expect(kardexP2[1].totalInventoryValueAfter.toDecimal()).toBe(975.0);

      // Verificar eventos Outbox emitidos
      const events = await outboxStorage.findUnpublishedEvents();
      const purchaseEvents = events.filter((e) => e.eventType === 'purchase.received.v1');
      expect(purchaseEvents.length).toBe(2);
    });
  });

  describe('4. Toma de Inventario Físico y Descuadres (Auditoría)', () => {
    it('debe registrar faltante en inventario físico valorizado al CPP vigente', async () => {
      // Insumo con stock inicial de 10,000g al costo de 0.065 PEN/g
      const coffee = await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-CAFE-AUDIT',
        name: 'Café Grano Auditoria',
        category: 'COFFEE_BEANS',
        inventoryUnit: 'GRAM',
        initialStock: 10000,
        initialCostDec: 0.065,
      });

      // El barista pesa el café en barra al cierre y halla 9,850 gramos (faltante de 150g)
      const adjustment = await purchasingService.adjustPhysicalStock({
        storeId: testStoreId,
        ingredientId: coffee.id,
        physicalCount: 9850,
        reason: 'Conteo físico de fin de turno - merma de molino y tolva no registrada',
        adjustedByUserId: supervisorUserId,
      });

      expect(adjustment.quantityChange).toBe(-150); // Faltante de 150g
      expect(adjustment.stockBalanceAfter).toBe(9850);
      expect(adjustment.cppAfterDec).toBe(0.065);
      // Valorización de la merma: 150g * 0.065 = S/ 9.75
      expect(adjustment.totalMovementCost.toDecimal()).toBe(9.75);

      const coffeeAfter = await purchasingRepo.findIngredientById(coffee.id);
      expect(coffeeAfter!.currentStock).toBe(9850);
      expect(coffeeAfter!.getTotalInventoryValue().toDecimal()).toBe(640.25); // 9850 * 0.065 = S/ 640.25

      // Verificar evento Outbox de ajuste emitido
      const events = await outboxStorage.findUnpublishedEvents();
      const adjustEvent = events.find((e) => e.eventType === 'ingredient.stock_adjusted.v1');
      expect(adjustEvent).toBeDefined();
      expect(adjustEvent!.payload.diffQuantity).toBe(-150);
      expect(adjustEvent!.payload.newStock).toBe(9850);
    });
  });

  describe('5. Puerto de Consumo (IngredientStockPort)', () => {
    it('debe soportar deducciones por receta y mermas operativas respetando el Kardex', async () => {
      // Registrar leche fresca
      const milk = await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-LECHE-ENT',
        name: 'Leche Fresca Entera',
        category: 'DAIRY_AND_PLANT',
        inventoryUnit: 'MILLILITER',
        initialStock: 12000, // 12 Litros
        initialCostDec: 0.0055, // S/ 5.50 por litro = 0.0055 PEN/ml
      });

      // 1. Deducir por receta de venta (ej. 2 lattes = 360ml)
      await purchasingService.deductRecipeIngredients(
        testStoreId,
        [{ ingredientId: milk.id, quantityUnits: 360 }],
        'order-101',
        'C1-0101',
      );

      const milkAfterSale = await purchasingRepo.findIngredientById(milk.id);
      expect(milkAfterSale!.currentStock).toBe(11640); // 12,000 - 360

      // 2. Registrar merma de leche cortada o derramada (200ml)
      await purchasingService.recordWasteOrCalibration(
        testStoreId,
        milk.id,
        200,
        'WASTE_DISPOSAL',
        'Vaso de leche derramado accidentalmente en barra',
        supervisorUserId,
      );

      const milkAfterWaste = await purchasingRepo.findIngredientById(milk.id);
      expect(milkAfterWaste!.currentStock).toBe(11440); // 11,640 - 200

      // Kardex debe tener 3 movimientos: Inicial, Consumo Receta, Merma
      const kardex = await purchasingService.getIngredientKardex(milk.id);
      expect(kardex.length).toBe(3);
      expect(kardex[1].type).toBe('RECIPE_CONSUMPTION');
      expect(kardex[1].quantityChange).toBe(-360);
      expect(kardex[2].type).toBe('WASTE_DISPOSAL');
      expect(kardex[2].quantityChange).toBe(-200);
    });
  });

  describe('6. Reporte Consolidado de Inventario Valorizado', () => {
    it('debe generar el reporte valorizado de todos los insumos de la tienda', async () => {
      // Registrar 3 insumos con stock
      await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-CAFE-VAL',
        name: 'Café Grano',
        category: 'COFFEE_BEANS',
        inventoryUnit: 'GRAM',
        initialStock: 10000,
        initialCostDec: 0.065, // S/ 650.00
      });

      await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-LECHE-VAL',
        name: 'Leche Entera',
        category: 'DAIRY_AND_PLANT',
        inventoryUnit: 'MILLILITER',
        initialStock: 10000,
        initialCostDec: 0.0055, // S/ 55.00
      });

      await purchasingService.registerIngredient({
        storeId: testStoreId,
        code: 'INS-VASOS-VAL',
        name: 'Vasos 8oz',
        category: 'PACKAGING',
        inventoryUnit: 'UNIT',
        initialStock: 500,
        initialCostDec: 0.3, // S/ 150.00
      });

      const report = await purchasingService.getValuedInventoryReport(testStoreId);

      expect(report.storeId).toBe(testStoreId);
      expect(report.totalItemsCount).toBe(3);
      // Total esperado: 650.00 + 55.00 + 150.00 = S/ 855.00
      expect(report.totalValuation).toBe(855.0);

      const cafeItem = report.items.find((i) => i.code === 'INS-CAFE-VAL');
      expect(cafeItem!.totalValuation).toBe(650.0);
      expect(cafeItem!.averageUnitCostDec).toBe(0.065);
    });
  });
});
