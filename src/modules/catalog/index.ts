// API pública y puertos
export * from './api/availability.port';

// Entidades de dominio
export * from './domain/category.entity';
export * from './domain/product.entity';
export * from './domain/modifier.entity';

// Servicios de catálogo y cálculo de precios
export * from './services/catalog.service';
export * from './services/pricing.service';
export * from './services/csv-importer.service';

// Repositorios e infraestructura
export * from './infra/catalog.repository.interface';
export * from './infra/catalog.in-memory.repository';

// Módulo NestJS
export * from './catalog.module';
