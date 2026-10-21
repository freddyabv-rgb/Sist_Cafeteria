import { ShowcaseStockItem } from '../domain/showcase-stock-item.entity';
import { StockMovement } from '../domain/stock-movement.entity';

export interface IStockRepository {
  saveStockItem(item: ShowcaseStockItem): Promise<void>;
  findStockItem(storeId: string, productVariantId: string): Promise<ShowcaseStockItem | null>;
  findStockItemsByProduct(storeId: string, productId: string): Promise<ShowcaseStockItem[]>;
  findAllStockItems(storeId: string): Promise<ShowcaseStockItem[]>;

  saveMovement(movement: StockMovement): Promise<void>;
  findMovementsByItem(stockItemId: string): Promise<StockMovement[]>;
}
