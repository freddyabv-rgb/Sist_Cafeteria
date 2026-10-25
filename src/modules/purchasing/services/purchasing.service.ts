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
import { IPurchasingRepository } from '../infra/purchasing.repository.interface';
import { Supplier } from '../domain/supplier.entity';
import { RawIngredient } from '../domain/raw-ingredient.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../domain/purchase-order.entity';
import { KardexMovement } from '../domain/kardex-movement.entity';
import { UnitConverter } from '../domain/unit-converter';
import {
  RegisterSupplierDto,
  RegisterIngredientDto,
  ReceivePurchaseOrderDto,
  AdjustPhysicalStockDto,
  ValuedInventoryReportDto,
  ValuedInventoryItemDto,
} from '../api/purchasing.dto';
import {
  IngredientStockPort,
  IngredientDeductionInput,
  WasteDeductionResult,
  IngredientInfo,
} from '../api/ingredient-stock.port';

@Injectable()
export class PurchasingService implements IngredientStockPort {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    @Inject('PURCHASING_REPOSITORY')
    private readonly purchasingRepo: IPurchasingRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * Registra un nuevo proveedor de insumos.
   */
  public async registerSupplier(dto: RegisterSupplierDto): Promise<Supplier> {
    const existing = await this.purchasingRepo.findSupplierByTaxId(dto.storeId, dto.taxId);
    if (existing) {
      throw new BadRequestException(
        `Ya existe un proveedor registrado con el RUC "${dto.taxId}".`,
      );
    }

    const supplier = new Supplier({
      id: uuidv4(),
      storeId: dto.storeId,
      taxId: dto.taxId,
      legalName: dto.legalName,
      commercialName: dto.commercialName,
      contactName: dto.contactName,
      phone: dto.phone,
      email: dto.email,
      leadTimeDays: dto.leadTimeDays ?? 2,
      isActive: true,
    });

    await this.purchasingRepo.saveSupplier(supplier);
    this.logger.log(`[PROVEEDOR] Registrado: ${supplier.commercialName} (RUC: ${supplier.taxId})`);
    return supplier;
  }

  /**
   * Registra un nuevo insumo de barra en el catálogo maestro.
   */
  public async registerIngredient(dto: RegisterIngredientDto): Promise<RawIngredient> {
    const existing = await this.purchasingRepo.findIngredientByCode(dto.storeId, dto.code);
    if (existing) {
      throw new BadRequestException(`Ya existe un insumo con el código "${dto.code}".`);
    }

    const initialStock = dto.initialStock ?? 0;
    const initialCostDec = dto.initialCostDec ?? 0;

    const ingredient = new RawIngredient({
      id: uuidv4(),
      storeId: dto.storeId,
      code: dto.code,
      name: dto.name,
      category: dto.category,
      inventoryUnit: dto.inventoryUnit,
      currentStock: initialStock,
      minStockAlert: dto.minStockAlert ?? 0,
      currentAverageCostDec: initialCostDec,
      lastPurchaseDate: initialStock > 0 ? new Date() : undefined,
      isActive: true,
    });

    await this.purchasingRepo.saveIngredient(ingredient);

    // Si tiene stock inicial, registrar apertura en Kardex
    if (initialStock > 0) {
      const initialTotalValue = ingredient.getTotalInventoryValue();
      const initialMovement = new KardexMovement({
        id: uuidv4(),
        storeId: dto.storeId,
        ingredientId: ingredient.id,
        ingredientCode: ingredient.code,
        ingredientName: ingredient.name,
        type: 'PHYSICAL_INVENTORY_ADJUSTMENT',
        documentReference: 'INVENTARIO_INICIAL',
        quantityChange: initialStock,
        unitCostDec: initialCostDec,
        totalMovementCost: initialTotalValue,
        stockBalanceAfter: initialStock,
        cppAfterDec: initialCostDec,
        totalInventoryValueAfter: initialTotalValue,
        reason: 'Apertura inicial de inventario',
        createdAt: new Date(),
      });
      await this.purchasingRepo.saveKardexMovement(initialMovement);
    }

    this.logger.log(`[INSUMO] Registrado: ${ingredient.name} [${ingredient.code}] - Unidad: ${ingredient.inventoryUnit}`);
    return ingredient;
  }

  /**
   * Recepción de compra / ingreso de mercadería con factura o guía.
   * Ejecuta conversión de unidades, recálculo exacto de CPP y asiento en Kardex.
   */
  public async receivePurchaseOrder(dto: ReceivePurchaseOrderDto): Promise<PurchaseOrder> {
    const supplier = await this.purchasingRepo.findSupplierById(dto.supplierId);
    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID "${dto.supplierId}" no encontrado.`);
    }

    const receptionDate = dto.receptionDate ?? new Date();
    const purchaseOrderId = uuidv4();
    const orderItems: PurchaseOrderItem[] = [];

    let orderTotalCost = Money.zero('PEN');

    for (const itemInput of dto.items) {
      const ingredient = await this.purchasingRepo.findIngredientById(itemInput.ingredientId);
      if (!ingredient) {
        throw new NotFoundException(`Insumo con ID "${itemInput.ingredientId}" no encontrado.`);
      }

      // 1. Conversión de unidades de compra a unidad base
      const conversionRule = UnitConverter.getRule(itemInput.purchaseUnit);
      const totalBaseUnits = UnitConverter.convertToBaseUnits(
        itemInput.purchaseUnit,
        itemInput.packagesCount,
        ingredient.inventoryUnit,
      );

      // 2. Costeo de la línea
      const unitCostPerPackage = Money.fromDecimal(itemInput.costPerPackageDecimal, 'PEN');
      const totalLineCost = unitCostPerPackage.multiply(itemInput.packagesCount);
      const costPerBaseUnitDec = Number((totalLineCost.toDecimal() / totalBaseUnits).toFixed(6));

      orderTotalCost = orderTotalCost.add(totalLineCost);

      // 3. Recálculo del Costo Promedio Ponderado (CPP) en la entidad
      const previousStock = ingredient.currentStock;
      const newCpp = ingredient.applyPurchaseEntry(totalBaseUnits, costPerBaseUnitDec, receptionDate);
      await this.purchasingRepo.saveIngredient(ingredient);

      // 4. Crear ítem de orden de compra
      const orderItem = new PurchaseOrderItem({
        id: uuidv4(),
        purchaseOrderId,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        purchaseUnit: itemInput.purchaseUnit,
        packagesCount: itemInput.packagesCount,
        conversionFactor: conversionRule.factor,
        totalBaseUnits,
        unitCostPerPackage,
        totalLineCost,
        costPerBaseUnitDec,
      });
      orderItems.push(orderItem);

      // 5. Registrar movimiento en Kardex
      const totalValuationAfter = ingredient.getTotalInventoryValue();
      const kardexMovement = new KardexMovement({
        id: uuidv4(),
        storeId: dto.storeId,
        ingredientId: ingredient.id,
        ingredientCode: ingredient.code,
        ingredientName: ingredient.name,
        type: 'PURCHASE_RECEIPT',
        documentReference: `${dto.documentType} ${dto.documentNumber}`,
        quantityChange: totalBaseUnits,
        unitCostDec: costPerBaseUnitDec,
        totalMovementCost: totalLineCost,
        stockBalanceAfter: ingredient.currentStock,
        cppAfterDec: newCpp,
        totalInventoryValueAfter: totalValuationAfter,
        reason: `Ingreso por compra (${itemInput.packagesCount} ${itemInput.purchaseUnit} a ${supplier.commercialName})`,
        createdAt: receptionDate,
      });
      await this.purchasingRepo.saveKardexMovement(kardexMovement);

      this.logger.log(
        `[KARDEX COMPRA] ${ingredient.name}: Ingresaron ${totalBaseUnits} ${ingredient.inventoryUnit}. Stock: ${previousStock} -> ${ingredient.currentStock}. Nuevo CPP: S/ ${newCpp.toFixed(4)}/${ingredient.inventoryUnit}`,
      );
    }

    // 6. Desglose tributario de la orden de compra
    let subtotal: Money;
    let taxAmount: Money;

    if (dto.documentType === 'FACTURA') {
      // Con factura en Perú, el precio pactado suele ser total con IGV o subtotal + IGV.
      // Modelamos subtotal = total / 1.18 y taxAmount = total - subtotal
      const totalCents = orderTotalCost.toCents();
      const subtotalCents = Math.round(totalCents / 1.18);
      const taxCents = totalCents - subtotalCents;
      subtotal = Money.fromCents(subtotalCents, 'PEN');
      taxAmount = Money.fromCents(taxCents, 'PEN');
    } else {
      subtotal = orderTotalCost;
      taxAmount = Money.zero('PEN');
    }

    const purchaseOrder = new PurchaseOrder({
      id: purchaseOrderId,
      storeId: dto.storeId,
      supplierId: supplier.id,
      supplierName: supplier.commercialName,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      receptionDate,
      status: 'RECEIVED',
      items: orderItems,
      subtotal,
      taxAmount,
      total: orderTotalCost,
      receivedByUserId: dto.receivedByUserId,
      notes: dto.notes,
      createdAt: new Date(),
    });

    await this.purchasingRepo.savePurchaseOrder(purchaseOrder);

    // 7. Emitir evento de dominio a Outbox
    const purchaseEvent: DomainEvent<{
      purchaseOrderId: string;
      supplierId: string;
      documentNumber: string;
      totalCost: number;
      itemCount: number;
    }> = {
      eventId: uuidv4(),
      eventType: 'purchase.received.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: dto.storeId,
      correlationId: `purchase-${purchaseOrder.id}`,
      actor: { userId: dto.receivedByUserId },
      payload: {
        purchaseOrderId: purchaseOrder.id,
        supplierId: supplier.id,
        documentNumber: purchaseOrder.documentNumber,
        totalCost: purchaseOrder.total.toDecimal(),
        itemCount: purchaseOrder.items.length,
      },
    };
    await this.outboxWriter.write(purchaseEvent);

    return purchaseOrder;
  }

  /**
   * Realiza un ajuste de inventario físico (toma de inventario en barra).
   * Registra el descuadre y actualiza el Kardex al CPP vigente.
   */
  public async adjustPhysicalStock(dto: AdjustPhysicalStockDto): Promise<KardexMovement> {
    const ingredient = await this.purchasingRepo.findIngredientById(dto.ingredientId);
    if (!ingredient) {
      throw new NotFoundException(`Insumo con ID "${dto.ingredientId}" no encontrado.`);
    }

    const stockBefore = ingredient.currentStock;
    const diff = ingredient.adjustStock(dto.physicalCount);
    await this.purchasingRepo.saveIngredient(ingredient);

    const movementCost = Money.fromDecimal(Math.abs(diff) * ingredient.currentAverageCostDec, 'PEN');
    const totalValuationAfter = ingredient.getTotalInventoryValue();

    const movement = new KardexMovement({
      id: uuidv4(),
      storeId: dto.storeId,
      ingredientId: ingredient.id,
      ingredientCode: ingredient.code,
      ingredientName: ingredient.name,
      type: 'PHYSICAL_INVENTORY_ADJUSTMENT',
      documentReference: 'TOMA_FISICA',
      quantityChange: diff,
      unitCostDec: ingredient.currentAverageCostDec,
      totalMovementCost: movementCost,
      stockBalanceAfter: ingredient.currentStock,
      cppAfterDec: ingredient.currentAverageCostDec,
      totalInventoryValueAfter: totalValuationAfter,
      reason: dto.reason || (diff < 0 ? 'Faltante de inventario físico' : 'Sobrante de inventario físico'),
      createdAt: new Date(),
    });

    await this.purchasingRepo.saveKardexMovement(movement);

    // Emitir evento outbox
    const adjustEvent: DomainEvent<{
      ingredientId: string;
      ingredientCode: string;
      diffQuantity: number;
      newStock: number;
      reason: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'ingredient.stock_adjusted.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: dto.storeId,
      correlationId: `adjust-${ingredient.id}-${movement.id}`,
      actor: { userId: dto.adjustedByUserId },
      payload: {
        ingredientId: ingredient.id,
        ingredientCode: ingredient.code,
        diffQuantity: diff,
        newStock: ingredient.currentStock,
        reason: dto.reason,
      },
    };
    await this.outboxWriter.write(adjustEvent);

    this.logger.log(
      `[AJUSTE FISICO] ${ingredient.name}: Stock teórico ${stockBefore} -> Conteo físico ${ingredient.currentStock} (Diferencia: ${diff})`,
    );

    return movement;
  }

  /**
   * Consulta el historial de Kardex de un insumo específico.
   */
  public async getIngredientKardex(ingredientId: string): Promise<KardexMovement[]> {
    return this.purchasingRepo.findKardexByIngredient(ingredientId);
  }

  /**
   * Genera el Reporte de Inventario Valorizado consolidado de la tienda.
   */
  public async getValuedInventoryReport(storeId: string): Promise<ValuedInventoryReportDto> {
    const ingredients = await this.purchasingRepo.findAllIngredients(storeId);

    let totalValuation = 0;
    const items: ValuedInventoryItemDto[] = [];

    for (const ing of ingredients) {
      const valDec = ing.getTotalInventoryValue().toDecimal();
      totalValuation += valDec;

      items.push({
        ingredientId: ing.id,
        code: ing.code,
        name: ing.name,
        category: ing.category,
        inventoryUnit: ing.inventoryUnit,
        currentStock: ing.currentStock,
        minStockAlert: ing.minStockAlert,
        isLowStock: ing.isLowStock(),
        isOutOfStock: ing.isOutOfStock(),
        averageUnitCostDec: ing.currentAverageCostDec,
        totalValuation: Number(valDec.toFixed(2)),
      });
    }

    return {
      storeId,
      date: new Date().toISOString().split('T')[0],
      totalItemsCount: items.length,
      totalValuation: Number(totalValuation.toFixed(2)),
      items,
    };
  }

  // -------------------------------------------------------------
  // Implementación de IngredientStockPort (para Pasos 11 y 12)
  // -------------------------------------------------------------

  public async getIngredientStock(storeId: string, ingredientId: string): Promise<number> {
    const ingredient = await this.purchasingRepo.findIngredientById(ingredientId);
    return ingredient ? ingredient.currentStock : 0;
  }

  public async deductRecipeIngredients(
    storeId: string,
    deductions: IngredientDeductionInput[],
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    for (const item of deductions) {
      const ingredient = await this.purchasingRepo.findIngredientById(item.ingredientId);
      if (!ingredient) continue;

      ingredient.deductStock(item.quantityUnits);
      await this.purchasingRepo.saveIngredient(ingredient);

      const movementCost = Money.fromDecimal(item.quantityUnits * ingredient.currentAverageCostDec, 'PEN');
      const movement = new KardexMovement({
        id: uuidv4(),
        storeId,
        ingredientId: ingredient.id,
        ingredientCode: ingredient.code,
        ingredientName: ingredient.name,
        type: 'RECIPE_CONSUMPTION',
        documentReference: `Orden #${orderNumber}`,
        quantityChange: -item.quantityUnits,
        unitCostDec: ingredient.currentAverageCostDec,
        totalMovementCost: movementCost,
        stockBalanceAfter: ingredient.currentStock,
        cppAfterDec: ingredient.currentAverageCostDec,
        totalInventoryValueAfter: ingredient.getTotalInventoryValue(),
        reason: `Consumo por receta en comanda #${orderNumber}`,
        createdAt: new Date(),
      });
      await this.purchasingRepo.saveKardexMovement(movement);
    }
  }

  public async getIngredientInfo(storeId: string, ingredientId: string): Promise<IngredientInfo | null> {
    const ingredient = await this.purchasingRepo.findIngredientById(ingredientId);
    if (!ingredient) return null;
    return {
      id: ingredient.id,
      code: ingredient.code,
      name: ingredient.name,
      inventoryUnit: ingredient.inventoryUnit,
      currentStock: ingredient.currentStock,
      currentAverageCostDec: ingredient.currentAverageCostDec,
    };
  }

  public async recordWasteOrCalibration(
    storeId: string,
    ingredientId: string,
    quantityUnits: number,
    type: 'WASTE_DISPOSAL' | 'GRINDER_CALIBRATION',
    reason: string,
    userId: string,
    documentReference?: string,
  ): Promise<WasteDeductionResult> {
    const ingredient = await this.purchasingRepo.findIngredientById(ingredientId);
    if (!ingredient) {
      throw new NotFoundException(`Insumo con ID "${ingredientId}" no encontrado.`);
    }

    ingredient.deductStock(quantityUnits);
    await this.purchasingRepo.saveIngredient(ingredient);

    const movementCost = Money.fromDecimal(quantityUnits * ingredient.currentAverageCostDec, 'PEN');
    const movementId = uuidv4();
    const docRef =
      documentReference || (type === 'GRINDER_CALIBRATION' ? 'CALIBRACION_MOLINO' : 'MERMA_OPERATIVA');

    const movement = new KardexMovement({
      id: movementId,
      storeId,
      ingredientId: ingredient.id,
      ingredientCode: ingredient.code,
      ingredientName: ingredient.name,
      type,
      documentReference: docRef,
      quantityChange: -quantityUnits,
      unitCostDec: ingredient.currentAverageCostDec,
      totalMovementCost: movementCost,
      stockBalanceAfter: ingredient.currentStock,
      cppAfterDec: ingredient.currentAverageCostDec,
      totalInventoryValueAfter: ingredient.getTotalInventoryValue(),
      reason,
      createdAt: new Date(),
    });
    await this.purchasingRepo.saveKardexMovement(movement);

    return {
      movementId,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantityUnits,
      unitCostDec: ingredient.currentAverageCostDec,
      totalCost: movementCost,
      stockBalanceAfter: ingredient.currentStock,
    };
  }

  public async deductProductionIngredients(
    storeId: string,
    deductions: IngredientDeductionInput[],
    batchId: string,
    batchNumber: string,
    bakerUserId: string,
  ): Promise<WasteDeductionResult[]> {
    const results: WasteDeductionResult[] = [];

    for (const item of deductions) {
      const ingredient = await this.purchasingRepo.findIngredientById(item.ingredientId);
      if (!ingredient) {
        throw new NotFoundException(`Insumo con ID "${item.ingredientId}" no encontrado para producción.`);
      }

      ingredient.deductStock(item.quantityUnits);
      await this.purchasingRepo.saveIngredient(ingredient);

      const movementCost = Money.fromDecimal(item.quantityUnits * ingredient.currentAverageCostDec, 'PEN');
      const movementId = uuidv4();
      const movement = new KardexMovement({
        id: movementId,
        storeId,
        ingredientId: ingredient.id,
        ingredientCode: ingredient.code,
        ingredientName: ingredient.name,
        type: 'PRODUCTION_CONSUMPTION',
        documentReference: `Lote #${batchNumber}`,
        quantityChange: -item.quantityUnits,
        unitCostDec: ingredient.currentAverageCostDec,
        totalMovementCost: movementCost,
        stockBalanceAfter: ingredient.currentStock,
        cppAfterDec: ingredient.currentAverageCostDec,
        totalInventoryValueAfter: ingredient.getTotalInventoryValue(),
        reason: `Consumo de insumos para lote de obrador #${batchNumber}`,
        createdAt: new Date(),
      });

      await this.purchasingRepo.saveKardexMovement(movement);

      results.push({
        movementId,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        quantityUnits: item.quantityUnits,
        unitCostDec: ingredient.currentAverageCostDec,
        totalCost: movementCost,
        stockBalanceAfter: ingredient.currentStock,
      });
    }

    return results;
  }
}
