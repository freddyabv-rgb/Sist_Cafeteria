import {
  Injectable,
  Inject,
  Optional,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { DomainEvent } from '@shared/types/domain-event';
import { OutboxWriterService } from '@platform/outbox/outbox-writer.service';
import { AuthService } from '@platform/auth/auth.service';
import { AuditService } from '@platform/audit/audit.service';
import { IngredientStockPort } from '@modules/purchasing/api/ingredient-stock.port';
import { RecipesService } from '@modules/recipes/services/recipes.service';
import { IWasteRepository } from '../domain/waste.repository.interface';
import { GrinderCalibration } from '../domain/grinder-calibration.entity';
import { WasteRecord, WasteItemLine } from '../domain/waste-record.entity';
import {
  RecordGrinderCalibrationDto,
  RecordWasteDto,
  RecordRemakeOrderDto,
  WasteSummaryReportDto,
  WasteSummaryItemReport,
} from '../api/waste.dto';

@Injectable()
export class WasteService {
  private readonly logger = new Logger(WasteService.name);
  public static readonly SENSITIVE_WASTE_COST_THRESHOLD_DEC = 15.0; // Mermas >= S/ 15.00 exigen PIN de supervisor

  constructor(
    @Inject('WASTE_REPOSITORY')
    private readonly wasteRepo: IWasteRepository,
    @Inject('INGREDIENT_STOCK_PORT')
    private readonly ingredientStockPort: IngredientStockPort,
    private readonly outboxWriter: OutboxWriterService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    @Optional()
    private readonly recipesService?: RecipesService,
  ) {}

  /**
   * Registra la calibración técnica matutina del molino (dial-in) con purga de shots.
   * Descuenta el café consumido en pruebas en el Kardex y emite evento outbox.
   */
  public async recordGrinderCalibration(
    dto: RecordGrinderCalibrationDto,
  ): Promise<GrinderCalibration> {
    if (dto.doseInGrams <= 0) {
      throw new BadRequestException('La dosis de entrada debe ser mayor a cero gramos.');
    }
    if (dto.yieldOutGrams <= 0) {
      throw new BadRequestException('El rendimiento líquido debe ser mayor a cero gramos.');
    }
    if (dto.extractionTimeSeconds <= 0) {
      throw new BadRequestException('El tiempo de extracción debe ser mayor a cero segundos.');
    }

    const testShots = dto.testShotsCount > 0 ? dto.testShotsCount : 1;
    const wastedGrams =
      dto.totalWastedGrams > 0 ? dto.totalWastedGrams : testShots * dto.doseInGrams;

    // Descontar gramos de café en Kardex mediante IngredientStockPort
    const docRef = `CALIB_${dto.grinderName.replace(/\s+/g, '_').toUpperCase()}`;
    const deduction = await this.ingredientStockPort.recordWasteOrCalibration(
      dto.storeId,
      dto.ingredientId,
      wastedGrams,
      'GRINDER_CALIBRATION',
      `Calibración matutina molino ${dto.grinderName} (${testShots} shots probados, ${wastedGrams}g purgados)`,
      dto.baristaUserId,
      docRef,
    );

    const calibrationId = uuidv4();
    const calibration = new GrinderCalibration({
      id: calibrationId,
      storeId: dto.storeId,
      grinderName: dto.grinderName,
      ingredientId: dto.ingredientId,
      ingredientName: deduction.ingredientName,
      targetDrink: dto.targetDrink || 'Espresso Doble 1:2',
      doseInGrams: dto.doseInGrams,
      yieldOutGrams: dto.yieldOutGrams,
      extractionTimeSeconds: dto.extractionTimeSeconds,
      grindSetting: dto.grindSetting,
      testShotsCount: testShots,
      totalWastedGrams: wastedGrams,
      unitCostDec: deduction.unitCostDec,
      totalCost: deduction.totalCost,
      sensoryNotes: dto.sensoryNotes,
      status: dto.status || 'APPROVED',
      baristaUserId: dto.baristaUserId,
      baristaName: dto.baristaName,
      createdAt: new Date(),
    });

    await this.wasteRepo.saveCalibration(calibration);

    // Publicar evento en Transactional Outbox
    const event: DomainEvent<{
      calibrationId: string;
      grinderName: string;
      ingredientName: string;
      doseInGrams: number;
      yieldOutGrams: number;
      extractionTimeSeconds: number;
      grindSetting: string;
      brewRatio: number;
      totalWastedGrams: number;
      totalCost: number;
      baristaUserId: string;
      baristaName: string;
      status: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'grinder.calibrated.v1',
      schemaVersion: 1,
      occurredAt: calibration.createdAt.toISOString(),
      storeId: dto.storeId,
      correlationId: `calib-${calibrationId}`,
      actor: { userId: dto.baristaUserId },
      payload: {
        calibrationId: calibration.id,
        grinderName: calibration.grinderName,
        ingredientName: calibration.ingredientName,
        doseInGrams: calibration.doseInGrams,
        yieldOutGrams: calibration.yieldOutGrams,
        extractionTimeSeconds: calibration.extractionTimeSeconds,
        grindSetting: calibration.grindSetting,
        brewRatio: calibration.brewRatio,
        totalWastedGrams: calibration.totalWastedGrams,
        totalCost: calibration.totalCost.toDecimal(),
        baristaUserId: calibration.baristaUserId,
        baristaName: calibration.baristaName,
        status: calibration.status,
      },
    };

    await this.outboxWriter.write(event);
    this.logger.log(
      `[CALIBRACIÓN MOLINO] ${calibration.grinderName} calibrado por ${calibration.baristaName}: ${wastedGrams}g purgados (Costo: ${calibration.totalCost.format()})`,
    );

    return calibration;
  }

  /**
   * Registra una merma operativa en barra (derrames, vencimientos, consumo de personal).
   * Requiere autorización con PIN de supervisor si supera el umbral de control o si es vencimiento.
   */
  public async recordWaste(dto: RecordWasteDto): Promise<WasteRecord> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Debe especificar al menos un insumo mermado.');
    }
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('El motivo de la merma es obligatorio.');
    }

    const lines: WasteItemLine[] = [];
    let wasteGrossTotal = Money.zero('PEN');

    // Descontar cada insumo en Kardex
    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException('La cantidad mermada debe ser mayor a cero.');
      }

      const docRef = dto.orderNumber ? `Orden #${dto.orderNumber}` : `MERMA_${dto.type}`;
      const deduction = await this.ingredientStockPort.recordWasteOrCalibration(
        dto.storeId,
        item.ingredientId,
        item.quantity,
        'WASTE_DISPOSAL',
        `[${dto.type}] ${dto.reason}`,
        dto.responsibleUserId,
        docRef,
      );

      lines.push({
        ingredientId: item.ingredientId,
        ingredientCode: '',
        ingredientName: deduction.ingredientName,
        quantity: item.quantity,
        unit: item.unit || 'UNIDAD',
        unitCostDec: deduction.unitCostDec,
        totalCost: deduction.totalCost,
      });

      wasteGrossTotal = wasteGrossTotal.add(deduction.totalCost);
    }

    const wasteRecordId = uuidv4();
    let supervisorUserId: string | undefined = undefined;

    // Validación de control interno: Si la pérdida supera el umbral o es vencimiento, exigir PIN de supervisor
    const exceedsThreshold =
      wasteGrossTotal.toDecimal() >= WasteService.SENSITIVE_WASTE_COST_THRESHOLD_DEC;
    if (exceedsThreshold || dto.type === 'EXPIRED') {
      if (!dto.supervisorPin) {
        throw new BadRequestException(
          `Mermas de tipo ${dto.type} o con costo mayor a S/ ${WasteService.SENSITIVE_WASTE_COST_THRESHOLD_DEC.toFixed(2)} requieren PIN de supervisor.`,
        );
      }

      const supervisor = this.authService.authorizeSupervisorAction(
        dto.storeId,
        dto.supervisorPin,
      );
      supervisorUserId = supervisor.id;

      await this.auditService.log({
        storeId: dto.storeId,
        userId: supervisor.id,
        action: 'WASTE_AUTHORIZED',
        entity: 'WASTE_RECORD',
        entityId: wasteRecordId,
        afterState: {
          type: dto.type,
          reason: dto.reason,
          cost: wasteGrossTotal.toDecimal(),
          linesCount: lines.length,
        },
      });
    }

    const wasteRecord = new WasteRecord({
      id: wasteRecordId,
      storeId: dto.storeId,
      type: dto.type,
      reason: dto.reason,
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      responsibleUserId: dto.responsibleUserId,
      responsibleUserName: dto.responsibleUserName,
      supervisorUserId,
      items: lines,
      totalCost: wasteGrossTotal,
      createdAt: new Date(),
    });

    await this.wasteRepo.saveWasteRecord(wasteRecord);

    // Emisión de evento outbox
    const wasteEvent: DomainEvent<{
      wasteRecordId: string;
      type: string;
      reason: string;
      orderId?: string;
      orderNumber?: string;
      totalCost: number;
      responsibleUserId: string;
      responsibleUserName: string;
      items: Array<{ ingredientName: string; quantity: number; cost: number }>;
    }> = {
      eventId: uuidv4(),
      eventType: 'waste.registered.v1',
      schemaVersion: 1,
      occurredAt: wasteRecord.createdAt.toISOString(),
      storeId: dto.storeId,
      correlationId: `waste-${wasteRecordId}`,
      actor: { userId: dto.responsibleUserId },
      payload: {
        wasteRecordId: wasteRecord.id,
        type: wasteRecord.type,
        reason: wasteRecord.reason,
        orderId: wasteRecord.orderId,
        orderNumber: wasteRecord.orderNumber,
        totalCost: wasteRecord.totalCost.toDecimal(),
        responsibleUserId: wasteRecord.responsibleUserId,
        responsibleUserName: wasteRecord.responsibleUserName,
        items: lines.map((l) => ({
          ingredientName: l.ingredientName,
          quantity: l.quantity,
          cost: l.totalCost.toDecimal(),
        })),
      },
    };

    await this.outboxWriter.write(wasteEvent);
    this.logger.log(
      `[MERMA REGISTRADA] Tipo: ${wasteRecord.type} | Costo: ${wasteRecord.totalCost.format()} | Motivo: "${wasteRecord.reason}"`,
    );

    return wasteRecord;
  }

  /**
   * Registra una bebida rehecha (REMAKE) vinculada a una comanda de venta.
   * Utiliza el motor de recetas para deducir automáticamente los insumos exactos que se perdieron.
   */
  public async recordRemakeOrder(dto: RecordRemakeOrderDto): Promise<WasteRecord> {
    if (!this.recipesService) {
      throw new BadRequestException(
        'El módulo de recetas no está configurado para resolver deducciones automáticas de bebida rehecha.',
      );
    }

    const deductions = await this.recipesService.resolveOrderItemDeductions(
      dto.storeId,
      {
        productVariantId: dto.productVariantId,
        quantity: dto.quantity,
        modifiers: dto.modifiers || [],
      },
      'DINE_IN', // Para rehechas solo se pierde la bebida elaborada
    );

    if (deductions.length === 0) {
      throw new BadRequestException(
        'La variante especificada no tiene insumos configurados en su receta para registrar el remake.',
      );
    }

    const items: RecordWasteDto['items'] = deductions.map((d) => ({
      ingredientId: d.ingredientId,
      quantity: d.quantityUnits,
      unit: d.unit,
    }));

    return this.recordWaste({
      storeId: dto.storeId,
      type: 'REMAKE',
      reason: dto.reason,
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      responsibleUserId: dto.responsibleUserId,
      responsibleUserName: dto.responsibleUserName,
      supervisorPin: dto.supervisorPin,
      items,
    });
  }

  /**
   * Genera el reporte consolidado de mermas y calibración valorizado en Soles.
   */
  public async getWasteSummaryReport(
    storeId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<WasteSummaryReportDto> {
    const wasteRecords = await this.wasteRepo.findWasteRecords(storeId, {
      fromDate,
      toDate,
    });
    const calibrations = await this.wasteRepo.findCalibrations(storeId, {
      fromDate,
      toDate,
    });

    let totalCalibrationCostDec = 0;
    let totalCoffeeGramsCalibrated = 0;

    for (const c of calibrations) {
      totalCalibrationCostDec += c.totalCost.toDecimal();
      totalCoffeeGramsCalibrated += c.totalWastedGrams;
    }

    const breakdownMap = new Map<string, { count: number; totalCostDec: number }>();

    // Inicializar tipos
    const allTypes = [
      'GRINDER_CALIBRATION',
      'REMAKE',
      'SPILLAGE',
      'STAFF_CONSUMPTION',
      'EXPIRED',
      'MACHINE_PURGE',
    ];
    for (const t of allTypes) {
      breakdownMap.set(t, { count: 0, totalCostDec: 0 });
    }

    breakdownMap.set('GRINDER_CALIBRATION', {
      count: calibrations.length,
      totalCostDec: Number(totalCalibrationCostDec.toFixed(2)),
    });

    let totalOperationalWasteCostDec = 0;

    for (const w of wasteRecords) {
      const current = breakdownMap.get(w.type) || { count: 0, totalCostDec: 0 };
      current.count += 1;
      current.totalCostDec += w.totalCost.toDecimal();
      breakdownMap.set(w.type, current);
      totalOperationalWasteCostDec += w.totalCost.toDecimal();
    }

    const breakdown: WasteSummaryItemReport[] = [];
    for (const [type, data] of breakdownMap.entries()) {
      breakdown.push({
        type: type as any,
        count: data.count,
        totalCostDec: Number(data.totalCostDec.toFixed(2)),
      });
    }

    const totalLossCostDec = Number(
      (totalCalibrationCostDec + totalOperationalWasteCostDec).toFixed(2),
    );

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      totalLossCostDec,
      totalCalibrationCostDec: Number(totalCalibrationCostDec.toFixed(2)),
      totalOperationalWasteCostDec: Number(totalOperationalWasteCostDec.toFixed(2)),
      totalCoffeeGramsCalibrated,
      breakdown,
    };
  }
}
