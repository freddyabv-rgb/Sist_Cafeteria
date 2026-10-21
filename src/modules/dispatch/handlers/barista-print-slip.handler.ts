import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { PrintBridgeService } from '@platform/print-bridge/print-bridge.service';
import { BaristaSlipData, BaristaOrderItem } from '@platform/print-bridge/barista-ticket-template';

interface OrderPaidEventPayload {
  orderId: string;
  orderNumber: string;
  orderType: 'TAKEAWAY' | 'DINE_IN';
  customerName?: string;
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    station: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
    modifiers: Array<{
      optionName: string;
      quantity: number;
      highlightKds: boolean;
    }>;
  }>;
}

@Injectable()
export class BaristaPrintSlipHandler implements DomainEventHandler<DomainEvent<OrderPaidEventPayload>> {
  public readonly handlerName = 'barista-print-slip-handler';
  private readonly logger = new Logger(BaristaPrintSlipHandler.name);

  constructor(private readonly printBridge: PrintBridgeService) {}

  public async handle(event: DomainEvent<OrderPaidEventPayload>): Promise<void> {
    const payload = event.payload;

    // 1. Filtrar únicamente los ítems con destino a la estación BARRA (cafetería y bebidas frías)
    const barraItems = payload.items.filter((item) => item.station === 'BARRA');

    // Si la orden no tiene ítems de barra (ej. solo postres o helados de vitrina), no desperdiciar papel
    if (barraItems.length === 0) {
      this.logger.debug(
        `Orden ${payload.orderNumber} no contiene ítems de estación BARRA. Omitiendo impresión de comanda.`,
      );
      return;
    }

    // 2. Mapear datos a la plantilla de comanda de la Xprinter XP-80T
    const dateObj = new Date(event.occurredAt);
    const timeStr = dateObj.toLocaleTimeString('es-PE', { hour12: false });

    const formattedItems: BaristaOrderItem[] = barraItems.map((item) => ({
      name: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers.map((m) => ({
        optionName: m.optionName,
        quantity: m.quantity,
        highlightKds: m.highlightKds,
      })),
    }));

    const slipData: BaristaSlipData = {
      orderNumber: payload.orderNumber,
      orderType: payload.orderType,
      timeStr,
      customerName: payload.customerName,
      items: formattedItems,
    };

    // 3. Enviar al Print Bridge
    this.logger.log(
      `Imprimiendo comanda de barista para orden ${payload.orderNumber} (${barraItems.length} ítems de barra)`,
    );
    await this.printBridge.printBaristaSlip(slipData);
  }
}
