import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { StockService } from '../services/stock.service';

interface OrderPaidPayload {
  orderId: string;
  orderNumber: string;
  items: Array<{
    orderItemId: string;
    variantId?: string;
    productVariantId?: string;
    productName: string;
    variantName: string;
    station: string;
    quantity: number;
  }>;
}

@Injectable()
export class StockOrderPaidHandler implements DomainEventHandler<DomainEvent<OrderPaidPayload>> {
  public readonly handlerName = 'stock-order-paid-handler';
  private readonly logger = new Logger(StockOrderPaidHandler.name);

  constructor(private readonly stockService: StockService) {}

  public async handle(event: DomainEvent<OrderPaidPayload>): Promise<void> {
    const payload = event.payload;

    // Filtrar ítems de VITRINA (pastelería, postres, bebidas unitarias)
    const vitrinaItems = payload.items.filter((item) => item.station === 'VITRINA');

    for (const item of vitrinaItems) {
      const variantId = item.variantId || item.productVariantId;
      if (!variantId) continue;

      const result = await this.stockService.deductForSale(
        event.storeId,
        variantId,
        item.quantity,
        payload.orderId,
      );

      if (result) {
        this.logger.log(
          `[STOCK VITRINA] Descontadas ${item.quantity} unidades de "${item.productName}". Stock restante: ${result.remainingStock}`,
        );
      }
    }
  }
}
