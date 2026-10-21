import { IPurchasingRepository } from './purchasing.repository.interface';
import { Supplier } from '../domain/supplier.entity';
import { RawIngredient } from '../domain/raw-ingredient.entity';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { KardexMovement } from '../domain/kardex-movement.entity';

export class InMemoryPurchasingRepository implements IPurchasingRepository {
  private suppliers = new Map<string, Supplier>();
  private ingredients = new Map<string, RawIngredient>();
  private purchaseOrders = new Map<string, PurchaseOrder>();
  private kardexMovements: KardexMovement[] = [];

  // Proveedores
  public async saveSupplier(supplier: Supplier): Promise<void> {
    this.suppliers.set(supplier.id, supplier);
  }

  public async findSupplierById(id: string): Promise<Supplier | null> {
    return this.suppliers.get(id) || null;
  }

  public async findSupplierByTaxId(storeId: string, taxId: string): Promise<Supplier | null> {
    return (
      Array.from(this.suppliers.values()).find(
        (s) => s.storeId === storeId && s.taxId === taxId,
      ) || null
    );
  }

  public async findAllSuppliers(storeId: string): Promise<Supplier[]> {
    return Array.from(this.suppliers.values()).filter((s) => s.storeId === storeId);
  }

  // Insumos
  public async saveIngredient(ingredient: RawIngredient): Promise<void> {
    this.ingredients.set(ingredient.id, ingredient);
  }

  public async findIngredientById(id: string): Promise<RawIngredient | null> {
    return this.ingredients.get(id) || null;
  }

  public async findIngredientByCode(storeId: string, code: string): Promise<RawIngredient | null> {
    return (
      Array.from(this.ingredients.values()).find(
        (i) => i.storeId === storeId && i.code === code,
      ) || null
    );
  }

  public async findAllIngredients(storeId: string): Promise<RawIngredient[]> {
    return Array.from(this.ingredients.values()).filter((i) => i.storeId === storeId);
  }

  // Órdenes de Compra
  public async savePurchaseOrder(order: PurchaseOrder): Promise<void> {
    this.purchaseOrders.set(order.id, order);
  }

  public async findPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
    return this.purchaseOrders.get(id) || null;
  }

  public async findAllPurchaseOrders(storeId: string): Promise<PurchaseOrder[]> {
    return Array.from(this.purchaseOrders.values()).filter((o) => o.storeId === storeId);
  }

  // Kardex
  public async saveKardexMovement(movement: KardexMovement): Promise<void> {
    this.kardexMovements.push(movement);
  }

  public async findKardexByIngredient(ingredientId: string): Promise<KardexMovement[]> {
    return this.kardexMovements
      .filter((m) => m.ingredientId === ingredientId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async findAllKardex(storeId: string): Promise<KardexMovement[]> {
    return this.kardexMovements
      .filter((m) => m.storeId === storeId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public clear(): void {
    this.suppliers.clear();
    this.ingredients.clear();
    this.purchaseOrders.clear();
    this.kardexMovements = [];
  }
}
