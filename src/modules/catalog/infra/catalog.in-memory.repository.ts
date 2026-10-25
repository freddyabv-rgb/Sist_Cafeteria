import { ICatalogRepository } from './catalog.repository.interface';
import { Category } from '../domain/category.entity';
import { Product } from '../domain/product.entity';
import { ModifierGroup } from '../domain/modifier.entity';

export class InMemoryCatalogRepository implements ICatalogRepository {
  private categories = new Map<string, Category>();
  private modifierGroups = new Map<string, ModifierGroup>();
  private products = new Map<string, Product>();

  // Categorías
  public async saveCategory(category: Category): Promise<void> {
    this.categories.set(category.id, category);
  }

  public async findCategories(storeId: string): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter((c) => c.storeId === storeId && c.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async findCategoryById(id: string): Promise<Category | null> {
    return this.categories.get(id) || null;
  }

  // Grupos de Modificadores
  public async saveModifierGroup(group: ModifierGroup): Promise<void> {
    this.modifierGroups.set(group.id, group);
  }

  public async findModifierGroups(storeId: string): Promise<ModifierGroup[]> {
    return Array.from(this.modifierGroups.values()).filter((g) => g.storeId === storeId);
  }

  public async findModifierGroupById(id: string): Promise<ModifierGroup | null> {
    return this.modifierGroups.get(id) || null;
  }

  // Productos
  public async saveProduct(product: Product): Promise<void> {
    this.products.set(product.id, product);
  }

  public async findProducts(storeId: string, categoryId?: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => {
      const matchStore = p.storeId === storeId && p.isActive;
      return categoryId ? matchStore && p.categoryId === categoryId : matchStore;
    });
  }

  public async findProductById(id: string): Promise<Product | null> {
    return this.products.get(id) || null;
  }

  public async findProductByName(storeId: string, name: string): Promise<Product | null> {
    for (const prod of this.products.values()) {
      if (prod.storeId === storeId && prod.name.trim().toLowerCase() === name.trim().toLowerCase()) {
        return prod;
      }
    }
    return null;
  }

  public async setProductAvailability(id: string, isAvailable: boolean): Promise<void> {
    const prod = this.products.get(id);
    if (prod) {
      prod.setAvailable(isAvailable);
    }
  }

  public clear(): void {
    this.categories.clear();
    this.modifierGroups.clear();
    this.products.clear();
  }
}
