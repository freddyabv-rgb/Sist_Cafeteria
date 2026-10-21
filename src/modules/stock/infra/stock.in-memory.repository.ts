import { IStockRepository } from './stock.repository.interface';
import { ShowcaseStockItem } from '../domain/showcase-stock-item.entity';
import { StockMovement } from '../domain/stock-movement.entity';

export class InMemoryStockRepository implements IStockRepository {
  private items = new Map<string, ShowcaseStockItem>();
  private movements = new Map<string, StockMovement[]>();

  public async saveStockItem(item: ShowcaseStockItem): Promise<void> {
    const key = `${item.storeId}:${item.productVariantId}`;
    this.items.set(key, item);
  }

  public async findStockItem(storeId: string, productVariantId: string): Promise<ShowcaseStockItem | null> {
    const key = `${storeId}:${productVariantId}`;
    return this.items.get(key) || null;
  }

  public async findStockItemsByProduct(storeId: string, productId: string): Promise<ShowcaseStockItem[]> {
    return Array.from(this.items.values()).filter(
      (item) => item.storeId === storeId && item.productId === productId,
    );
  }

  public async findAllStockItems(storeId: string): Promise<ShowcaseStockItem[]> {
    return Array.from(this.items.values()).filter((item) => item.storeId === storeId);
  }

  public async saveMovement(movement: StockMovement): Promise<void> {
    const list = this.movements.get(movement.stockItemId) || [];
    list.push(movement);
    this.movements.set(movement.stockItemId, list);
  }

  public async findMovementsByItem(stockItemId: string): Promise<StockMovement[]> {
    return this.movements.get(stockItemId) || [];
  }

  public clear(): void {
    this.items.clear();
    this.movements.clear();
  }
}
