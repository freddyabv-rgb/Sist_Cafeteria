import { Module } from '@nestjs/common';
import { OutboxModule } from './platform/outbox/outbox.module';
import { PrintBridgeModule } from './platform/print-bridge/print-bridge.module';
import { AuthModule } from './platform/auth/auth.module';
import { AuditModule } from './platform/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CashModule } from './modules/cash/cash.module';
import { SalesModule } from './modules/sales/sales.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StockModule } from './modules/stock/stock.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { WasteModule } from './modules/waste/waste.module';
import { DiningModule } from './modules/dining/dining.module';
import { ProductionModule } from './modules/production/production.module';

@Module({
  imports: [
    OutboxModule,
    PrintBridgeModule,
    AuthModule,
    AuditModule,
    CatalogModule,
    CashModule,
    SalesModule,
    DispatchModule,
    ReportsModule,
    StockModule,
    PurchasingModule,
    RecipesModule,
    WasteModule,
    DiningModule,
    ProductionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
