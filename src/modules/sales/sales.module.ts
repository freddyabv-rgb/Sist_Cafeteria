import { Module } from '@nestjs/common';
import { InMemorySalesRepository } from './infra/sales.in-memory.repository';
import { SalesService } from './services/sales.service';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { CashModule } from '@modules/cash/cash.module';

@Module({
  imports: [CatalogModule, CashModule],
  providers: [
    {
      provide: 'SALES_REPOSITORY',
      useClass: InMemorySalesRepository,
    },
    SalesService,
  ],
  exports: ['SALES_REPOSITORY', SalesService],
})
export class SalesModule {}
