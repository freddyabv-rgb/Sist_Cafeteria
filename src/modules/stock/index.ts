// API y Puertos
export * from './api/stock-availability.port';

// Entidades de dominio
export * from './domain/showcase-stock-item.entity';
export * from './domain/stock-movement.entity';

// Servicios y Repositorios
export * from './services/stock.service';
export * from './infra/stock.repository.interface';
export * from './infra/stock.in-memory.repository';

// Manejadores de Eventos
export * from './handlers/stock-order-paid.handler';
export * from './handlers/stock-order-refunded.handler';

// Módulo NestJS
export * from './stock.module';
