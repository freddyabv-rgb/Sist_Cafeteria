import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { PrintBridgeService } from '../src/platform/print-bridge/print-bridge.service';
import { BaristaSlipData } from '../src/platform/print-bridge/barista-ticket-template';
import { BaristaPrintSlipHandler } from '../src/modules/dispatch/handlers/barista-print-slip.handler';
import { DispatchService } from '../src/modules/dispatch/services/dispatch.service';
import { DomainEvent } from '../src/shared-kernel/types/domain-event';

describe('Paso 4: Despacho de Barra Impreso mediante Print Bridge (Xprinter XP-80T)', () => {
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let outboxDispatcher: OutboxDispatcherService;
  let printBridge: PrintBridgeService;
  let baristaHandler: BaristaPrintSlipHandler;
  let dispatchService: DispatchService;

  beforeEach(() => {
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);

    printBridge = new PrintBridgeService(); // mock por defecto
    baristaHandler = new BaristaPrintSlipHandler(printBridge);
    dispatchService = new DispatchService(printBridge);

    // Registrar el handler en el despachador de eventos
    outboxDispatcher.registerHandler('order.paid.v1', baristaHandler);
  });

  it('debe filtrar e imprimir únicamente los productos de estación BARRA ignorando VITRINA', async () => {
    let capturedSlip: BaristaSlipData | null = null;

    // Espiar la llamada al printBridge
    jest.spyOn(printBridge, 'printBaristaSlip').mockImplementation(async (data) => {
      capturedSlip = data;
      return true;
    });

    const testEvent: DomainEvent = {
      eventId: 'evt-order-001',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T10:30:00.000Z',
      storeId: 'store-benevento-01',
      correlationId: 'corr-001',
      actor: { userId: 'usr-cajero-01', registerId: 'reg-c1' },
      payload: {
        orderId: 'ord-001',
        orderNumber: 'C1-0015',
        orderType: 'TAKEAWAY',
        customerName: 'Lucía Fernández',
        items: [
          {
            orderItemId: 'item-1',
            productName: 'Flat White',
            variantName: '8oz',
            station: 'BARRA',
            quantity: 1,
            unitPrice: 13.5,
            totalPrice: 13.5,
            modifiers: [
              {
                optionName: 'Leche de Avena',
                quantity: 1,
                highlightKds: true,
              },
            ],
          },
          {
            orderItemId: 'item-2',
            productName: 'Croissant de Almendras',
            variantName: 'Unidad',
            station: 'VITRINA', // Debe ser ignorado por la comanda de barista
            quantity: 1,
            unitPrice: 11.0,
            totalPrice: 11.0,
            modifiers: [],
          },
        ],
      },
    };

    // 1. Escribir evento en Outbox
    await outboxWriter.write(testEvent);

    // 2. Despachar evento
    const processed = await outboxDispatcher.dispatchPending(10);
    expect(processed).toBe(1);

    // 3. Verificaciones de la comanda de barista
    expect(capturedSlip).not.toBeNull();
    expect(capturedSlip!.orderNumber).toBe('C1-0015');
    expect(capturedSlip!.orderType).toBe('TAKEAWAY');
    expect(capturedSlip!.customerName).toBe('Lucía Fernández');

    // Debe contener SOLO el Flat White, NO el Croissant
    expect(capturedSlip!.items.length).toBe(1);
    expect(capturedSlip!.items[0].name).toBe('Flat White');
    expect(capturedSlip!.items[0].variantName).toBe('8oz');
    expect(capturedSlip!.items[0].modifiers[0].optionName).toBe('Leche de Avena');
    expect(capturedSlip!.items[0].modifiers[0].highlightKds).toBe(true);
  });

  it('no debe imprimir nada si el pedido solo contiene ítems de VITRINA (cero desperdicio de papel)', async () => {
    const printSpy = jest.spyOn(printBridge, 'printBaristaSlip');

    const vitrinaOnlyEvent: DomainEvent = {
      eventId: 'evt-order-002',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T10:35:00.000Z',
      storeId: 'store-benevento-01',
      correlationId: 'corr-002',
      actor: { userId: 'usr-cajero-01', registerId: 'reg-c1' },
      payload: {
        orderId: 'ord-002',
        orderNumber: 'C1-0016',
        orderType: 'DINE_IN',
        customerName: 'Cliente Rápido',
        items: [
          {
            orderItemId: 'item-10',
            productName: 'Gelato Doble',
            variantName: '2 Bolas',
            station: 'VITRINA',
            quantity: 1,
            unitPrice: 15.0,
            totalPrice: 15.0,
            modifiers: [],
          },
          {
            orderItemId: 'item-11',
            productName: 'Tiramisú Tradicional',
            variantName: 'Porción',
            station: 'VITRINA',
            quantity: 1,
            unitPrice: 15.0,
            totalPrice: 15.0,
            modifiers: [],
          },
        ],
      },
    };

    await outboxWriter.write(vitrinaOnlyEvent);
    await outboxDispatcher.dispatchPending(10);

    // La función de impresión de barista NO debió llamarse
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('debe garantizar IDEMPOTENCIA: no reimprimir si el evento ya fue procesado', async () => {
    let callCount = 0;
    jest.spyOn(printBridge, 'printBaristaSlip').mockImplementation(async () => {
      callCount++;
      return true;
    });

    const testEvent: DomainEvent = {
      eventId: 'evt-order-idempotent-print',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T10:40:00.000Z',
      storeId: 'store-benevento-01',
      correlationId: 'corr-003',
      actor: { userId: 'usr-cajero-01' },
      payload: {
        orderId: 'ord-003',
        orderNumber: 'C1-0017',
        orderType: 'TAKEAWAY',
        items: [
          {
            orderItemId: 'item-20',
            productName: 'Espresso',
            variantName: '8oz',
            station: 'BARRA',
            quantity: 1,
            unitPrice: 7.0,
            totalPrice: 7.0,
            modifiers: [],
          },
        ],
      },
    };

    await outboxWriter.write(testEvent);

    // Primer despacho
    await outboxDispatcher.dispatchPending(10);
    expect(callCount).toBe(1);

    // Simular que el evento vuelve a aparecer como pendiente por un reintento
    await outboxStorage.save({
      id: 'outbox-retry-row-2',
      eventId: 'evt-order-idempotent-print',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      payload: JSON.stringify(testEvent),
      createdAt: new Date(),
    });

    await outboxDispatcher.dispatchPending(10);

    // El contador NO debe incrementar porque ya estaba en processed_events
    expect(callCount).toBe(1);
  });

  it('debe permitir la reimpresión manual de la comanda de barista si se solicita', async () => {
    let capturedTitle = '';
    jest.spyOn(printBridge, 'printBaristaSlip').mockImplementation(async (data) => {
      capturedTitle = data.orderNumber;
      return true;
    });

    const slipData: BaristaSlipData = {
      orderNumber: 'C1-0015',
      orderType: 'TAKEAWAY',
      timeStr: '10:30:00',
      items: [
        {
          name: 'Flat White',
          variantName: '8oz',
          quantity: 1,
          modifiers: [],
        },
      ],
    };

    const success = await dispatchService.reprintBaristaSlip(slipData);
    expect(success).toBe(true);
    expect(capturedTitle).toBe('[REIMPRESIÓN] C1-0015');
  });
});
