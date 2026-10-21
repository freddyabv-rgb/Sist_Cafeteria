import { Module } from '@nestjs/common';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { SalesModule } from '@modules/sales/sales.module';
import { OutboxModule } from '@platform/outbox/outbox.module';
import { AuditModule } from '@platform/audit/audit.module';
import { PrintBridgeModule } from '@platform/print-bridge/print-bridge.module';
import { DiningService } from './services/dining.service';
import { InMemoryDiningRepository } from './infra/dining.in-memory.repository';

@Module({
  imports: [
    CatalogModule,
    SalesModule,
    OutboxModule,
    AuditModule,
    PrintBridgeModule,
  ],
  providers: [
    DiningService,
    {
      provide: 'DINING_REPOSITORY',
      useClass: InMemoryDiningRepository,
    },
  ],
  exports: [DiningService, 'DINING_REPOSITORY'],
})
export class DiningModule {}
