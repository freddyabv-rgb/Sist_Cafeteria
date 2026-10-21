// API y DTOs
export * from './api/waste.dto';

// Entidades de dominio
export * from './domain/grinder-calibration.entity';
export * from './domain/waste-record.entity';

// Repositorios e interfaces
export * from './domain/waste.repository.interface';
export * from './infra/waste.in-memory.repository';

// Servicios y Módulo
export * from './services/waste.service';
export * from './waste.module';
