import { Injectable } from '@nestjs/common';
import {
  IProductionRepository,
  BatchFilter,
} from '../domain/production.repository.interface';
import { ProductionRecipe } from '../domain/production-recipe.entity';
import { ProductionBatch } from '../domain/production-batch.entity';

@Injectable()
export class InMemoryProductionRepository implements IProductionRepository {
  private readonly recipes = new Map<string, ProductionRecipe>();
  private readonly batches = new Map<string, ProductionBatch>();

  public async saveRecipe(recipe: ProductionRecipe): Promise<void> {
    this.recipes.set(recipe.id, recipe);
  }

  public async findRecipeById(id: string): Promise<ProductionRecipe | null> {
    return this.recipes.get(id) || null;
  }

  public async findRecipeByVariantId(
    storeId: string,
    variantId: string,
  ): Promise<ProductionRecipe | null> {
    for (const recipe of this.recipes.values()) {
      if (
        recipe.storeId === storeId &&
        recipe.productVariantId === variantId &&
        recipe.isActive
      ) {
        return recipe;
      }
    }
    return null;
  }

  public async findRecipesByStore(
    storeId: string,
    category?: string,
  ): Promise<ProductionRecipe[]> {
    return Array.from(this.recipes.values()).filter((r) => {
      if (r.storeId !== storeId) return false;
      if (category && r.category !== category) return false;
      return true;
    });
  }

  public async saveBatch(batch: ProductionBatch): Promise<void> {
    this.batches.set(batch.id, batch);
  }

  public async findBatchById(id: string): Promise<ProductionBatch | null> {
    return this.batches.get(id) || null;
  }

  public async findBatchByNumber(
    storeId: string,
    batchNumber: string,
  ): Promise<ProductionBatch | null> {
    for (const batch of this.batches.values()) {
      if (
        batch.storeId === storeId &&
        batch.batchNumber.toUpperCase() === batchNumber.toUpperCase()
      ) {
        return batch;
      }
    }
    return null;
  }

  public async findBatchesByStore(
    storeId: string,
    filter?: BatchFilter,
  ): Promise<ProductionBatch[]> {
    return Array.from(this.batches.values()).filter((batch) => {
      if (batch.storeId !== storeId) return false;
      if (filter?.status && batch.status !== filter.status) return false;
      if (filter?.productVariantId && batch.productVariantId !== filter.productVariantId) {
        return false;
      }
      if (filter?.bakerUserId && batch.bakerUserId !== filter.bakerUserId) {
        return false;
      }
      if (filter?.fromDate && batch.createdAt < filter.fromDate) return false;
      if (filter?.toDate && batch.createdAt > filter.toDate) return false;
      return true;
    });
  }
}
