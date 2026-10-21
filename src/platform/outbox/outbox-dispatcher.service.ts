import { Injectable, Inject, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@shared/types/domain-event';
import { IOutboxStorage } from './outbox-storage.interface';
import { OutboxRecord } from './outbox.entity';

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly handlers: Map<string, DomainEventHandler[]> = new Map();

  constructor(
    @Inject('OUTBOX_STORAGE')
    private readonly storage: IOutboxStorage,
  ) {}

  /**
   * Registra un suscriptor para un tipo de evento específico.
   */
  public registerHandler(eventType: string, handler: DomainEventHandler): void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
    this.logger.log(
      `Handler registrado: [${handler.handlerName}] para evento [${eventType}]`,
    );
  }

  /**
   * Procesa una tanda de eventos pendientes del outbox.
   */
  public async dispatchPending(limit: number = 20): Promise<number> {
    const records = await this.storage.findPending(limit);
    if (records.length === 0) {
      return 0;
    }

    let processedCount = 0;
    for (const record of records) {
      const success = await this.dispatchSingle(record);
      if (success) {
        processedCount++;
      }
    }
    return processedCount;
  }

  private async dispatchSingle(record: OutboxRecord): Promise<boolean> {
    try {
      const event: DomainEvent = JSON.parse(record.payload);
      const handlers = this.handlers.get(record.eventType) || [];

      for (const handler of handlers) {
        const alreadyProcessed = await this.storage.isProcessed(
          record.eventId,
          handler.handlerName,
        );

        if (alreadyProcessed) {
          this.logger.debug(
            `Evento ${record.eventId} ya procesado por ${handler.handlerName}. Omitiendo.`,
          );
          continue;
        }

        // Ejecutar handler del suscriptor
        await handler.handle(event);

        // Registrar en processed_events para garantizar idempotencia
        await this.storage.markProcessed({
          eventId: record.eventId,
          handler: handler.handlerName,
          processedAt: new Date(),
        });
      }

      await this.storage.markPublished(record.id);
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error al despachar evento ${record.eventId}: ${errorMsg}`,
      );
      await this.storage.recordFailure(record.id, errorMsg);
      return false;
    }
  }
}
