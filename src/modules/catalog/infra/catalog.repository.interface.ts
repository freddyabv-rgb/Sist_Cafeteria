import { Category } from '../domain/category.entity';
import { Product } from '../domain/product.entity';
import { ModifierGroup } from '../domain/modifier.entity';

export interface ICatalogRepository {
  // Categorías
  saveCategory(category: Category): Promise<void>;
  findCategories(storeId: string): Promise<Category[]>;
  findCategoryById(id: string): Promise<Category | null>;

  // Grupos de Modificadores
  saveModifierGroup(group: ModifierGroup): Promise<void>;
  findModifierGroups(storeId: string): Promise<ModifierGroup[]>;
  findModifierGroupById(id: string): Promise<ModifierGroup | null>;

  // Productos
  saveProduct(product: Product): Promise<void>;
  findProducts(storeId: string, categoryId?: string): Promise<Product[]>;
  findProductById(id: string): Promise<Product | null>;
  setProductAvailability(id: string, isAvailable: boolean): Promise<void>;
}
