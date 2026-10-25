import { Module } from '@nestjs/common';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { StockModule } from '@modules/stock/stock.module';
import { PurchasingModule } from '@modules/purchasing/purchasing.module';
import { OutboxModule } from '@platform/outbox/outbox.module';
import { AuditModule } from '@platform/audit/audit.module';
import { ProductionService } from './services/production.service';
import { InMemoryProductionRepository } from './infra/production.in-memory.repository';

@Module({
  imports: [
    CatalogModule,
    StockModule,
    PurchasingModule,
    OutboxModule,
    AuditModule,
  ],
  providers: [
    ProductionService,
    {
      provide: 'PRODUCTION_REPOSITORY',
      useClass: InMemoryProductionRepository,
    },
  ],
  exports: [ProductionService, 'PRODUCTION_REPOSITORY'],
})
export class ProductionModule {}
