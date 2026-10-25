import { ProductionRecipe } from './production-recipe.entity';
import { ProductionBatch, BatchStatus } from './production-batch.entity';

export interface BatchFilter {
  status?: BatchStatus;
  productVariantId?: string;
  bakerUserId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface IProductionRepository {
  saveRecipe(recipe: ProductionRecipe): Promise<void>;
  findRecipeById(id: string): Promise<ProductionRecipe | null>;
  findRecipeByVariantId(storeId: string, variantId: string): Promise<ProductionRecipe | null>;
  findRecipesByStore(storeId: string, category?: string): Promise<ProductionRecipe[]>;

  saveBatch(batch: ProductionBatch): Promise<void>;
  findBatchById(id: string): Promise<ProductionBatch | null>;
  findBatchByNumber(storeId: string, batchNumber: string): Promise<ProductionBatch | null>;
  findBatchesByStore(storeId: string, filter?: BatchFilter): Promise<ProductionBatch[]>;
}
