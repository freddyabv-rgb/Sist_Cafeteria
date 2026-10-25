import { Injectable, Inject } from '@nestjs/common';
import { ICatalogRepository } from '../infra/catalog.repository.interface';
import { Category } from '../domain/category.entity';
import { Product } from '../domain/product.entity';
import { ModifierGroup } from '../domain/modifier.entity';
import { AvailabilityPort } from '../api/availability.port';
import { CsvImporterService } from './csv-importer.service';

@Injectable()
export class CatalogService implements AvailabilityPort {
  constructor(
    @Inject('CATALOG_REPOSITORY')
    private readonly catalogRepo: ICatalogRepository,
    private readonly csvImporter: CsvImporterService,
  ) {}

  public async getCategories(storeId: string): Promise<Category[]> {
    return this.catalogRepo.findCategories(storeId);
  }

  public async getProducts(storeId: string, categoryId?: string): Promise<Product[]> {
    return this.catalogRepo.findProducts(storeId, categoryId);
  }

  public async getCatalog(storeId: string): Promise<Product[]> {
    return this.catalogRepo.findProducts(storeId);
  }

  public async getProductById(productId: string): Promise<Product | null> {
    return this.catalogRepo.findProductById(productId);
  }

  public async getModifierGroups(storeId: string): Promise<ModifierGroup[]> {
    return this.catalogRepo.findModifierGroups(storeId);
  }

  /**
   * Cambia la disponibilidad de un producto ("Agotado" manual en mostrador con 1 toque).
   */
  public async setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
    await this.catalogRepo.setProductAvailability(productId, isAvailable);
  }

  /**
   * Implementación de AvailabilityPort para consultas de otros módulos (ej. POS).
   */
  public async isProductAvailable(productId: string): Promise<boolean> {
    const product = await this.catalogRepo.findProductById(productId);
    return product ? product.isAvailable && product.isActive : false;
  }

  public async isOptionAvailable(_optionId: string): Promise<boolean> {
    // En la Fase 1, las opciones de modificador siempre están disponibles a menos que se agoten por producto
    return true;
  }

  /**
   * Carga inicial o actualización del catálogo desde formato CSV.
   */
  public async importFromCsv(storeId: string, csvContent: string) {
    return this.csvImporter.importFromCsv(storeId, csvContent);
  }
}
