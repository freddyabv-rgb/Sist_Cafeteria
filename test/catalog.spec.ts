import * as fs from 'fs';
import * as path from 'path';
import { InMemoryCatalogRepository } from '../src/modules/catalog/infra/catalog.in-memory.repository';
import { CsvImporterService } from '../src/modules/catalog/services/csv-importer.service';
import { CatalogService } from '../src/modules/catalog/services/catalog.service';
import { PricingService } from '../src/modules/catalog/services/pricing.service';
import { Money } from '../src/shared-kernel/types/money';

describe('Paso 1: Módulo de Catálogo Especializado para Benevento', () => {
  let repository: InMemoryCatalogRepository;
  let csvImporter: CsvImporterService;
  let catalogService: CatalogService;
  let pricingService: PricingService;

  const testStoreId = 'store-benevento-miraflores';

  beforeEach(async () => {
    repository = new InMemoryCatalogRepository();
    csvImporter = new CsvImporterService(repository);
    catalogService = new CatalogService(repository, csvImporter);
    pricingService = new PricingService();

    // Cargar menú real desde el archivo CSV de Benevento
    const csvPath = path.join(__dirname, '../data/benevento-menu-seed.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    await catalogService.importFromCsv(testStoreId, csvContent);
  });

  it('debe importar las categorías y productos de Benevento desde el archivo CSV', async () => {
    const categories = await catalogService.getCategories(testStoreId);
    expect(categories.length).toBeGreaterThanOrEqual(5);

    const categoryNames = categories.map((c) => c.name);
    expect(categoryNames).toContain('Cafetería Caliente');
    expect(categoryNames).toContain('Bebidas Frías');
    expect(categoryNames).toContain('Heladería Artesanal');
    expect(categoryNames).toContain('Pastelería Fina');
    expect(categoryNames).toContain('Sándwiches & Salados');

    const products = await catalogService.getProducts(testStoreId);
    expect(products.length).toBeGreaterThanOrEqual(15);
  });

  it('debe calcular precios exactos con modificadores y desglose de IGV 18% para un Latte de especialidad', async () => {
    const products = await catalogService.getProducts(testStoreId);
    const latte = products.find((p) => p.name === 'Latte');
    expect(latte).toBeDefined();

    const variant12oz = latte!.variants.find((v) => v.name === '12oz');
    expect(variant12oz).toBeDefined();
    expect(variant12oz!.price.toDecimal()).toBe(12.0);

    // Buscar modificador 'Leche de Avena' (+S/ 2.50)
    const milkGroup = latte!.modifierGroups.find((g) => g.name === 'Tipo de Leche');
    expect(milkGroup).toBeDefined();
    const oatMilkOption = milkGroup!.options.find((o) => o.name === 'Leche de Avena');
    expect(oatMilkOption).toBeDefined();

    // Buscar modificador 'Extra Shot Espresso' (+S/ 3.00 c/u)
    const extrasGroup = latte!.modifierGroups.find((g) => g.name === 'Extras de Café');
    expect(extrasGroup).toBeDefined();
    const extraShotOption = extrasGroup!.options.find((o) => o.name === 'Extra Shot Espresso');
    expect(extraShotOption).toBeDefined();

    // Calcular: 1 Latte 12oz (S/ 12.00) + 1 Leche de Avena (S/ 2.50) + 2 Shots Extra (2 x S/ 3.00 = S/ 6.00)
    const calculated = pricingService.calculateItem(
      variant12oz!,
      [
        {
          option: oatMilkOption!,
          groupName: milkGroup!.name,
          quantity: 1,
        },
        {
          option: extraShotOption!,
          groupName: extrasGroup!.name,
          quantity: 2,
        },
      ],
      1,
      true, // con IGV 18% incluido
    );

    // Total: 12.00 + 2.50 + 6.00 = S/ 20.50
    expect(calculated.totalPrice.toDecimal()).toBe(20.5);
    expect(calculated.totalPrice.format()).toBe('S/ 20.50');

    // Desglose fiscal: Subtotal = 20.50 / 1.18 = 17.37, IGV = 3.13
    expect(calculated.subtotalTaxable.toDecimal()).toBe(17.37);
    expect(calculated.taxAmount.toDecimal()).toBe(3.13);
    expect(calculated.subtotalTaxable.add(calculated.taxAmount).toDecimal()).toBe(20.5);

    // Verificar snapshot de modificadores para la base de datos
    expect(calculated.modifiersSnapshot.length).toBe(2);
    expect(calculated.modifiersSnapshot[0].optionName).toBe('Leche de Avena');
    expect(calculated.modifiersSnapshot[0].highlightKds).toBe(true);
    expect(calculated.modifiersSnapshot[1].optionName).toBe('Extra Shot Espresso');
    expect(calculated.modifiersSnapshot[1].quantity).toBe(2);
  });

  it('debe validar la disponibilidad en tiempo real mediante AvailabilityPort', async () => {
    const products = await catalogService.getProducts(testStoreId);
    const croissant = products.find((p) => p.name === 'Croissant de Almendras');
    expect(croissant).toBeDefined();

    // Inicialmente disponible
    let isAvailable = await catalogService.isProductAvailable(croissant!.id);
    expect(isAvailable).toBe(true);

    // Cambiar a Agotado en mostrador
    await catalogService.setProductAvailability(croissant!.id, false);
    isAvailable = await catalogService.isProductAvailable(croissant!.id);
    expect(isAvailable).toBe(false);

    // Reactivar disponibilidad
    await catalogService.setProductAvailability(croissant!.id, true);
    isAvailable = await catalogService.isProductAvailable(croissant!.id);
    expect(isAvailable).toBe(true);
  });

  it('debe enrutar los productos a la estación de preparación correcta', async () => {
    const products = await catalogService.getProducts(testStoreId);

    const americano = products.find((p) => p.name === 'Americano');
    expect(americano!.prepStation).toBe('BARRA');

    const gelato = products.find((p) => p.name === 'Gelato Simple');
    expect(gelato!.prepStation).toBe('VITRINA');

    const toston = products.find((p) => p.name === 'Tostón con Palta');
    expect(toston!.prepStation).toBe('COCINA');
  });
});
