import { InMemoryStockRepository } from '../src/modules/stock/infra/stock.in-memory.repository';
import { InMemoryOutboxStorage } from '../src/platform/outbox/outbox-memory-storage';
import { OutboxWriterService } from '../src/platform/outbox/outbox-writer.service';
import { OutboxDispatcherService } from '../src/platform/outbox/outbox-dispatcher.service';
import { StockService } from '../src/modules/stock/services/stock.service';
import { StockOrderPaidHandler } from '../src/modules/stock/handlers/stock-order-paid.handler';
import { StockOrderRefundedHandler } from '../src/modules/stock/handlers/stock-order-refunded.handler';
import { DomainEvent } from '../src/shared-kernel/types/domain-event';

describe('Paso 9: Stock de Vitrina y Agotado Automático (AvailabilityPort)', () => {
  let stockRepo: InMemoryStockRepository;
  let outboxStorage: InMemoryOutboxStorage;
  let outboxWriter: OutboxWriterService;
  let outboxDispatcher: OutboxDispatcherService;
  let stockService: StockService;
  let paidHandler: StockOrderPaidHandler;
  let refundedHandler: StockOrderRefundedHandler;

  const testStoreId = 'store-benevento-01';
  const croissantVariantId = 'var-croissant-unit-01';
  const tartaVariantId = 'var-tarta-portion-02';

  beforeEach(async () => {
    stockRepo = new InMemoryStockRepository();
    outboxStorage = new InMemoryOutboxStorage();
    outboxWriter = new OutboxWriterService(outboxStorage);
    outboxDispatcher = new OutboxDispatcherService(outboxStorage);

    stockService = new StockService(stockRepo);
    paidHandler = new StockOrderPaidHandler(stockService);
    refundedHandler = new StockOrderRefundedHandler(stockService);

    outboxDispatcher.registerHandler('order.paid.v1', paidHandler);
    outboxDispatcher.registerHandler('order.refunded.v1', refundedHandler);

    // Inicializar inventario de vitrina de prueba
    await stockService.initializeStockItem({
      storeId: testStoreId,
      productId: 'prod-croissant',
      productVariantId: croissantVariantId,
      productName: 'Croissant Clásico',
      variantName: 'Unidad',
      initialStock: 10,
      minStockAlert: 3,
      allowNegative: true,
      unitCostDecimal: 3.2,
    });

    await stockService.initializeStockItem({
      storeId: testStoreId,
      productId: 'prod-tarta',
      productVariantId: tartaVariantId,
      productName: 'Tarta de Frutos Rojos',
      variantName: 'Porción',
      initialStock: 5,
      minStockAlert: 2,
      allowNegative: true,
      unitCostDecimal: 5.5,
    });
  });

  it('debe inicializar el inventario de vitrina y registrar el movimiento de apertura', async () => {
    const item = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(item).not.toBeNull();
    expect(item!.currentStock).toBe(10);
    expect(item!.minStockAlert).toBe(3);

    const movements = await stockService.getMovements(item!.id);
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe('INITIAL_COUNT');
    expect(movements[0].quantityChange).toBe(10);
  });

  it('debe descontar automáticamente el stock de VITRINA al procesar order.paid.v1 ignorando BARRA', async () => {
    const orderPaidEvent: DomainEvent = {
      eventId: 'evt-order-stock-01',
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T12:00:00.000Z',
      storeId: testStoreId,
      correlationId: 'corr-stk-01',
      actor: { userId: 'usr-cajero-01' },
      payload: {
        orderId: 'ord-stk-100',
        orderNumber: 'C1-0040',
        items: [
          {
            orderItemId: 'it-croissant',
            variantId: croissantVariantId,
            productName: 'Croissant Clásico',
            variantName: 'Unidad',
            station: 'VITRINA',
            quantity: 2,
          },
          {
            orderItemId: 'it-latte',
            variantId: 'var-latte-12oz',
            productName: 'Latte',
            variantName: '12oz',
            station: 'BARRA', // No debe descontarse por unidad de vitrina
            quantity: 1,
          },
        ],
      },
    };

    await outboxWriter.write(orderPaidEvent);
    await outboxDispatcher.dispatchPending(10);

    // Stock de Croissant debe haber bajado de 10 a 8
    const updatedCroissant = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(updatedCroissant!.currentStock).toBe(8);

    const movements = await stockService.getMovements(updatedCroissant!.id);
    expect(movements.length).toBe(2);
    expect(movements[1].type).toBe('SALE_DEDUCTION');
    expect(movements[1].quantityChange).toBe(-2);
    expect(movements[1].referenceId).toBe('ord-stk-100');
  });

  it('debe alertar stock crítico y marcar automáticamente como AGOTADO cuando llega a 0', async () => {
    // 1. Vender 7 unidades -> Quedan 3 unidades (alcanza el umbral de alerta = 3)
    await stockService.deductForSale(testStoreId, croissantVariantId, 7, 'ord-01');

    let alerts = await stockService.getLowStockAlerts(testStoreId);
    expect(alerts.length).toBe(1);
    expect(alerts[0].productName).toBe('Croissant Clásico');
    expect(alerts[0].isLowStock()).toBe(true);

    // Sigue disponible para el POS porque stock > 0
    let isAvailable = await stockService.isProductVariantAvailable(testStoreId, croissantVariantId);
    expect(isAvailable).toBe(true);

    // 2. Vender las 3 restantes -> Quedan 0 unidades
    await stockService.deductForSale(testStoreId, croissantVariantId, 3, 'ord-02');

    const outOfStockItem = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(outOfStockItem!.currentStock).toBe(0);
    expect(outOfStockItem!.isOutOfStock()).toBe(true);

    // AvailabilityPort ahora reporta AGOTADO automáticamente
    isAvailable = await stockService.isProductVariantAvailable(testStoreId, croissantVariantId);
    expect(isAvailable).toBe(false);
  });

  it('debe permitir saldo negativo temporal con alerta sin bloquear la venta según política', async () => {
    // Vender 11 croissants cuando hay 10 en stock (desfase físico)
    const result = await stockService.deductForSale(testStoreId, croissantVariantId, 11, 'ord-rush');
    expect(result).not.toBeNull();
    expect(result!.remainingStock).toBe(-1);
    expect(result!.isOutOfStock()).toBe(true);

    const item = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(item!.currentStock).toBe(-1);
  });

  it('debe restaurar el stock al procesar un reembolso order.refunded.v1', async () => {
    // Vender 1 tarta -> Stock baja de 5 a 4
    await stockService.deductForSale(testStoreId, tartaVariantId, 1, 'ord-tarta-01');
    let item = await stockService.getStockItem(testStoreId, tartaVariantId);
    expect(item!.currentStock).toBe(4);

    // Evento de reembolso de la tarta
    const refundEvent: DomainEvent = {
      eventId: 'evt-refund-01',
      eventType: 'order.refunded.v1',
      schemaVersion: 1,
      occurredAt: '2026-10-11T12:30:00.000Z',
      storeId: testStoreId,
      correlationId: 'corr-ref-01',
      actor: { userId: 'usr-sup-01' },
      payload: {
        orderId: 'ord-tarta-01',
        orderItemId: 'item-tarta-01',
        productVariantId: tartaVariantId,
        productName: 'Tarta de Frutos Rojos',
        refundAmount: 14.0,
        reason: 'Cliente devolvió producto intacto',
      },
    };

    await outboxWriter.write(refundEvent);
    await outboxDispatcher.dispatchPending(10);

    // Stock debe restaurarse a 5
    item = await stockService.getStockItem(testStoreId, tartaVariantId);
    expect(item!.currentStock).toBe(5);

    const movements = await stockService.getMovements(item!.id);
    const lastMovement = movements[movements.length - 1];
    expect(lastMovement.type).toBe('VOID_REVERSAL');
    expect(lastMovement.quantityChange).toBe(1);
  });

  it('debe permitir reposición por horneado y ajuste por conteo físico', async () => {
    // 1. Reposición por horneado matutino (+20 croissants)
    await stockService.replenishStock(
      testStoreId,
      croissantVariantId,
      20,
      'Horneado matutino de obrador',
    );
    let item = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(item!.currentStock).toBe(30);

    // 2. Conteo físico de cierre (se contaron 28 unidades, merma de 2)
    await stockService.adjustPhysicalCount(
      testStoreId,
      croissantVariantId,
      28,
      'Cuadre de cierre de vitrina',
    );
    item = await stockService.getStockItem(testStoreId, croissantVariantId);
    expect(item!.currentStock).toBe(28);

    const movements = await stockService.getMovements(item!.id);
    const adjustMovement = movements[movements.length - 1];
    expect(adjustMovement.type).toBe('MANUAL_ADJUSTMENT');
    expect(adjustMovement.quantityChange).toBe(-2);
  });
});
