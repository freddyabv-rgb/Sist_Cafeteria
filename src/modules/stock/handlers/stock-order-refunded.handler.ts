import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { StockService } from '../services/stock.service';

interface OrderRefundedPayload {
  orderId: string;
  orderItemId: string;
  productVariantId?: string;
  productName: string;
  refundAmount: number;
  reason: string;
}

@Injectable()
export class StockOrderRefundedHandler implements DomainEventHandler<DomainEvent<OrderRefundedPayload>> {
  public readonly handlerName = 'stock-order-refunded-handler';
  private readonly logger = new Logger(StockOrderRefundedHandler.name);

  constructor(private readonly stockService: StockService) {}

  public async handle(event: DomainEvent<OrderRefundedPayload>): Promise<void> {
    const payload = event.payload;

    if (payload.productVariantId) {
      await this.stockService.reverseForVoid(
        event.storeId,
        payload.productVariantId,
        1, // Reembolso por unidad
        payload.orderId,
        payload.reason,
      );
      this.logger.log(
        `[STOCK REVERSIÓN] Devuelta 1 unidad de "${payload.productName}" a vitrina tras reembolso.`,
      );
    }
  }
}
