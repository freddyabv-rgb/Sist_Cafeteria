import { Module } from '@nestjs/common';
import { WasteService } from './services/waste.service';
import { InMemoryWasteRepository } from './infra/waste.in-memory.repository';

@Module({
  providers: [
    WasteService,
    {
      provide: 'WASTE_REPOSITORY',
      useClass: InMemoryWasteRepository,
    },
  ],
  exports: [WasteService, 'WASTE_REPOSITORY'],
})
export class WasteModule {}
