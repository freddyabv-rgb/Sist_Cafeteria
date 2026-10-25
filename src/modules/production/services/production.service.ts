import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { DomainEvent } from '@shared/types/domain-event';
import { OutboxWriterService } from '@platform/outbox/outbox-writer.service';
import { AuditService } from '@platform/audit/audit.service';
import { IngredientStockPort } from '@modules/purchasing/api/ingredient-stock.port';
import { StockService } from '@modules/stock/services/stock.service';
import { ShowcaseStockItem } from '@modules/stock/domain/showcase-stock-item.entity';
import { CatalogService } from '@modules/catalog/services/catalog.service';
import { IProductionRepository } from '../domain/production.repository.interface';
import { ProductionRecipe, RecipeIngredientLine } from '../domain/production-recipe.entity';
import { ProductionBatch } from '../domain/production-batch.entity';
import {
  CreateProductionRecipeDto,
  PlanProductionBatchDto,
  CompleteProductionBatchDto,
  CancelProductionBatchDto,
  ProductionEfficiencyReportDto,
  ProductionBatchReportItem,
} from '../api/production.dto';

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    @Inject('PRODUCTION_REPOSITORY')
    private readonly productionRepo: IProductionRepository,
    @Inject('INGREDIENT_STOCK_PORT')
    private readonly ingredientStockPort: IngredientStockPort,
    private readonly stockService: StockService,
    private readonly catalogService: CatalogService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crea una nueva receta maestra de producción u obrador de pastelería/heladería.
   */
  public async createRecipe(dto: CreateProductionRecipeDto): Promise<ProductionRecipe> {
    if (dto.standardYieldUnits <= 0) {
      throw new BadRequestException('El rendimiento estándar de la receta debe ser mayor a cero.');
    }
    if (!dto.ingredients || dto.ingredients.length === 0) {
      throw new BadRequestException('La receta debe contener al menos un ingrediente de materia prima.');
    }

    // Resolver datos del catálogo de la variante terminada
    const catalogProducts = await this.catalogService.getCatalog(dto.storeId);
    let targetProduct: any = null;
    let targetVariant: any = null;

    for (const p of catalogProducts) {
      const v = p.variants.find((v) => v.id === dto.productVariantId);
      if (v) {
        targetProduct = p;
        targetVariant = v;
        break;
      }
    }

    if (!targetProduct || !targetVariant) {
      throw new NotFoundException(
        `La variante con ID "${dto.productVariantId}" no fue encontrada en el catálogo.`,
      );
    }

    // Resolver nombres de insumos de Kardex
    const ingredientLines: RecipeIngredientLine[] = [];
    for (const ing of dto.ingredients) {
      if (ing.quantity <= 0) {
        throw new BadRequestException('La dosificación de cada insumo debe ser mayor a cero.');
      }

      let ingName = 'Insumo';
      let ingCode = 'INS-GEN';
      let ingUnit = ing.unit || 'GRAM';

      if (this.ingredientStockPort.getIngredientInfo) {
        const info = await this.ingredientStockPort.getIngredientInfo(dto.storeId, ing.ingredientId);
        if (info) {
          ingName = info.name;
          ingCode = info.code;
          ingUnit = info.inventoryUnit;
        }
      }

      ingredientLines.push({
        ingredientId: ing.ingredientId,
        ingredientCode: ingCode,
        ingredientName: ingName,
        quantity: ing.quantity,
        unit: ingUnit,
      });
    }

    const recipe = new ProductionRecipe({
      id: uuidv4(),
      storeId: dto.storeId,
      name: dto.name,
      productVariantId: targetVariant.id,
      productName: targetProduct.name,
      variantName: targetVariant.name,
      category: dto.category,
      standardYieldUnits: dto.standardYieldUnits,
      estimatedPrepMinutes: dto.estimatedPrepMinutes ?? 60,
      ingredients: ingredientLines,
      instructions: dto.instructions,
      isActive: true,
      createdAt: new Date(),
    });

    await this.productionRepo.saveRecipe(recipe);
    this.logger.log(
      `[OBRADOR] Receta maestra creada: "${recipe.name}" (${recipe.standardYieldUnits}u estándar de ${recipe.productName})`,
    );

    return recipe;
  }

  /**
   * Planifica un nuevo lote de horneado o producción.
   */
  public async planBatch(dto: PlanProductionBatchDto): Promise<ProductionBatch> {
    const recipe = await this.productionRepo.findRecipeById(dto.recipeId);
    if (!recipe) {
      throw new NotFoundException(`Receta con ID "${dto.recipeId}" no encontrada.`);
    }

    if (dto.targetQuantity <= 0) {
      throw new BadRequestException('La cantidad planificada del lote debe ser mayor a cero.');
    }

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    const batchNumber = `LOT-${datePrefix}-${randomSuffix}`;

    const batch = new ProductionBatch({
      id: uuidv4(),
      storeId: dto.storeId,
      batchNumber,
      recipeId: recipe.id,
      recipeName: recipe.name,
      productVariantId: recipe.productVariantId,
      productName: recipe.productName,
      variantName: recipe.variantName,
      targetQuantity: dto.targetQuantity,
      status: 'PLANNED',
      totalCost: Money.zero('PEN'),
      unitCost: Money.zero('PEN'),
      bakerUserId: dto.bakerUserId,
      bakerName: dto.bakerName,
      notes: dto.notes,
      createdAt: new Date(),
    });

    await this.productionRepo.saveBatch(batch);
    this.logger.log(
      `[OBRADOR] Lote planificado #${batch.batchNumber}: ${batch.targetQuantity}u de "${batch.productName}" por ${batch.bakerName}`,
    );

    return batch;
  }

  /**
   * Inicia el proceso de producción/amasado del lote.
   */
  public async startBatch(batchId: string, bakerUserId: string): Promise<ProductionBatch> {
    const batch = await this.productionRepo.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundException(`Lote con ID "${batchId}" no encontrado.`);
    }

    if (batch.status !== 'PLANNED') {
      throw new BadRequestException(`El lote ya se encuentra en estado ${batch.status}.`);
    }

    batch.start();
    await this.productionRepo.saveBatch(batch);

    // Evento outbox
    const startEvent: DomainEvent<{
      batchId: string;
      batchNumber: string;
      productName: string;
      targetQuantity: number;
      bakerUserId: string;
      startedAt: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'production.batch_started.v1',
      schemaVersion: 1,
      occurredAt: batch.startedAt!.toISOString(),
      storeId: batch.storeId,
      correlationId: `batch-${batch.id}`,
      actor: { userId: bakerUserId },
      payload: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        productName: batch.productName,
        targetQuantity: batch.targetQuantity,
        bakerUserId,
        startedAt: batch.startedAt!.toISOString(),
      },
    };

    await this.outboxWriter.write(startEvent);
    this.logger.log(`[OBRADOR] Lote #${batch.batchNumber} iniciado por usuario ${bakerUserId}`);

    return batch;
  }

  /**
   * Completa el lote de producción:
   * 1. Descuenta materias primas en Kardex con tipo PRODUCTION_CONSUMPTION.
   * 2. Calcula el costo real total y unitario del lote al CPP actual.
   * 3. Ingresa las unidades aptas (actualYield) al stock de vitrina.
   * 4. Registra unidades mermadas (wasteUnits) y emite production.batch_completed.v1.
   */
  public async completeBatch(
    dto: CompleteProductionBatchDto,
  ): Promise<{ batch: ProductionBatch; showcaseItem: ShowcaseStockItem }> {
    const batch = await this.productionRepo.findBatchById(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Lote con ID "${dto.batchId}" no encontrado.`);
    }

    if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
      throw new BadRequestException(`El lote no puede completarse porque está en estado ${batch.status}.`);
    }

    const recipe = await this.productionRepo.findRecipeById(batch.recipeId);
    if (!recipe) {
      throw new NotFoundException(`Receta maestra "${batch.recipeId}" no encontrada.`);
    }

    const wasteUnits = dto.wasteUnits ?? 0;
    const actualYield = dto.actualYield;
    const totalProducedUnits = actualYield + wasteUnits;

    if (totalProducedUnits <= 0) {
      throw new BadRequestException('El total de unidades producidas (aptas + mermadas) debe ser mayor a cero.');
    }

    // Escalar la formulación proporcionalmente al total de masa horneada
    const scale = totalProducedUnits / recipe.standardYieldUnits;
    const deductions = recipe.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantityUnits: Number((ing.quantity * scale).toFixed(2)),
    }));

    // Descontar materias primas en Kardex mediante IngredientStockPort
    let totalCost = Money.zero('PEN');
    if (this.ingredientStockPort.deductProductionIngredients) {
      const deductionResults = await this.ingredientStockPort.deductProductionIngredients(
        dto.storeId,
        deductions,
        batch.id,
        batch.batchNumber,
        dto.bakerUserId,
      );

      for (const res of deductionResults) {
        totalCost = totalCost.add(res.totalCost);
      }
    } else {
      // Fallback a recordWasteOrCalibration si no existiera
      for (const d of deductions) {
        const res = await this.ingredientStockPort.recordWasteOrCalibration(
          dto.storeId,
          d.ingredientId,
          d.quantityUnits,
          'WASTE_DISPOSAL',
          `Consumo para Lote #${batch.batchNumber}`,
          dto.bakerUserId,
          `Lote #${batch.batchNumber}`,
        );
        totalCost = totalCost.add(res.totalCost);
      }
    }

    // Marcar lote como COMPLETED y calcular costo unitario
    batch.complete(actualYield, wasteUnits, totalCost);
    if (dto.notes) {
      batch.notes = dto.notes;
    }
    await this.productionRepo.saveBatch(batch);

    // Ingresar unidades aptas a la vitrina (ShowcaseStockItem)
    const catalogProducts = await this.catalogService.getCatalog(dto.storeId);
    let productId = 'prod-vitrina';
    for (const p of catalogProducts) {
      if (p.variants.some((v) => v.id === batch.productVariantId)) {
        productId = p.id;
        break;
      }
    }

    const showcaseItem = await this.stockService.receiveProductionBatch({
      storeId: dto.storeId,
      productId,
      productVariantId: batch.productVariantId,
      productName: batch.productName,
      variantName: batch.variantName,
      quantity: actualYield,
      unitCost: batch.unitCost,
      batchNumber: batch.batchNumber,
    });

    // Emisión de evento outbox
    const completeEvent: DomainEvent<{
      batchId: string;
      batchNumber: string;
      recipeName: string;
      productName: string;
      variantName: string;
      targetQuantity: number;
      actualYield: number;
      wasteUnits: number;
      efficiencyRate: number;
      totalCost: number;
      unitCost: number;
      bakerUserId: string;
      completedAt: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'production.batch_completed.v1',
      schemaVersion: 1,
      occurredAt: batch.completedAt!.toISOString(),
      storeId: dto.storeId,
      correlationId: `batch-${batch.id}`,
      actor: { userId: dto.bakerUserId },
      payload: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        recipeName: batch.recipeName,
        productName: batch.productName,
        variantName: batch.variantName,
        targetQuantity: batch.targetQuantity,
        actualYield: batch.actualYield,
        wasteUnits: batch.wasteUnits,
        efficiencyRate: batch.efficiencyRate,
        totalCost: batch.totalCost.toDecimal(),
        unitCost: batch.unitCost.toDecimal(),
        bakerUserId: dto.bakerUserId,
        completedAt: batch.completedAt!.toISOString(),
      },
    };

    await this.outboxWriter.write(completeEvent);
    this.logger.log(
      `[OBRADOR] Lote #${batch.batchNumber} completado: ${actualYield}u aptas enviadas a vitrina, ${wasteUnits}u mermadas. Eficiencia: ${batch.efficiencyRate}%. Costo unitario: ${batch.unitCost.format()}`,
    );

    return { batch, showcaseItem };
  }

  /**
   * Cancela un lote planificado o en curso.
   */
  public async cancelBatch(dto: CancelProductionBatchDto): Promise<ProductionBatch> {
    const batch = await this.productionRepo.findBatchById(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Lote con ID "${dto.batchId}" no encontrado.`);
    }

    if (batch.status === 'COMPLETED') {
      throw new BadRequestException('Un lote ya completado e ingresado a vitrina no puede ser cancelado.');
    }

    batch.cancel(dto.reason);
    await this.productionRepo.saveBatch(batch);

    await this.auditService.log({
      storeId: dto.storeId,
      userId: dto.bakerUserId,
      action: 'PRODUCTION_BATCH_CANCELLED',
      entity: 'PRODUCTION_BATCH',
      entityId: batch.id,
      afterState: { batchNumber: batch.batchNumber, reason: dto.reason },
    });

    return batch;
  }

  /**
   * Genera el reporte consolidado de eficiencia de producción y costos de horneado.
   */
  public async getEfficiencyReport(
    storeId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<ProductionEfficiencyReportDto> {
    const completedBatches = await this.productionRepo.findBatchesByStore(storeId, {
      status: 'COMPLETED',
      fromDate,
      toDate,
    });

    let totalPlannedUnits = 0;
    let totalActualYield = 0;
    let totalWasteUnits = 0;
    let totalProductionCostDec = 0;

    const reportItems: ProductionBatchReportItem[] = [];

    for (const b of completedBatches) {
      totalPlannedUnits += b.targetQuantity;
      totalActualYield += b.actualYield;
      totalWasteUnits += b.wasteUnits;
      totalProductionCostDec += b.totalCost.toDecimal();

      reportItems.push({
        batchNumber: b.batchNumber,
        productName: b.productName,
        variantName: b.variantName,
        actualYield: b.actualYield,
        wasteUnits: b.wasteUnits,
        efficiencyRate: b.efficiencyRate,
        unitCostDec: b.unitCost.toDecimal(),
        totalCostDec: b.totalCost.toDecimal(),
        bakerName: b.bakerName,
        completedAt: b.completedAt ? b.completedAt.toISOString() : '',
      });
    }

    const averageEfficiencyRate =
      totalPlannedUnits > 0
        ? Number(((totalActualYield / totalPlannedUnits) * 100).toFixed(2))
        : 0;

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      totalBatches: completedBatches.length,
      totalPlannedUnits,
      totalActualYield,
      totalWasteUnits,
      averageEfficiencyRate,
      totalProductionCostDec: Number(totalProductionCostDec.toFixed(2)),
      batches: reportItems,
    };
  }
}
