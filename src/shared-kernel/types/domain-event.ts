/**
 * Sobre estándar para todos los eventos de dominio en CoffeeOS.
 * Garantiza inmutabilidad, trazabilidad distribuida e idempotencia.
 */
export interface DomainEventActor {
  userId: string;
  registerId?: string;
}

export interface DomainEvent<TPayload = unknown> {
  eventId: string;          // UUID v4 único utilizado como clave de idempotencia
  eventType: string;        // Formato: 'dominio.accion.vX' (ej. 'order.paid.v1')
  schemaVersion: number;    // Versión del payload para migraciones no destructivas
  occurredAt: string;       // Timestamp ISO 8601 en UTC
  storeId: string;          // Identificador de la tienda / sucursal
  correlationId: string;    // Identificador para trazabilidad de la operación
  causationId?: string;     // ID del evento o comando causal
  actor: DomainEventActor;  // Usuario o terminal que originó el evento
  payload: TPayload;        // Carga de datos tipada del evento
}

/**
 * Interfaz para los manejadores de eventos idempotentes.
 */
export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  readonly handlerName: string;
  handle(event: TEvent): Promise<void>;
}
