import { BaseEntity } from '@shared/types/entity';

export interface PackagingItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number; // Típicamente 1 unidad
}

export interface PackagingRuleProps {
  id: string;
  storeId: string;
  productVariantId: string; // Variante a la que aplica (ej. Vaso 8oz, Vaso 12oz)
  items: PackagingItem[];
  isActive: boolean;
}

export class PackagingRule extends BaseEntity {
  public storeId: string;
  public productVariantId: string;
  public items: PackagingItem[];
  public isActive: boolean;

  constructor(props: PackagingRuleProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.productVariantId = props.productVariantId;
    this.items = props.items;
    this.isActive = props.isActive;
  }
}
