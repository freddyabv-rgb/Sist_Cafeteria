import { Module, Global } from '@nestjs/common';
import { PrintBridgeService } from './print-bridge.service';

@Global()
@Module({
  providers: [PrintBridgeService],
  exports: [PrintBridgeService],
})
export class PrintBridgeModule {}
