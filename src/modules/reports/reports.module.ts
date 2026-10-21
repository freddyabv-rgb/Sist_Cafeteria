import { Module } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { SalesModule } from '@modules/sales/sales.module';
import { CashModule } from '@modules/cash/cash.module';

@Module({
  imports: [SalesModule, CashModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
