import { Module, OnModuleInit } from '@nestjs/common';
import { OutboxDispatcherService } from '@platform/outbox/outbox-dispatcher.service';
import { InMemoryKdsRepository } from './infra/kds.in-memory.repository';
import { BaristaPrintSlipHandler } from './handlers/barista-print-slip.handler';
import { KdsOrderPaidHandler } from './handlers/kds-order-paid.handler';
import { DispatchService } from './services/dispatch.service';
import { KdsService } from './services/kds.service';
import { KdsGateway } from './gateways/kds.gateway';

@Module({
  providers: [
    {
      provide: 'KDS_REPOSITORY',
      useClass: InMemoryKdsRepository,
    },
    BaristaPrintSlipHandler,
    KdsOrderPaidHandler,
    DispatchService,
    KdsService,
    KdsGateway,
  ],
  exports: [
    'KDS_REPOSITORY',
    BaristaPrintSlipHandler,
    KdsOrderPaidHandler,
    DispatchService,
    KdsService,
    KdsGateway,
  ],
})
export class DispatchModule implements OnModuleInit {
  constructor(
    private readonly outboxDispatcher: OutboxDispatcherService,
    private readonly baristaSlipHandler: BaristaPrintSlipHandler,
    private readonly kdsOrderPaidHandler: KdsOrderPaidHandler,
  ) {}

  public onModuleInit(): void {
    // 1. Suscribir el manejador de impresión física al evento 'order.paid.v1'
    this.outboxDispatcher.registerHandler('order.paid.v1', this.baristaSlipHandler);

    // 2. Suscribir el manejador de pantalla KDS en tiempo real al evento 'order.paid.v1'
    this.outboxDispatcher.registerHandler('order.paid.v1', this.kdsOrderPaidHandler);
  }
}
