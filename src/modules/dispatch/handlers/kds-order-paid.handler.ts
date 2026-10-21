import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { KdsService, AddOrderToQueueInput } from '../services/kds.service';
import { KdsGateway } from '../gateways/kds.gateway';

@Injectable()
export class KdsOrderPaidHandler implements DomainEventHandler<DomainEvent<AddOrderToQueueInput>> {
  public readonly handlerName = 'kds-screen-order-paid-handler';
  private readonly logger = new Logger(KdsOrderPaidHandler.name);

  constructor(
    private readonly kdsService: KdsService,
    private readonly kdsGateway: KdsGateway,
  ) {}

  public async handle(event: DomainEvent<AddOrderToQueueInput>): Promise<void> {
    const card = await this.kdsService.addOrderToQueue({
      orderId: event.payload.orderId,
      storeId: event.storeId,
      orderNumber: event.payload.orderNumber,
      orderType: event.payload.orderType,
      customerName: event.payload.customerName,
      paidAt: event.occurredAt,
      items: event.payload.items,
    });

    if (card) {
      this.logger.log(`Emitiendo pedido ${card.orderNumber} a las pantallas táctiles de barista vía WebSockets`);
      this.kdsGateway.broadcastNewOrder(card);
    }
  }
}
