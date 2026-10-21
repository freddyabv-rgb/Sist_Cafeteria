import { InMemoryKdsRepository } from '../src/modules/dispatch/infra/kds.in-memory.repository';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { KdsService } from '../src/modules/dispatch/services/kds.service';
import { KdsGateway } from '../src/modules/dispatch/gateways/kds.gateway';
import { KdsOrderPaidHandler } from '../src/modules/dispatch/handlers/kds-order-paid.handler';
import { DomainEvent } from '../src/shared-kernel/types/domain-event';

describe('Paso 5: Pantalla de Barista (KDS) en Tiempo Real', () => {
  let kdsRepo: InMemoryKdsRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let outboxDispatcher: OutboxDispatcherService;
  let kdsService: KdsService;
  let kdsGateway: KdsGateway;
  let kdsHandler: KdsOrderPaidHandler;

  const testStoreId = 'store-benevento-01';

  beforeEach(() => {
    kdsRepo = new InMemoryKdsRepository();
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);

    kdsService = new KdsService(kdsRepo, outboxWriter);
    kdsGateway = new KdsGateway(kdsService);
    kdsHandler = new KdsOrderPaidHandler(kdsService, kdsGateway);

    // Registrar manejador KDS en el despachador de Outbox
    outboxDispatcher.registerHandler('order.paid.v1', kdsHandler);
  });

  it('debe recibir el evento order.paid.v1, agregar la tarjeta a la cola y enrutar solo ítems de BARRA', async () => {
    const testEvent: DomainEvent = {
      eventId: 'evt-kds-001',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T11:00:00.000Z',
      storeId: testStoreId,
      correlationId: 'corr-kds-01',
      actor: { userId: 'usr-cajero-01', registerId: 'reg-c1' },
      payload: {
        orderId: 'ord-kds-100',
        orderNumber: 'C1-0020',
        orderType: 'TAKEAWAY',
        customerName: 'Santiago Silva',
        items: [
          {
            orderItemId: 'item-cappuccino-1',
            productName: 'Cappuccino',
            variantName: '12oz',
            station: 'BARRA',
            quantity: 1,
            unitPrice: 12.0,
            totalPrice: 14.5,
            modifiers: [
              {
                optionName: 'Leche de Almendras',
                quantity: 1,
                highlightKds: true,
              },
            ],
          },
          {
            orderItemId: 'item-croissant-2',
            productName: 'Croissant de Almendras',
            variantName: 'Unidad',
            station: 'VITRINA', // Debe excluirse del KDS de barra
            quantity: 1,
            unitPrice: 11.0,
            totalPrice: 11.0,
            modifiers: [],
          },
        ],
      },
    };

    // 1. Guardar y despachar evento
    await outboxWriter.write(testEvent);
    const processedCount = await outboxDispatcher.dispatchPending(10);
    expect(processedCount).toBe(1);

    // 2. Verificar que se agregó a la cola del KDS
    const activeQueue = await kdsRepo.findActiveQueue(testStoreId);
    expect(activeQueue.length).toBe(1);

    const card = activeQueue[0];
    expect(card.orderNumber).toBe('C1-0020');
    expect(card.status).toBe('RECEIVED');
    expect(card.customerName).toBe('Santiago Silva');

    // Debe tener únicamente el Cappuccino
    expect(card.items.length).toBe(1);
    expect(card.items[0].name).toBe('Cappuccino');
    expect(card.items[0].modifiers[0].optionName).toBe('Leche de Almendras');
    expect(card.items[0].modifiers[0].highlightKds).toBe(true);
  });

  it('debe transicionar estados: RECEIVED -> PREPARING -> READY y emitir order.ready.v1', async () => {
    // 1. Crear tarjeta inicial en KDS
    const card = await kdsService.addOrderToQueue({
      orderId: 'ord-kds-101',
      storeId: testStoreId,
      orderNumber: 'C1-0021',
      orderType: 'DINE_IN',
      customerName: 'Valeria Ramos',
      paidAt: '2026-10-11T11:05:00.000Z',
      items: [
        {
          orderItemId: 'item-latte-1',
          productName: 'Latte',
          variantName: '8oz',
          station: 'BARRA',
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    expect(card).not.toBeNull();
    expect(card!.status).toBe('RECEIVED');

    // 2. Barista inicia preparación (toca pantalla táctil)
    const preparingCard = await kdsService.startPreparing('ord-kds-101');
    expect(preparingCard.status).toBe('PREPARING');
    expect(preparingCard.startedAt).toBeDefined();

    // 3. Barista completa pedido ("Listo")
    const readyCard = await kdsService.markReady('ord-kds-101');
    expect(readyCard.status).toBe('READY');
    expect(readyCard.readyAt).toBeDefined();
    expect(readyCard.prepDurationSeconds).toBeGreaterThanOrEqual(0);

    // 4. Verificar que se emitió el evento order.ready.v1 en el Transactional Outbox
    const pendingEvents = await outboxStorage.findPending(10);
    const readyEvent = pendingEvents.find((e) => e.eventType === 'order.ready.v1');
    expect(readyEvent).toBeDefined();

    const payload = JSON.parse(readyEvent!.payload);
    expect(payload.payload.orderNumber).toBe('C1-0021');
    expect(payload.payload.customerName).toBe('Valeria Ramos');
  });

  it('debe generar el snapshot completo de resincronización ante caídas de WiFi sin duplicar tarjetas', async () => {
    // Crear orden 1 (Activa RECEIVED)
    await kdsService.addOrderToQueue({
      orderId: 'sync-01',
      storeId: testStoreId,
      orderNumber: 'C1-0022',
      orderType: 'TAKEAWAY',
      paidAt: '2026-10-11T11:10:00.000Z',
      items: [
        {
          orderItemId: 'it-1',
          productName: 'Americano',
          variantName: '8oz',
          station: 'BARRA',
          quantity: 1,
          modifiers: [],
        },
      ],
    });

    // Crear orden 2 (Activa PREPARING)
    await kdsService.addOrderToQueue({
      orderId: 'sync-02',
      storeId: testStoreId,
      orderNumber: 'C1-0023',
      orderType: 'TAKEAWAY',
      paidAt: '2026-10-11T11:11:00.000Z',
      items: [
        {
          orderItemId: 'it-2',
          productName: 'Flat White',
          variantName: '8oz',
          station: 'BARRA',
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    await kdsService.startPreparing('sync-02');

    // Crear orden 3 (Completada READY)
    await kdsService.addOrderToQueue({
      orderId: 'sync-03',
      storeId: testStoreId,
      orderNumber: 'C1-0024',
      orderType: 'TAKEAWAY',
      paidAt: '2026-10-11T11:08:00.000Z',
      items: [
        {
          orderItemId: 'it-3',
          productName: 'Cold Brew',
          variantName: '12oz',
          station: 'BARRA',
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    await kdsService.markReady('sync-03');

    // Simular que la tablet de barista estuvo desconectada 30 segundos y pide snapshot
    const snapshot = await kdsService.getReconnectionSnapshot(testStoreId);

    // Debe contener exactamente 2 tarjetas activas
    expect(snapshot.activeCards.length).toBe(2);
    expect(snapshot.activeCards[0].orderNumber).toBe('C1-0022');
    expect(snapshot.activeCards[0].status).toBe('RECEIVED');
    expect(snapshot.activeCards[1].orderNumber).toBe('C1-0023');
    expect(snapshot.activeCards[1].status).toBe('PREPARING');

    // Debe incluir la tarjeta completada reciente
    expect(snapshot.recentReadyCards.length).toBe(1);
    expect(snapshot.recentReadyCards[0].orderNumber).toBe('C1-0024');
  });

  it('debe calcular los umbrales de SLA cromático y badges accesibles (<90s Verde, 90-180s Amarillo, >180s Rojo)', () => {
    const baseTime = new Date('2026-10-11T12:00:00.000Z');

    const card = new KdsOrderCard({
      id: 'sla-test-card',
      storeId: testStoreId,
      orderNumber: 'C1-0030',
      orderType: 'TAKEAWAY',
      paidAt: baseTime,
      status: 'RECEIVED',
      items: [],
    });

    // 1. Caso < 90 segundos: TARGET (Verde)
    const at40s = new Date(baseTime.getTime() + 40 * 1000);
    const slaTarget = card.getSlaStatus(at40s);
    expect(slaTarget.status).toBe('TARGET');
    expect(slaTarget.colorToken).toBe('#10B981'); // Verde
    expect(slaTarget.accessibleLabel).toBe('A TIEMPO [✓]');
    expect(slaTarget.elapsedSeconds).toBe(40);

    // 2. Caso 90s a 180s: WARNING (Amarillo)
    const at120s = new Date(baseTime.getTime() + 120 * 1000);
    const slaWarning = card.getSlaStatus(at120s);
    expect(slaWarning.status).toBe('WARNING');
    expect(slaWarning.colorToken).toBe('#F59E0B'); // Amarillo
    expect(slaWarning.accessibleLabel).toBe('EN TIEMPO LÍMITE [!]');
    expect(slaWarning.elapsedSeconds).toBe(120);

    // 3. Caso > 180s: DANGER (Rojo)
    const at220s = new Date(baseTime.getTime() + 220 * 1000);
    const slaDanger = card.getSlaStatus(at220s);
    expect(slaDanger.status).toBe('DANGER');
    expect(slaDanger.colorToken).toBe('#EF4444'); // Rojo
    expect(slaDanger.accessibleLabel).toBe('DEMORA CRÍTICA [⚠]');
    expect(slaDanger.elapsedSeconds).toBe(220);
  });
});
