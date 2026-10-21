import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { KdsService } from '../services/kds.service';
import { KdsOrderCard } from '../domain/kds-card.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/kds',
})
export class KdsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  public server: Server;

  private readonly logger = new Logger(KdsGateway.name);

  constructor(private readonly kdsService: KdsService) {}

  public handleConnection(client: Socket): void {
    this.logger.log(`Tablet de KDS Barista conectada a la red LAN (ID: ${client.id})`);
  }

  public handleDisconnect(client: Socket): void {
    this.logger.warn(`Tablet de KDS Barista desconectada (ID: ${client.id})`);
  }

  /**
   * Resincronización al reconectar: la tablet solicita el snapshot completo tras caída de WiFi.
   */
  @SubscribeMessage('kds:request_sync')
  public async handleRequestSync(
    client: Socket,
    @MessageBody() data: { storeId: string },
  ): Promise<void> {
    const storeId = data?.storeId || 'store-benevento-01';
    const snapshot = await this.kdsService.getReconnectionSnapshot(storeId);
    client.emit('kds:queue_synced', snapshot);
    this.logger.log(
      `Snapshot de resincronización enviado a la tablet ${client.id} (${snapshot.activeCards.length} pedidos activos)`,
    );
  }

  /**
   * Barista pulsa sobre una tarjeta para iniciar preparación.
   */
  @SubscribeMessage('kds:start_order')
  public async handleStartOrder(
    _client: Socket,
    @MessageBody() data: { orderId: string },
  ): Promise<void> {
    const card = await this.kdsService.startPreparing(data.orderId);
    if (this.server) {
      this.server.emit('kds:order_updated', {
        orderId: card.id,
        status: card.status,
        startedAt: card.startedAt?.toISOString(),
      });
    }
  }

  /**
   * Barista marca la orden como lista.
   */
  @SubscribeMessage('kds:ready_order')
  public async handleReadyOrder(
    _client: Socket,
    @MessageBody() data: { orderId: string },
  ): Promise<void> {
    const card = await this.kdsService.markReady(data.orderId);
    if (this.server) {
      this.server.emit('kds:order_ready', {
        orderId: card.id,
        orderNumber: card.orderNumber,
        prepDurationSeconds: card.prepDurationSeconds,
        readyAt: card.readyAt?.toISOString(),
      });
    }
  }

  /**
   * Notifica en vivo a todas las tablets de barra cuando entra un nuevo pedido pagado.
   */
  public broadcastNewOrder(card: KdsOrderCard): void {
    if (this.server) {
      this.server.emit('kds:order_added', {
        id: card.id,
        orderNumber: card.orderNumber,
        orderType: card.orderType,
        customerName: card.customerName,
        paidAt: card.paidAt.toISOString(),
        status: card.status,
        items: card.items,
        sla: card.getSlaStatus(),
      });
    }
  }
}
