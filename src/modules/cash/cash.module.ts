import { Module } from '@nestjs/common';
import { InMemoryCashRepository } from './infra/cash.in-memory.repository';
import { CashService } from './services/cash.service';

@Module({
  providers: [
    {
      provide: 'CASH_REPOSITORY',
      useClass: InMemoryCashRepository,
    },
    CashService,
    {
      provide: 'CASH_SHIFT_PORT',
      useExisting: CashService,
    },
  ],
  exports: ['CASH_REPOSITORY', 'CASH_SHIFT_PORT', CashService],
})
export class CashModule {}
