import { RecipeUnit } from '../domain/recipe.entity';
import { ModifierImpactAction } from '../domain/modifier-impact.entity';

export interface RecipeIngredientInput {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: RecipeUnit;
  isSubstitutable?: boolean;
  substitutableGroup?: string;
}

export interface CreateRecipeDto {
  storeId: string;
  productVariantId: string;
  recipeName: string;
  yieldQuantity?: number;
  ingredients: RecipeIngredientInput[];
}

export interface ConfigureModifierImpactDto {
  storeId: string;
  modifierOptionId: string;
  optionName: string;
  action: ModifierImpactAction;
  targetIngredientId: string;
  targetIngredientName: string;
  targetSubstitutableGroup?: string;
  quantityDelta?: number;
  unit: RecipeUnit;
}

export interface ConfigurePackagingRuleDto {
  storeId: string;
  productVariantId: string;
  items: Array<{
    ingredientId: string;
    ingredientName: string;
    quantity: number;
  }>;
}

export interface TheoreticalCostBreakdownItem {
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCostDec: number;
  subtotalCost: number;
}

export interface TheoreticalCostDto {
  productVariantId: string;
  recipeName: string;
  totalCost: number;
  breakdown: TheoreticalCostBreakdownItem[];
}
