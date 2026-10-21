import { Injectable, Logger } from '@nestjs/common';
import { PrintBridgeService } from '@platform/print-bridge/print-bridge.service';
import { BaristaSlipData } from '@platform/print-bridge/barista-ticket-template';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly printBridge: PrintBridgeService) {}

  /**
   * Permite reimprimir manualmente una comanda de barista si hubo atasco de papel o pérdida de ticket.
   */
  public async reprintBaristaSlip(data: BaristaSlipData): Promise<boolean> {
    this.logger.log(`Reimprimiendo comanda de barista manualmente para orden: ${data.orderNumber}`);
    return this.printBridge.printBaristaSlip({
      ...data,
      orderNumber: `[REIMPRESIÓN] ${data.orderNumber}`,
    });
  }

  /**
   * Prueba de corte de papel y conexión para la Xprinter XP-80T.
   */
  public async testPrinterConnection(): Promise<boolean> {
    return this.printBridge.openCashDrawer();
  }
}
