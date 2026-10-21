import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { CustomerReceiptData, buildCustomerReceipt } from './ticket-template';
import { BaristaSlipData, buildBaristaSlip } from './barista-ticket-template';
import { EscPosBuilder } from './escpos-builder';

export interface PrinterConnectionConfig {
  type: 'tcp' | 'mock';
  host?: string;
  port?: number;
}

@Injectable()
export class PrintBridgeService {
  private readonly logger = new Logger(PrintBridgeService.name);
  private config: PrinterConnectionConfig = {
    type: 'mock',
    host: '127.0.0.1',
    port: 9100,
  };

  public configure(config: PrinterConnectionConfig): void {
    this.config = config;
    this.logger.log(`PrintBridge configurado para Xprinter XP-80T en modo: ${config.type}`);
  }

  /**
   * Imprime el ticket de cliente y abre la gaveta si se pagó en efectivo.
   */
  public async printCustomerReceipt(
    data: CustomerReceiptData,
    openDrawer: boolean = false,
  ): Promise<boolean> {
    const receiptBuffer = buildCustomerReceipt(data);
    let finalBuffer = receiptBuffer;

    if (openDrawer) {
      const drawerCmd = new EscPosBuilder().kickCashDrawer().toBuffer();
      finalBuffer = Buffer.concat([drawerCmd, receiptBuffer]);
    }

    return this.sendRaw(finalBuffer, `Ticket Cliente #${data.orderNumber}`);
  }

  /**
   * Imprime la comanda de barista para la estación de preparación.
   */
  public async printBaristaSlip(data: BaristaSlipData): Promise<boolean> {
    const slipBuffer = buildBaristaSlip(data);
    return this.sendRaw(slipBuffer, `Comanda Barista #${data.orderNumber}`);
  }

  /**
   * Envía un pulso para abrir la gaveta de dinero sin imprimir ticket.
   */
  public async openCashDrawer(): Promise<boolean> {
    const drawerCmd = new EscPosBuilder().kickCashDrawer().toBuffer();
    return this.sendRaw(drawerCmd, 'Apertura de gaveta');
  }

  /**
   * Envía bytes directos al socket TCP de la impresora o al simulador.
   */
  public async sendRaw(data: Buffer, documentName: string): Promise<boolean> {
    if (this.config.type === 'mock') {
      this.logger.log(`[MOCK PRINTER] Simulación de impresión [${documentName}] (${data.length} bytes enviados a Xprinter XP-80T)`);
      return true;
    }

    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(4000);

      client.connect(this.config.port || 9100, this.config.host || '127.0.0.1', () => {
        client.write(data, () => {
          client.end();
          this.logger.log(`[TCP PRINTER] Documento [${documentName}] enviado con éxito a ${this.config.host}:${this.config.port}`);
          resolve(true);
        });
      });

      client.on('error', (err) => {
        this.logger.error(`Error al enviar a impresora Xprinter en ${this.config.host}:${this.config.port}: ${err.message}`);
        resolve(false);
      });

      client.on('timeout', () => {
        this.logger.warn(`Timeout de conexión con impresora en ${this.config.host}:${this.config.port}`);
        client.destroy();
        resolve(false);
      });
    });
  }
}
