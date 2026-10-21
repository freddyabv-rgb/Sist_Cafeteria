import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { ICatalogRepository } from '../infra/catalog.repository.interface';
import { Category } from '../domain/category.entity';
import { Product, ProductVariant, PrepStation, ProductSource, TrackingMode } from '../domain/product.entity';
import { ModifierGroup, ModifierOption } from '../domain/modifier.entity';

@Injectable()
export class CsvImporterService {
  constructor(
    @Inject('CATALOG_REPOSITORY')
    private readonly catalogRepo: ICatalogRepository,
  ) {}

  /**
   * Inicializa los grupos de modificadores predeterminados de Benevento.
   */
  public async seedDefaultModifierGroups(storeId: string): Promise<Map<string, ModifierGroup>> {
    const groupsMap = new Map<string, ModifierGroup>();

    // 1. Tipo de Leche
    const milkGroup = new ModifierGroup({
      id: uuidv4(),
      storeId,
      name: 'Tipo de Leche',
      minSelections: 0,
      maxSelections: 1,
      isRequired: false,
      options: [
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Leche Entera',
          priceDelta: Money.fromDecimal(0.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: ['LÁCTEOS'],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Leche Deslactosada',
          priceDelta: Money.fromDecimal(0.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: [],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Leche de Avena',
          priceDelta: Money.fromDecimal(2.5),
          maxQuantity: 1,
          highlightKds: true, // Crítico para barista
          allergenTags: ['GLUTEN'],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Leche de Almendras',
          priceDelta: Money.fromDecimal(2.5),
          maxQuantity: 1,
          highlightKds: true, // Crítico para barista
          allergenTags: ['FRUTOS_SECOS'],
        }),
      ],
    });
    // Fijar IDs de grupo a las opciones
    milkGroup.options.forEach((opt) => (opt.modifierGroupId = milkGroup.id));
    await this.catalogRepo.saveModifierGroup(milkGroup);
    groupsMap.set('Tipo de Leche', milkGroup);

    // 2. Extras de Café
    const extrasGroup = new ModifierGroup({
      id: uuidv4(),
      storeId,
      name: 'Extras de Café',
      minSelections: 0,
      maxSelections: 4,
      isRequired: false,
      options: [
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Extra Shot Espresso',
          priceDelta: Money.fromDecimal(3.0),
          maxQuantity: 3,
          highlightKds: true,
          allergenTags: [],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Jarabe de Vainilla Francesa',
          priceDelta: Money.fromDecimal(2.0),
          maxQuantity: 2,
          highlightKds: false,
          allergenTags: [],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Jarabe de Caramelo Salado',
          priceDelta: Money.fromDecimal(2.0),
          maxQuantity: 2,
          highlightKds: false,
          allergenTags: [],
        }),
      ],
    });
    extrasGroup.options.forEach((opt) => (opt.modifierGroupId = extrasGroup.id));
    await this.catalogRepo.saveModifierGroup(extrasGroup);
    groupsMap.set('Extras de Café', extrasGroup);

    // 3. Endulzante
    const sweetGroup = new ModifierGroup({
      id: uuidv4(),
      storeId,
      name: 'Endulzante',
      minSelections: 0,
      maxSelections: 1,
      isRequired: false,
      options: [
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Sin Azúcar',
          priceDelta: Money.fromDecimal(0.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: [],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Panela Orgánica',
          priceDelta: Money.fromDecimal(0.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: [],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Stevia Natural',
          priceDelta: Money.fromDecimal(0.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: [],
        }),
      ],
    });
    sweetGroup.options.forEach((opt) => (opt.modifierGroupId = sweetGroup.id));
    await this.catalogRepo.saveModifierGroup(sweetGroup);
    groupsMap.set('Endulzante', sweetGroup);

    // 4. Toppings de Helado
    const gelatoToppingGroup = new ModifierGroup({
      id: uuidv4(),
      storeId,
      name: 'Toppings de Helado',
      minSelections: 0,
      maxSelections: 3,
      isRequired: false,
      options: [
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Fudge Artesanal Caliente',
          priceDelta: Money.fromDecimal(2.5),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: ['LÁCTEOS'],
        }),
        new ModifierOption({
          id: uuidv4(),
          modifierGroupId: '',
          name: 'Praliné de Avellanas',
          priceDelta: Money.fromDecimal(3.0),
          maxQuantity: 1,
          highlightKds: false,
          allergenTags: ['FRUTOS_SECOS'],
        }),
      ],
    });
    gelatoToppingGroup.options.forEach((opt) => (opt.modifierGroupId = gelatoToppingGroup.id));
    await this.catalogRepo.saveModifierGroup(gelatoToppingGroup);
    groupsMap.set('Toppings de Helado', gelatoToppingGroup);

    return groupsMap;
  }

  /**
   * Importa productos y categorías a partir de un string con contenido CSV.
   */
  public async importFromCsv(storeId: string, csvContent: string): Promise<{ categoriesCount: number; productsCount: number }> {
    const modifierGroupsMap = await this.seedDefaultModifierGroups(storeId);
    const lines = csvContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    const categoriesCache = new Map<string, Category>();
    const productsMap = new Map<string, { product: Product; rawModifiers: string }>();

    let displayOrderCounter = 1;

    // Omitir cabecera si existe
    const startIndex = lines[0].startsWith('category,') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 4) continue;

      const [categoryName, productName, variantName, priceStr, stationStr, sourceStr, trackingStr, modGroupsStr] = parts;

      // 1. Obtener o crear Categoría
      let category = categoriesCache.get(categoryName);
      if (!category) {
        category = new Category({
          id: uuidv4(),
          storeId,
          name: categoryName,
          displayOrder: displayOrderCounter++,
          isActive: true,
        });
        await this.catalogRepo.saveCategory(category);
        categoriesCache.set(categoryName, category);
      }

      // 2. Obtener o crear Producto (agrupando variantes por nombre de producto)
      const productKey = `${categoryName}:${productName}`;
      let prodEntry = productsMap.get(productKey);

      if (!prodEntry) {
        const product = new Product({
          id: uuidv4(),
          storeId,
          categoryId: category.id,
          name: productName,
          source: (sourceStr as ProductSource) || 'OWN',
          trackingMode: (trackingStr as TrackingMode) || 'BY_UNIT',
          prepStation: (stationStr as PrepStation) || 'BARRA',
          taxCode: 'IGV_GRAVADO',
          isAvailable: true,
          allergenTags: [],
          isActive: true,
          variants: [],
          modifierGroups: [],
        });

        prodEntry = { product, rawModifiers: modGroupsStr || '' };
        productsMap.set(productKey, prodEntry);
      }

      // 3. Agregar Variante de tamaño/presentación
      const variant = new ProductVariant({
        id: uuidv4(),
        productId: prodEntry.product.id,
        name: variantName,
        price: Money.fromDecimal(parseFloat(priceStr)),
      });
      prodEntry.product.variants.push(variant);
    }

    // 4. Asignar los grupos de modificadores vinculados y persistir productos
    let savedProductsCount = 0;
    for (const { product, rawModifiers } of productsMap.values()) {
      if (rawModifiers) {
        const groupNames = rawModifiers.split(';').map((g) => g.trim());
        for (const gName of groupNames) {
          const modGroup = modifierGroupsMap.get(gName);
          if (modGroup) {
            product.modifierGroups.push(modGroup);
          }
        }
      }
      await this.catalogRepo.saveProduct(product);
      savedProductsCount++;
    }

    return {
      categoriesCount: categoriesCache.size,
      productsCount: savedProductsCount,
    };
  }
}
