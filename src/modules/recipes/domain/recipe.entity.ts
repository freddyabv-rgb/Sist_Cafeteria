import { BaseEntity } from '@shared/types/entity';

export type RecipeUnit = 'GRAM' | 'MILLILITER' | 'UNIT';

export interface RecipeIngredientItemProps {
  ingredientId: string;
  ingredientName: string;
  quantity: number; // Cantidad en unidad base (ej. 18 gramos, 220 ml, 1 unidad)
  unit: RecipeUnit;
  isSubstitutable: boolean; // ej. True para leche entera (se puede cambiar por avena)
  substitutableGroup?: string; // ej. "DAIRY"
}

export interface RecipeProps {
  id: string;
  storeId: string;
  productVariantId: string;
  recipeName: string;
  yieldQuantity: number; // Porciones que rinde la receta (ej. 1 taza)
  ingredients: RecipeIngredientItemProps[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Recipe extends BaseEntity {
  public storeId: string;
  public productVariantId: string;
  public recipeName: string;
  public yieldQuantity: number;
  public ingredients: RecipeIngredientItemProps[];
  public isActive: boolean;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(props: RecipeProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.productVariantId = props.productVariantId;
    this.recipeName = props.recipeName;
    this.yieldQuantity = props.yieldQuantity;
    this.ingredients = props.ingredients;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
