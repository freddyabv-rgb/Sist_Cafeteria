import { Supplier } from '../domain/supplier.entity';
import { RawIngredient } from '../domain/raw-ingredient.entity';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { KardexMovement } from '../domain/kardex-movement.entity';

export interface IPurchasingRepository {
  // Proveedores
  saveSupplier(supplier: Supplier): Promise<void>;
  findSupplierById(id: string): Promise<Supplier | null>;
  findSupplierByTaxId(storeId: string, taxId: string): Promise<Supplier | null>;
  findAllSuppliers(storeId: string): Promise<Supplier[]>;

  // Insumos
  saveIngredient(ingredient: RawIngredient): Promise<void>;
  findIngredientById(id: string): Promise<RawIngredient | null>;
  findIngredientByCode(storeId: string, code: string): Promise<RawIngredient | null>;
  findAllIngredients(storeId: string): Promise<RawIngredient[]>;

  // Órdenes de compra / Ingresos
  savePurchaseOrder(order: PurchaseOrder): Promise<void>;
  findPurchaseOrderById(id: string): Promise<PurchaseOrder | null>;
  findAllPurchaseOrders(storeId: string): Promise<PurchaseOrder[]>;

  // Kardex
  saveKardexMovement(movement: KardexMovement): Promise<void>;
  findKardexByIngredient(ingredientId: string): Promise<KardexMovement[]>;
  findAllKardex(storeId: string): Promise<KardexMovement[]>;
}
