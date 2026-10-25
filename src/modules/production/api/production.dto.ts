import { ProductionCategory } from '../domain/production-recipe.entity';

export interface RecipeIngredientInput {
  ingredientId: string;
  quantity: number;
  unit?: string;
}

export interface CreateProductionRecipeDto {
  storeId: string;
  name: string;
  productVariantId: string;
  category: ProductionCategory;
  standardYieldUnits: number;
  estimatedPrepMinutes?: number;
  ingredients: RecipeIngredientInput[];
  instructions?: string;
}

export interface PlanProductionBatchDto {
  storeId: string;
  recipeId: string;
  targetQuantity: number;
  bakerUserId: string;
  bakerName: string;
  notes?: string;
}

export interface CompleteProductionBatchDto {
  storeId: string;
  batchId: string;
  actualYield: number; // Unidades aptas que ingresarán a la vitrina
  wasteUnits?: number; // Unidades defectuosas / quemadas
  bakerUserId: string;
  notes?: string;
}

export interface CancelProductionBatchDto {
  storeId: string;
  batchId: string;
  reason: string;
  bakerUserId: string;
}

export interface ProductionBatchReportItem {
  batchNumber: string;
  productName: string;
  variantName: string;
  actualYield: number;
  wasteUnits: number;
  efficiencyRate: number;
  unitCostDec: number;
  totalCostDec: number;
  bakerName: string;
  completedAt: string;
}

export interface ProductionEfficiencyReportDto {
  storeId: string;
  generatedAt: string;
  totalBatches: number;
  totalPlannedUnits: number;
  totalActualYield: number;
  totalWasteUnits: number;
  averageEfficiencyRate: number;
  totalProductionCostDec: number;
  batches: ProductionBatchReportItem[];
}
