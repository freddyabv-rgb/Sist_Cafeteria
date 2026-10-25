import { BaseEntity } from '@shared/types/entity';

export type ProductionCategory = 'PASTRY' | 'GELATO' | 'BAKERY' | 'SANDWICH_PREP';

export interface RecipeIngredientLine {
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  quantity: number; // Cantidad requerida en unidad base (ej. gramos, mililitros, unidades)
  unit: string;
}

export interface ProductionRecipeProps {
  id: string;
  storeId: string;
  name: string; // ej. "Receta Maestra Croissant Clásico (Batch 24u)"
  productVariantId: string; // Variante terminada que se produce para vitrina
  productName: string;
  variantName: string;
  category: ProductionCategory;
  standardYieldUnits: number; // ej. 24 unidades estándar
  estimatedPrepMinutes: number; // ej. 180 min (amasado + fermentado + horneado)
  ingredients: RecipeIngredientLine[];
  instructions?: string;
  isActive: boolean;
  createdAt?: Date;
}

export class ProductionRecipe extends BaseEntity {
  public storeId: string;
  public name: string;
  public productVariantId: string;
  public productName: string;
  public variantName: string;
  public category: ProductionCategory;
  public standardYieldUnits: number;
  public estimatedPrepMinutes: number;
  public ingredients: RecipeIngredientLine[];
  public instructions?: string;
  public isActive: boolean;
  public createdAt: Date;

  constructor(props: ProductionRecipeProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.name = props.name;
    this.productVariantId = props.productVariantId;
    this.productName = props.productName;
    this.variantName = props.variantName;
    this.category = props.category;
    this.standardYieldUnits = props.standardYieldUnits;
    this.estimatedPrepMinutes = props.estimatedPrepMinutes;
    this.ingredients = props.ingredients;
    this.instructions = props.instructions;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt || new Date();
  }
}
