// API pública y DTOs
export * from './api/create-cash-order.dto';
export * from './api/create-order.dto';

// Entidades de dominio
export * from './domain/order.entity';
export * from './domain/order-item.entity';
export * from './domain/payment.entity';

// Servicios de ventas
export * from './services/sales.service';

// Repositorios e infraestructura
export * from './infra/sales.repository.interface';
export * from './infra/sales.in-memory.repository';

// Módulo NestJS
export * from './sales.module';
