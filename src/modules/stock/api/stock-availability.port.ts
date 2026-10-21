export interface StockAvailabilityPort {
  isVariantInStock(storeId: string, variantId: string): Promise<boolean>;
  getVariantStockLevel(storeId: string, variantId: string): Promise<number>;
}
