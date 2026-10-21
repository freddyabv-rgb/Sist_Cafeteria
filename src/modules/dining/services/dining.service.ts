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
import { buildPreBillReceipt } from '@platform/print-bridge/ticket-template';
import { CatalogService } from '@modules/catalog/services/catalog.service';
import { PricingService } from '@modules/catalog/services/pricing.service';
import { SalesService } from '@modules/sales/services/sales.service';
import { IDiningRepository } from '../domain/dining.repository.interface';
import { DiningTable } from '../domain/dining-table.entity';
import { DiningTab, TabItem, TabItemModifier } from '../domain/dining-tab.entity';
import {
  CreateTableDto,
  OpenTableTabDto,
  AddRoundToTabDto,
  TransferTabDto,
  MergeTablesDto,
  RequestBillDto,
  SplitEqualResult,
  SplitByItemsResult,
  CloseAndPayTabDto,
} from '../api/dining.dto';

@Injectable()
export class DiningService {
  private readonly logger = new Logger(DiningService.name);

  constructor(
    @Inject('DINING_REPOSITORY')
    private readonly diningRepo: IDiningRepository,
    private readonly catalogService: CatalogService,
    private readonly pricingService: PricingService,
    private readonly salesService: SalesService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crea una nueva mesa física en la zona especificada del salón.
   */
  public async createTable(dto: CreateTableDto): Promise<DiningTable> {
    const existing = await this.diningRepo.findTableByNumber(dto.storeId, dto.tableNumber);
    if (existing) {
      throw new BadRequestException(
        `Ya existe una mesa con el identificador "${dto.tableNumber}" en esta tienda.`,
      );
    }

    const table = new DiningTable({
      id: uuidv4(),
      storeId: dto.storeId,
      tableNumber: dto.tableNumber.toUpperCase(),
      zone: dto.zone,
      capacity: dto.capacity,
      status: 'AVAILABLE',
      isActive: true,
    });

    await this.diningRepo.saveTable(table);
    this.logger.log(`[SALÓN] Mesa creada: ${table.tableNumber} (${table.zone}) - Capacidad: ${table.capacity}`);
    return table;
  }

  /**
   * Abre una nueva cuenta de mesa (comanda de salón).
   * Cambia el estado de la mesa a OCCUPIED y emite table.opened.v1.
   */
  public async openTableTab(dto: OpenTableTabDto): Promise<DiningTab> {
    const table = await this.diningRepo.findTableById(dto.tableId);
    if (!table) {
      throw new NotFoundException(`Mesa con ID "${dto.tableId}" no encontrada.`);
    }

    if (table.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `La mesa "${table.tableNumber}" no está disponible (Estado actual: ${table.status}).`,
      );
    }

    const activeTab = await this.diningRepo.findActiveTabByTableId(table.id);
    if (activeTab) {
      throw new BadRequestException(
        `La mesa "${table.tableNumber}" ya tiene una comanda abierta (#${activeTab.tabNumber}).`,
      );
    }

    const tabId = uuidv4();
    const shortCode = Date.now().toString().slice(-4);
    const tabNumber = `TAB-${table.tableNumber}-${shortCode}`;

    const tab = new DiningTab({
      id: tabId,
      storeId: dto.storeId,
      tabNumber,
      tableId: table.id,
      tableNumber: table.tableNumber,
      waiterUserId: dto.waiterUserId,
      waiterName: dto.waiterName,
      customerName: dto.customerName,
      paxCount: dto.paxCount > 0 ? dto.paxCount : 1,
      status: 'OPEN',
      items: [],
      openedAt: new Date(),
    });

    table.occupy(tab.id);

    await this.diningRepo.saveTab(tab);
    await this.diningRepo.saveTable(table);

    // Evento de apertura
    const openEvent: DomainEvent<{
      tabId: string;
      tabNumber: string;
      tableId: string;
      tableNumber: string;
      waiterUserId: string;
      waiterName: string;
      paxCount: number;
    }> = {
      eventId: uuidv4(),
      eventType: 'table.opened.v1',
      schemaVersion: 1,
      occurredAt: tab.openedAt.toISOString(),
      storeId: dto.storeId,
      correlationId: `tab-${tabId}`,
      actor: { userId: dto.waiterUserId },
      payload: {
        tabId: tab.id,
        tabNumber: tab.tabNumber,
        tableId: table.id,
        tableNumber: table.tableNumber,
        waiterUserId: tab.waiterUserId,
        waiterName: tab.waiterName,
        paxCount: tab.paxCount,
      },
    };

    await this.outboxWriter.write(openEvent);
    this.logger.log(`[SALÓN] Mesa ${table.tableNumber} abierta por ${tab.waiterName} (#${tab.tabNumber})`);

    return tab;
  }

  /**
   * Agrega una nueva ronda de pedidos a la cuenta de la mesa.
   * Resuelve precios, estación de preparación (BARRA, COCINA, VITRINA) y emite table.round_ordered.v1.
   */
  public async addRoundToTab(dto: AddRoundToTabDto): Promise<DiningTab> {
    const tab = await this.diningRepo.findTabById(dto.tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${dto.tabId}" no encontrada.`);
    }

    if (tab.status === 'CLOSED' || tab.status === 'CANCELLED') {
      throw new BadRequestException(`No se pueden añadir productos a una comanda cerrada o cancelada.`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Debe incluir al menos un producto en la ronda.');
    }

    const nextRoundNumber = tab.currentRoundNumber + 1;
    const newItems: TabItem[] = [];

    for (const itemInput of dto.items) {
      if (itemInput.quantity <= 0) {
        throw new BadRequestException('La cantidad de cada ítem debe ser mayor a cero.');
      }

      const product = await this.catalogService.getProductById(dto.storeId, itemInput.productId);
      const variant = product.variants.find((v) => v.id === itemInput.variantId);
      if (!variant) {
        throw new NotFoundException(`Variante "${itemInput.variantId}" no encontrada en el catálogo.`);
      }

      // Resolver modificadores seleccionados
      const itemModifiers: TabItemModifier[] = [];
      const pricingModifiers: Array<{ optionId: string; quantity: number }> = [];

      if (itemInput.modifiers) {
        for (const mInput of itemInput.modifiers) {
          let foundOption: any = null;
          for (const grp of product.modifierGroups) {
            const opt = grp.options.find((o) => o.id === mInput.modifierOptionId);
            if (opt) {
              foundOption = opt;
              break;
            }
          }

          if (foundOption) {
            itemModifiers.push({
              modifierOptionId: foundOption.id,
              name: foundOption.name,
              quantity: mInput.quantity,
              priceDelta: foundOption.priceDelta,
            });
            pricingModifiers.push({
              optionId: foundOption.id,
              quantity: mInput.quantity,
            });
          }
        }
      }

      const priceResult = this.pricingService.calculateItemPrice({
        basePrice: variant.price,
        quantity: itemInput.quantity,
        modifiers: pricingModifiers.map((m) => {
          const mod = itemModifiers.find((x) => x.modifierOptionId === m.optionId);
          return { priceDelta: mod!.priceDelta, quantity: m.quantity };
        }),
      });

      const tabItem = new TabItem({
        id: uuidv4(),
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        station: product.prepStation,
        unitPrice: priceResult.unitPrice,
        quantity: itemInput.quantity,
        modifiers: itemModifiers,
        totalPrice: priceResult.totalPrice,
        status: 'ORDERED',
        roundNumber: nextRoundNumber,
        orderedAt: new Date(),
        notes: itemInput.notes,
      });

      newItems.push(tabItem);
    }

    tab.addItems(newItems);
    await this.diningRepo.saveTab(tab);

    // Evento de ronda agregada (comanda para KDS / Barista / Cocina)
    const roundEvent: DomainEvent<{
      tabId: string;
      tabNumber: string;
      tableNumber: string;
      roundNumber: number;
      waiterUserId: string;
      items: Array<{
        productName: string;
        variantName: string;
        station: string;
        quantity: number;
        modifiers: string[];
        notes?: string;
      }>;
    }> = {
      eventId: uuidv4(),
      eventType: 'table.round_ordered.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: dto.storeId,
      correlationId: `tab-${tab.id}-r${nextRoundNumber}`,
      actor: { userId: dto.waiterUserId },
      payload: {
        tabId: tab.id,
        tabNumber: tab.tabNumber,
        tableNumber: tab.tableNumber,
        roundNumber: nextRoundNumber,
        waiterUserId: dto.waiterUserId,
        items: newItems.map((it) => ({
          productName: it.productName,
          variantName: it.variantName,
          station: it.station,
          quantity: it.quantity,
          modifiers: it.modifiers.map((m) => `${m.quantity > 1 ? `${m.quantity}x ` : ''}${m.name}`),
          notes: it.notes,
        })),
      },
    };

    await this.outboxWriter.write(roundEvent);
    this.logger.log(
      `[SALÓN] Mesa ${tab.tableNumber}: Ronda #${nextRoundNumber} enviada a preparación (${newItems.length} ítems)`,
    );

    return tab;
  }

  /**
   * Transfiere una cuenta abierta de una mesa a otra (ej. cambio a terraza).
   */
  public async transferTab(dto: TransferTabDto): Promise<DiningTab> {
    const tab = await this.diningRepo.findTabById(dto.tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${dto.tabId}" no encontrada.`);
    }

    const sourceTable = await this.diningRepo.findTableById(tab.tableId);
    const targetTable = await this.diningRepo.findTableById(dto.targetTableId);

    if (!targetTable) {
      throw new NotFoundException(`Mesa destino con ID "${dto.targetTableId}" no encontrada.`);
    }

    if (targetTable.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `La mesa destino "${targetTable.tableNumber}" no está disponible (Estado: ${targetTable.status}).`,
      );
    }

    const oldTableNumber = tab.tableNumber;
    sourceTable?.release();
    targetTable.occupy(tab.id);
    tab.transferToTable(targetTable.id, targetTable.tableNumber);

    if (sourceTable) await this.diningRepo.saveTable(sourceTable);
    await this.diningRepo.saveTable(targetTable);
    await this.diningRepo.saveTab(tab);

    await this.auditService.log({
      storeId: dto.storeId,
      userId: dto.transferredByUserId,
      action: 'TABLE_TRANSFERRED',
      entity: 'DINING_TAB',
      entityId: tab.id,
      beforeState: { tableNumber: oldTableNumber },
      afterState: { tableNumber: targetTable.tableNumber, reason: dto.reason },
    });

    const transferEvent: DomainEvent<{
      tabId: string;
      fromTableNumber: string;
      toTableNumber: string;
      waiterUserId: string;
      reason?: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'table.transferred.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: dto.storeId,
      correlationId: `tab-${tab.id}`,
      actor: { userId: dto.transferredByUserId },
      payload: {
        tabId: tab.id,
        fromTableNumber: oldTableNumber,
        toTableNumber: targetTable.tableNumber,
        waiterUserId: dto.transferredByUserId,
        reason: dto.reason,
      },
    };

    await this.outboxWriter.write(transferEvent);
    this.logger.log(`[SALÓN] Comanda #${tab.tabNumber} transferida de Mesa ${oldTableNumber} a Mesa ${targetTable.tableNumber}`);

    return tab;
  }

  /**
   * Fusiona dos mesas físicas contiguas para atención de grupos grandes.
   */
  public async mergeTables(dto: MergeTablesDto): Promise<{ primaryTab: DiningTab; secondaryTable: DiningTable }> {
    const primaryTable = await this.diningRepo.findTableById(dto.primaryTableId);
    const secondaryTable = await this.diningRepo.findTableById(dto.secondaryTableId);

    if (!primaryTable || !secondaryTable) {
      throw new NotFoundException('Una o ambas mesas especificadas no existen.');
    }

    const primaryTab = await this.diningRepo.findActiveTabByTableId(primaryTable.id);
    if (!primaryTab) {
      throw new BadRequestException(`La mesa principal "${primaryTable.tableNumber}" debe tener una comanda abierta.`);
    }

    // Si la mesa secundaria tenía ítems, se transfieren a la comanda principal
    const secondaryTab = await this.diningRepo.findActiveTabByTableId(secondaryTable.id);
    if (secondaryTab) {
      primaryTab.addItems(secondaryTab.activeItems);
      secondaryTab.close('MERGED');
      await this.diningRepo.saveTab(secondaryTab);
    }

    secondaryTable.mergeInto(primaryTable.id);

    await this.diningRepo.saveTable(secondaryTable);
    await this.diningRepo.saveTab(primaryTab);

    await this.auditService.log({
      storeId: dto.storeId,
      userId: dto.mergedByUserId,
      action: 'TABLES_MERGED',
      entity: 'DINING_TABLE',
      entityId: primaryTable.id,
      afterState: {
        primaryTableNumber: primaryTable.tableNumber,
        secondaryTableNumber: secondaryTable.tableNumber,
      },
    });

    return { primaryTab, secondaryTable };
  }

  /**
   * Genera el buffer ESC/POS para la impresión de la Pre-cuenta de mesa (Xprinter XP-80T).
   * Cambia el estado de la mesa a BILL_PRINTED y calcula sugerencia de propina voluntaria 10%.
   */
  public async printPreBill(dto: RequestBillDto): Promise<{ tab: DiningTab; printBuffer: Buffer }> {
    const tab = await this.diningRepo.findTabById(dto.tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${dto.tabId}" no encontrada.`);
    }

    if (tab.activeItems.length === 0) {
      throw new BadRequestException('La mesa no tiene consumos registrados para imprimir pre-cuenta.');
    }

    const table = await this.diningRepo.findTableById(tab.tableId);
    tab.requestBill();
    table?.markBillPrinted();

    if (table) await this.diningRepo.saveTable(table);
    await this.diningRepo.saveTab(tab);

    const totalDec = tab.calculateTotal().toDecimal();
    const subtotalDec = tab.calculateSubtotal().toDecimal();
    const taxDec = tab.calculateTax().toDecimal();
    const tip10Dec = Math.round(totalDec * 0.1 * 100) / 100;
    const totalWithTipDec = Number((totalDec + tip10Dec).toFixed(2));

    const printBuffer = buildPreBillReceipt({
      tableNumber: tab.tableNumber,
      tabNumber: tab.tabNumber,
      dateStr: new Date().toLocaleDateString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      waiterName: tab.waiterName,
      customerName: tab.customerName,
      paxCount: tab.paxCount,
      items: tab.activeItems.map((it) => ({
        name: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toDecimal(),
        totalPrice: it.totalPrice.toDecimal(),
        modifiers: it.modifiers.map((m) => `${m.quantity > 1 ? `${m.quantity}x ` : ''}${m.name}`),
      })),
      subtotal: subtotalDec,
      taxIgv: taxDec,
      total: totalDec,
      suggestedTip10: tip10Dec,
      totalWithTip: totalWithTipDec,
    });

    this.logger.log(`[SALÓN] Pre-cuenta emitida para Mesa ${tab.tableNumber} (Total: S/ ${totalDec.toFixed(2)})`);

    return { tab, printBuffer };
  }

  /**
   * Cálculo de división de cuenta equitativa (Split Equal entre N comensales).
   */
  public async splitCheckEqual(tabId: string, numberOfSplits: number): Promise<SplitEqualResult> {
    const tab = await this.diningRepo.findTabById(tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${tabId}" no encontrada.`);
    }

    if (numberOfSplits < 2) {
      throw new BadRequestException('La división equitativa debe ser entre 2 o más personas.');
    }

    const totalGross = tab.calculateTotal().toDecimal();
    const amountPerPerson = Number((totalGross / numberOfSplits).toFixed(2));

    return {
      tabId,
      totalGross,
      numberOfSplits,
      amountPerPerson,
      remainingAmount: totalGross,
    };
  }

  /**
   * Cálculo de división de cuenta por ítems seleccionados.
   */
  public async splitCheckByItems(tabId: string, selectedItemIds: string[]): Promise<SplitByItemsResult> {
    const tab = await this.diningRepo.findTabById(tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${tabId}" no encontrada.`);
    }

    let selectedTotal = Money.zero('PEN');
    let selectedCount = 0;
    let remainingTotal = Money.zero('PEN');
    let remainingCount = 0;

    for (const it of tab.activeItems) {
      if (selectedItemIds.includes(it.id)) {
        selectedTotal = selectedTotal.add(it.totalPrice);
        selectedCount += it.quantity;
      } else {
        remainingTotal = remainingTotal.add(it.totalPrice);
        remainingCount += it.quantity;
      }
    }

    return {
      tabId,
      selectedItemsTotal: selectedTotal.toDecimal(),
      remainingItemsTotal: remainingTotal.toDecimal(),
      selectedItemsCount: selectedCount,
      remainingItemsCount: remainingCount,
    };
  }

  /**
   * Cierra y cobra la cuenta de la mesa en el POS a través de SalesService.
   * Libera automáticamente la mesa física (AVAILABLE), asienta pagos y emite order.paid.v1.
   */
  public async closeAndPayTab(dto: CloseAndPayTabDto): Promise<{ tab: DiningTab; order: any }> {
    const tab = await this.diningRepo.findTabById(dto.tabId);
    if (!tab) {
      throw new NotFoundException(`Comanda con ID "${dto.tabId}" no encontrada.`);
    }

    if (tab.activeItems.length === 0) {
      throw new BadRequestException('No hay consumos activos para cobrar en esta mesa.');
    }

    const table = await this.diningRepo.findTableById(tab.tableId);

    // Mapear consumos de mesa a ítems de comanda de venta POS
    const salesItems = tab.activeItems.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
      notes: it.notes,
      modifiers: it.modifiers.map((m) => ({
        modifierOptionId: m.modifierOptionId,
        quantity: m.quantity,
      })),
    }));

    // Cobrar la orden formalmente en SalesService con modalidad DINE_IN
    const order = await this.salesService.createAndPayOrder({
      storeId: dto.storeId,
      registerId: dto.registerId,
      registerCode: dto.registerCode || 'C1',
      cashierUserId: dto.cashierUserId,
      cashierName: dto.cashierName,
      orderType: 'DINE_IN',
      customerName: tab.customerName || `Mesa ${tab.tableNumber}`,
      idempotencyKey: dto.idempotencyKey,
      items: salesItems,
      payments: dto.payments,
      discount: dto.discount,
    });

    // Cerrar la comanda de salón y liberar la mesa física
    tab.close(order.id);
    table?.release();

    if (table) await this.diningRepo.saveTable(table);
    await this.diningRepo.saveTab(tab);

    this.logger.log(
      `[SALÓN] Mesa ${tab.tableNumber} cobrada exitosamente (Orden #${order.orderNumber}). Mesa liberada.`,
    );

    return { tab, order };
  }
}
