// API y DTOs
export * from './api/dining.dto';

// Entidades de dominio
export * from './domain/dining-table.entity';
export * from './domain/dining-tab.entity';

// Repositorios e interfaces
export * from './domain/dining.repository.interface';
export * from './infra/dining.in-memory.repository';

// Servicios y Módulo
export * from './services/dining.service';
export * from './dining.module';
