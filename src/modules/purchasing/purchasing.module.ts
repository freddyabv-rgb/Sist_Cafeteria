import { Module } from '@nestjs/common';
import { OutboxModule } from '@platform/outbox/outbox.module';
import { InMemoryPurchasingRepository } from './infra/purchasing.in-memory.repository';
import { PurchasingService } from './services/purchasing.service';

@Module({
  imports: [OutboxModule],
  providers: [
    {
      provide: 'PURCHASING_REPOSITORY',
      useClass: InMemoryPurchasingRepository,
    },
    PurchasingService,
    {
      provide: 'INGREDIENT_STOCK_PORT',
      useExisting: PurchasingService,
    },
  ],
  exports: ['PURCHASING_REPOSITORY', PurchasingService, 'INGREDIENT_STOCK_PORT'],
})
export class PurchasingModule {}
