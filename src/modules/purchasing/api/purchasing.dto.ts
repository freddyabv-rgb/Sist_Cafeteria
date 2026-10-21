import {
  IngredientCategory,
  InventoryUnit,
} from '../domain/raw-ingredient.entity';
import { PurchaseDocumentType } from '../domain/purchase-order.entity';
import { PurchaseUnit } from '../domain/unit-converter';

export interface RegisterSupplierDto {
  storeId: string;
  taxId: string; // RUC (11 dígitos)
  legalName: string;
  commercialName: string;
  contactName: string;
  phone: string;
  email: string;
  leadTimeDays?: number;
}

export interface RegisterIngredientDto {
  storeId: string;
  code: string;
  name: string;
  category: IngredientCategory;
  inventoryUnit: InventoryUnit;
  initialStock?: number;
  minStockAlert?: number;
  initialCostDec?: number; // Costo inicial si aplica
}

export interface ReceivePurchaseItemInput {
  ingredientId: string;
  purchaseUnit: PurchaseUnit;
  packagesCount: number;
  costPerPackageDecimal: number; // Costo por bulto/paquete en Soles
}

export interface ReceivePurchaseOrderDto {
  storeId: string;
  supplierId: string;
  documentType: PurchaseDocumentType;
  documentNumber: string;
  receptionDate?: Date;
  items: ReceivePurchaseItemInput[];
  receivedByUserId: string;
  notes?: string;
}

export interface AdjustPhysicalStockDto {
  storeId: string;
  ingredientId: string;
  physicalCount: number; // Conteo real pesado/medido
  reason: string;
  adjustedByUserId: string;
}

export interface ValuedInventoryItemDto {
  ingredientId: string;
  code: string;
  name: string;
  category: IngredientCategory;
  inventoryUnit: InventoryUnit;
  currentStock: number;
  minStockAlert: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  averageUnitCostDec: number; // CPP
  totalValuation: number; // currentStock * CPP en Soles
}

export interface ValuedInventoryReportDto {
  storeId: string;
  date: string;
  totalItemsCount: number;
  totalValuation: number; // Suma total del inventario valorizado en Soles
  items: ValuedInventoryItemDto[];
}
