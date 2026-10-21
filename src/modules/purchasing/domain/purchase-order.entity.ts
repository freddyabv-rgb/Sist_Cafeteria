import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';
import { PurchaseUnit } from './unit-converter';

export type PurchaseDocumentType = 'FACTURA' | 'BOLETA' | 'GUIA_REMISION';
export type PurchaseStatus = 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItemProps {
  id: string;
  purchaseOrderId: string;
  ingredientId: string;
  ingredientName: string;
  purchaseUnit: PurchaseUnit;
  packagesCount: number;
  conversionFactor: number;
  totalBaseUnits: number; // packagesCount * conversionFactor
  unitCostPerPackage: Money;
  totalLineCost: Money; // packagesCount * unitCostPerPackage
  costPerBaseUnitDec: number; // totalLineCost / totalBaseUnits
}

export class PurchaseOrderItem extends BaseEntity {
  public purchaseOrderId: string;
  public ingredientId: string;
  public ingredientName: string;
  public purchaseUnit: PurchaseUnit;
  public packagesCount: number;
  public conversionFactor: number;
  public totalBaseUnits: number;
  public unitCostPerPackage: Money;
  public totalLineCost: Money;
  public costPerBaseUnitDec: number;

  constructor(props: PurchaseOrderItemProps) {
    super(props.id);
    this.purchaseOrderId = props.purchaseOrderId;
    this.ingredientId = props.ingredientId;
    this.ingredientName = props.ingredientName;
    this.purchaseUnit = props.purchaseUnit;
    this.packagesCount = props.packagesCount;
    this.conversionFactor = props.conversionFactor;
    this.totalBaseUnits = props.totalBaseUnits;
    this.unitCostPerPackage = props.unitCostPerPackage;
    this.totalLineCost = props.totalLineCost;
    this.costPerBaseUnitDec = props.costPerBaseUnitDec;
  }
}

export interface PurchaseOrderProps {
  id: string;
  storeId: string;
  supplierId: string;
  supplierName: string;
  documentType: PurchaseDocumentType;
  documentNumber: string; // ej. F001-0004521
  receptionDate: Date;
  status: PurchaseStatus;
  items: PurchaseOrderItem[];
  subtotal: Money;
  taxAmount: Money; // IGV 18% si factura
  total: Money;
  receivedByUserId: string;
  notes?: string;
  createdAt: Date;
}

export class PurchaseOrder extends BaseEntity {
  public storeId: string;
  public supplierId: string;
  public supplierName: string;
  public documentType: PurchaseDocumentType;
  public documentNumber: string;
  public receptionDate: Date;
  public status: PurchaseStatus;
  public items: PurchaseOrderItem[];
  public subtotal: Money;
  public taxAmount: Money;
  public total: Money;
  public receivedByUserId: string;
  public notes?: string;
  public createdAt: Date;

  constructor(props: PurchaseOrderProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.supplierId = props.supplierId;
    this.supplierName = props.supplierName;
    this.documentType = props.documentType;
    this.documentNumber = props.documentNumber;
    this.receptionDate = props.receptionDate;
    this.status = props.status;
    this.items = props.items;
    this.subtotal = props.subtotal;
    this.taxAmount = props.taxAmount;
    this.total = props.total;
    this.receivedByUserId = props.receivedByUserId;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
  }
}
