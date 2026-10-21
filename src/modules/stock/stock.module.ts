import { Module, OnModuleInit } from '@nestjs/common';
import { OutboxDispatcherService } from '@platform/outbox/outbox-dispatcher.service';
import { InMemoryStockRepository } from './infra/stock.in-memory.repository';
import { StockService } from './services/stock.service';
import { StockOrderPaidHandler } from './handlers/stock-order-paid.handler';
import { StockOrderRefundedHandler } from './handlers/stock-order-refunded.handler';

@Module({
  providers: [
    {
      provide: 'STOCK_REPOSITORY',
      useClass: InMemoryStockRepository,
    },
    StockService,
    StockOrderPaidHandler,
    StockOrderRefundedHandler,
  ],
  exports: ['STOCK_REPOSITORY', StockService, StockOrderPaidHandler, StockOrderRefundedHandler],
})
export class StockModule implements OnModuleInit {
  constructor(
    private readonly outboxDispatcher: OutboxDispatcherService,
    private readonly paidHandler: StockOrderPaidHandler,
    private readonly refundedHandler: StockOrderRefundedHandler,
  ) {}

  public onModuleInit(): void {
    // 1. Suscribir descuento de stock unitario de vitrina al cobro de venta
    this.outboxDispatcher.registerHandler('order.paid.v1', this.paidHandler);

    // 2. Suscribir reposición de stock unitario a reembolsos
    this.outboxDispatcher.registerHandler('order.refunded.v1', this.refundedHandler);
  }
}
