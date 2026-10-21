// API y Puertos
export * from './api/purchasing.dto';
export * from './api/ingredient-stock.port';

// Entidades de dominio
export * from './domain/raw-ingredient.entity';
export * from './domain/supplier.entity';
export * from './domain/purchase-order.entity';
export * from './domain/kardex-movement.entity';
export * from './domain/unit-converter';

// Servicios y Repositorios
export * from './services/purchasing.service';
export * from './infra/purchasing.repository.interface';
export * from './infra/purchasing.in-memory.repository';

// Módulo NestJS
export * from './purchasing.module';
