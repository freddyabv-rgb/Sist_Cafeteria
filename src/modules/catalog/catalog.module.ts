import { Module } from '@nestjs/common';
import { InMemoryCatalogRepository } from './infra/catalog.in-memory.repository';
import { CatalogService } from './services/catalog.service';
import { PricingService } from './services/pricing.service';
import { CsvImporterService } from './services/csv-importer.service';

@Module({
  providers: [
    {
      provide: 'CATALOG_REPOSITORY',
      useClass: InMemoryCatalogRepository,
    },
    CsvImporterService,
    PricingService,
    CatalogService,
    {
      provide: 'AVAILABILITY_PORT',
      useExisting: CatalogService,
    },
  ],
  exports: ['CATALOG_REPOSITORY', 'AVAILABILITY_PORT', CatalogService, PricingService, CsvImporterService],
})
export class CatalogModule {}
