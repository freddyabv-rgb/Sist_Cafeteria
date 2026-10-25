import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from '@shared/types/domain-event';
import { IOutboxStorage } from './outbox-storage.interface';

@Injectable()
export class OutboxWriterService {
  constructor(
    @Inject('OUTBOX_STORAGE')
    private readonly storage: IOutboxStorage,
  ) {}

  /**
   * Guarda un evento de dominio en la tabla outbox dentro de la transacción activa.
   */
  public async write<T>(event: DomainEvent<T>): Promise<void> {
    await this.storage.save({
      id: uuidv4(),
      eventId: event.eventId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      payload: JSON.stringify(event),
      createdAt: new Date(),
    });
  }

  /**
   * Alias de conveniencia para compatibilidad con pruebas y servicios heredados.
   */
  public async writeEvent<T>(event: DomainEvent<T>): Promise<void> {
    return this.write(event);
  }
}
