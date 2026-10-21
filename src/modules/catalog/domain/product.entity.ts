import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';
import { ModifierGroup } from './modifier.entity';

export interface ProductVariantProps {
  id: string;
  productId: string;
  name: string; // ej. "8oz", "12oz", "16oz", "Unidad", "1 Bola", "2 Bolas"
  price: Money;
  sku?: string;
}

export class ProductVariant extends BaseEntity {
  public productId: string;
  public name: string;
  public price: Money;
  public sku?: string;

  constructor(props: ProductVariantProps) {
    super(props.id);
    this.productId = props.productId;
    this.name = props.name;
    this.price = props.price;
    this.sku = props.sku;
  }
}

export type ProductSource = 'OWN' | 'THIRD_PARTY';
export type TrackingMode = 'BY_UNIT' | 'BY_RECIPE' | 'NONE';
export type PrepStation = 'BARRA' | 'COCINA' | 'VITRINA';

export interface ProductProps {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  shortName?: string;
  source: ProductSource;
  trackingMode: TrackingMode;
  prepStation: PrepStation;
  taxCode: string; // "IGV_GRAVADO" | "EXONERADO"
  isAvailable: boolean;
  allergenTags: string[];
  isActive: boolean;
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
}

export class Product extends BaseEntity {
  public storeId: string;
  public categoryId: string;
  public name: string;
  public shortName?: string;
  public source: ProductSource;
  public trackingMode: TrackingMode;
  public prepStation: PrepStation;
  public taxCode: string;
  public isAvailable: boolean;
  public allergenTags: string[];
  public isActive: boolean;
  public variants: ProductVariant[];
  public modifierGroups: ModifierGroup[];

  constructor(props: ProductProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.categoryId = props.categoryId;
    this.name = props.name;
    this.shortName = props.shortName;
    this.source = props.source;
    this.trackingMode = props.trackingMode;
    this.prepStation = props.prepStation;
    this.taxCode = props.taxCode;
    this.isAvailable = props.isAvailable;
    this.allergenTags = props.allergenTags;
    this.isActive = props.isActive;
    this.variants = props.variants;
    this.modifierGroups = props.modifierGroups;
  }

  public getVariant(variantId: string): ProductVariant | undefined {
    return this.variants.find((v) => v.id === variantId);
  }

  public setAvailable(available: boolean): void {
    this.isAvailable = available;
  }
}
