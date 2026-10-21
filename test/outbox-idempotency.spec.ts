import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { DomainEvent, DomainEventHandler } from '../src/shared-kernel/types/domain-event';

describe('Transactional Outbox & Idempotency Guarantee', () => {
  let storage: InMemoryOutboxStorage;
  let writer: OutboxWriterService;
  let dispatcher: OutboxDispatcherService;

  beforeEach(() => {
    storage = new InMemoryOutboxStorage();
    writer = new OutboxWriterService(storage);
    dispatcher = new OutboxDispatcherService(storage);
  });

  it('debe persistir un evento en outbox y despacharlo al suscriptor registrado', async () => {
    const executedPayloads: unknown[] = [];

    const mockKdsHandler: DomainEventHandler = {
      handlerName: 'kds-barista-handler',
      handle: async (evt: DomainEvent) => {
        executedPayloads.push(evt.payload);
      },
    };

    dispatcher.registerHandler('order.paid.v1', mockKdsHandler);

    const testEvent: DomainEvent<{ orderNumber: string; total: number }> = {
      eventId: 'evt-unique-001',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: 'store-benevento-01',
      correlationId: 'corr-001',
      actor: { userId: 'user-cajero-01', registerId: 'reg-c1' },
      payload: { orderNumber: 'C1-0001', total: 28.5 },
    };

    // 1. Escritor guarda evento en transacción
    await writer.write(testEvent);

    // 2. Despachador lee y procesa evento
    const processedCount = await dispatcher.dispatchPending(10);
    expect(processedCount).toBe(1);
    expect(executedPayloads.length).toBe(1);
    expect((executedPayloads[0] as { orderNumber: string }).orderNumber).toBe('C1-0001');

    // 3. Verificar que se registró en processed_events
    const isMarked = await storage.isProcessed('evt-unique-001', 'kds-barista-handler');
    expect(isMarked).toBe(true);
  });

  it('debe garantizar IDEMPOTENCIA: no reejecutar el handler si el evento ya fue procesado', async () => {
    let callCount = 0;

    const mockStockHandler: DomainEventHandler = {
      handlerName: 'stock-deduction-handler',
      handle: async () => {
        callCount++;
      },
    };

    dispatcher.registerHandler('order.paid.v1', mockStockHandler);

    const duplicateEvent: DomainEvent<{ orderNumber: string }> = {
      eventId: 'evt-duplicate-test',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: 'store-benevento-01',
      correlationId: 'corr-dup-01',
      actor: { userId: 'user-cajero-01' },
      payload: { orderNumber: 'C1-0002' },
    };

    await writer.write(duplicateEvent);

    // Primer despacho exitoso
    await dispatcher.dispatchPending(10);
    expect(callCount).toBe(1);

    // Simular que el evento vuelve a aparecer como pendiente por reintento de red
    const pendingList = await storage.findPending(10);
    // Aunque volviera a llamarse el dispatcher sobre el mismo eventId
    await storage.save({
      id: 'outbox-retry-row',
      eventId: 'evt-duplicate-test',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      payload: JSON.stringify(duplicateEvent),
      createdAt: new Date(),
    });

    await dispatcher.dispatchPending(10);

    // El contador NO debe incrementar porque ya estaba en processed_events
    expect(callCount).toBe(1);
  });
});
