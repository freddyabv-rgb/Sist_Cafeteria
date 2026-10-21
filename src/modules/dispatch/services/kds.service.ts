import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from '@shared/types/domain-event';
import { OutboxWriterService } from '@platform/outbox/outbox-writer.service';
import { IKdsRepository } from '../infra/kds.repository.interface';
import { KdsOrderCard, KdsCardItem } from '../domain/kds-card.entity';

export interface AddOrderToQueueInput {
  orderId: string;
  storeId: string;
  orderNumber: string;
  orderType: 'TAKEAWAY' | 'DINE_IN';
  customerName?: string;
  paidAt: string;
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    station: string;
    quantity: number;
    notes?: string;
    modifiers: Array<{
      optionName: string;
      quantity: number;
      highlightKds: boolean;
    }>;
  }>;
}

export interface KdsQueueSnapshot {
  storeId: string;
  activeCards: Array<{
    id: string;
    orderNumber: string;
    orderType: string;
    customerName?: string;
    paidAt: string;
    status: string;
    items: KdsCardItem[];
    sla: {
      status: string;
      elapsedSeconds: number;
      colorToken: string;
      accessibleLabel: string;
    };
  }>;
  recentReadyCards: Array<{
    id: string;
    orderNumber: string;
    prepDurationSeconds?: number;
  }>;
  timestamp: string;
}

@Injectable()
export class KdsService {
  private readonly logger = new Logger(KdsService.name);

  constructor(
    @Inject('KDS_REPOSITORY')
    private readonly kdsRepo: IKdsRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * Procesa un pedido pagado y lo agrega a la cola de barista si contiene ítems de estación BARRA.
   */
  public async addOrderToQueue(input: AddOrderToQueueInput): Promise<KdsOrderCard | null> {
    const existing = await this.kdsRepo.findCardById(input.orderId);
    if (existing) {
      return existing; // Idempotencia: no duplicar tarjeta si ya existe
    }

    const barraItems = input.items.filter((i) => i.station === 'BARRA');
    if (barraItems.length === 0) {
      return null; // Omitir si no tiene bebidas de barra
    }

    const items: KdsCardItem[] = barraItems.map((i) => ({
      orderItemId: i.orderItemId,
      name: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      notes: i.notes,
      modifiers: i.modifiers.map((m) => ({
        optionName: m.optionName,
        quantity: m.quantity,
        highlightKds: m.highlightKds,
      })),
    }));

    const card = new KdsOrderCard({
      id: input.orderId,
      storeId: input.storeId,
      orderNumber: input.orderNumber,
      orderType: input.orderType,
      customerName: input.customerName,
      paidAt: new Date(input.paidAt),
      status: 'RECEIVED',
      items,
    });

    await this.kdsRepo.saveCard(card);
    this.logger.log(`Pedido ${input.orderNumber} agregado a la cola de KDS de Barista`);
    return card;
  }

  /**
   * Barista pulsa para iniciar la preparación de la bebida.
   */
  public async startPreparing(orderId: string): Promise<KdsOrderCard> {
    const card = await this.kdsRepo.findCardById(orderId);
    if (!card) {
      throw new NotFoundException(`Tarjeta de KDS ${orderId} no encontrada.`);
    }

    card.startPreparing();
    await this.kdsRepo.saveCard(card);
    this.logger.log(`Barista inició preparación de pedido ${card.orderNumber}`);
    return card;
  }

  /**
   * Barista pulsa "Listo para entrega": calcula tiempo de preparación y emite order.ready.v1 al Outbox.
   */
  public async markReady(orderId: string): Promise<KdsOrderCard> {
    const card = await this.kdsRepo.findCardById(orderId);
    if (!card) {
      throw new NotFoundException(`Tarjeta de KDS ${orderId} no encontrada.`);
    }

    card.markAsReady();
    await this.kdsRepo.saveCard(card);
    this.logger.log(
      `Pedido ${card.orderNumber} marcado como LISTO en ${card.prepDurationSeconds} segundos`,
    );

    // Publicación del evento de negocio order.ready.v1 en el Transactional Outbox
    const readyEvent: DomainEvent<{
      orderId: string;
      orderNumber: string;
      customerName?: string;
      prepDurationSeconds: number;
      readyAt: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'order.ready.v1',
      schemaVersion: 1,
      occurredAt: card.readyAt!.toISOString(),
      storeId: card.storeId,
      correlationId: `kds-ready-${card.id}`,
      actor: { userId: 'barista-terminal' },
      payload: {
        orderId: card.id,
        orderNumber: card.orderNumber,
        customerName: card.customerName,
        prepDurationSeconds: card.prepDurationSeconds || 0,
        readyAt: card.readyAt!.toISOString(),
      },
    };

    await this.outboxWriter.write(readyEvent);
    return card;
  }

  /**
   * Retorna el snapshot completo de la cola para resincronización ante caídas de WiFi.
   */
  public async getReconnectionSnapshot(storeId: string): Promise<KdsQueueSnapshot> {
    const activeCards = await this.kdsRepo.findActiveQueue(storeId);
    const recentReady = await this.kdsRepo.findRecentCompleted(storeId, 5);

    const now = new Date();
    return {
      storeId,
      activeCards: activeCards.map((card) => ({
        id: card.id,
        orderNumber: card.orderNumber,
        orderType: card.orderType,
        customerName: card.customerName,
        paidAt: card.paidAt.toISOString(),
        status: card.status,
        items: card.items,
        sla: card.getSlaStatus(now),
      })),
      recentReadyCards: recentReady.map((card) => ({
        id: card.id,
        orderNumber: card.orderNumber,
        prepDurationSeconds: card.prepDurationSeconds,
      })),
      timestamp: now.toISOString(),
    };
  }
}
