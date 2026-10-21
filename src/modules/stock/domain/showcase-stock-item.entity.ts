import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export interface ShowcaseStockItemProps {
  id: string;
  storeId: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  currentStock: number;
  minStockAlert: number;
  allowNegative: boolean;
  unitCost: Money;
  lastUpdated: Date;
}

export class ShowcaseStockItem extends BaseEntity {
  public storeId: string;
  public productId: string;
  public productVariantId: string;
  public productName: string;
  public variantName: string;
  public currentStock: number;
  public minStockAlert: number;
  public allowNegative: boolean;
  public unitCost: Money;
  public lastUpdated: Date;

  constructor(props: ShowcaseStockItemProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.productId = props.productId;
    this.productVariantId = props.productVariantId;
    this.productName = props.productName;
    this.variantName = props.variantName;
    this.currentStock = props.currentStock;
    this.minStockAlert = props.minStockAlert;
    this.allowNegative = props.allowNegative;
    this.unitCost = props.unitCost;
    this.lastUpdated = props.lastUpdated;
  }

  public isOutOfStock(): boolean {
    return this.currentStock <= 0;
  }

  public isLowStock(): boolean {
    return this.currentStock > 0 && this.currentStock <= this.minStockAlert;
  }

  public deduct(quantity: number): void {
    if (!this.allowNegative && this.currentStock < quantity) {
      throw new Error(
        `Stock insuficiente para "${this.productName}". Disponible: ${this.currentStock}, Solicitado: ${quantity}`,
      );
    }
    this.currentStock -= quantity;
    this.lastUpdated = new Date();
  }

  public replenish(quantity: number): void {
    this.currentStock += quantity;
    this.lastUpdated = new Date();
  }

  public setPhysicalCount(newCount: number): void {
    this.currentStock = newCount;
    this.lastUpdated = new Date();
  }
}
