import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@shared/types/money';
import { DomainEvent } from '@shared/types/domain-event';
import { OutboxWriterService } from '@platform/outbox/outbox-writer.service';
import { PrintBridgeService } from '@platform/print-bridge/print-bridge.service';
import { AuthService } from '@platform/auth/auth.service';
import { AuditService } from '@platform/audit/audit.service';
import { CatalogService } from '@modules/catalog/services/catalog.service';
import { PricingService, SelectedModifierInput } from '@modules/catalog/services/pricing.service';
import { CashShiftPort } from '@modules/cash/api/cash-shift.port';
import { ISalesRepository } from '../infra/sales.repository.interface';
import { Order } from '../domain/order.entity';
import { OrderItem, OrderItemModifier } from '../domain/order-item.entity';
import { Payment } from '../domain/payment.entity';
import { CreateOrderCommand, VoidOrderCommand, RefundOrderItemCommand } from '../api/create-order.dto';
import { CreateCashOrderCommand } from '../api/create-cash-order.dto';

@Injectable()
export class SalesService {
  constructor(
    @Inject('SALES_REPOSITORY')
    private readonly salesRepo: ISalesRepository,
    @Inject('CASH_SHIFT_PORT')
    private readonly cashShiftPort: CashShiftPort,
    private readonly catalogService: CatalogService,
    private readonly pricingService: PricingService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly printBridge: PrintBridgeService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Cobro multi-medio completo con soporte de descuentos y cortesías.
   */
  public async createAndPayOrder(command: CreateOrderCommand): Promise<Order> {
    const existingOrder = await this.salesRepo.findOrderByIdempotencyKey(command.idempotencyKey);
    if (existingOrder) {
      return existingOrder;
    }

    const activeShift = await this.cashShiftPort.assertActiveShift(
      command.storeId,
      command.registerId,
    );

    if (!command.items || command.items.length === 0) {
      throw new BadRequestException('El pedido debe incluir al menos un producto.');
    }

    if (!command.payments || command.payments.length === 0) {
      throw new BadRequestException('El pedido debe incluir al menos un medio de pago.');
    }

    const orderId = uuidv4();
    const orderItems: OrderItem[] = [];

    let itemsGrossTotal = Money.zero('PEN');

    // Procesar cada ítem del catálogo
    for (const itemInput of command.items) {
      const product = await this.catalogService.getProductById(itemInput.productId);
      if (!product) {
        throw new NotFoundException(`Producto ${itemInput.productId} no encontrado.`);
      }

      if (!product.isAvailable) {
        throw new BadRequestException(`El producto "${product.name}" está marcado como Agotado.`);
      }

      const variant = product.getVariant(itemInput.variantId);
      if (!variant) {
        throw new NotFoundException(
          `Variante ${itemInput.variantId} no encontrada para el producto "${product.name}".`,
        );
      }

      const selectedModsInput: SelectedModifierInput[] = [];
      if (itemInput.modifiers && itemInput.modifiers.length > 0) {
        for (const modInput of itemInput.modifiers) {
          let foundOption = null;
          let foundGroupName = '';

          for (const group of product.modifierGroups) {
            const opt = group.options.find((o) => o.id === modInput.modifierOptionId);
            if (opt) {
              foundOption = opt;
              foundGroupName = group.name;
              break;
            }
          }

          if (!foundOption) {
            throw new BadRequestException(
              `Modificador ${modInput.modifierOptionId} no válido para "${product.name}".`,
            );
          }

          selectedModsInput.push({
            option: foundOption,
            groupName: foundGroupName,
            quantity: modInput.quantity || 1,
          });
        }
      }

      const calculated = this.pricingService.calculateItem(
        variant,
        selectedModsInput,
        itemInput.quantity,
        product.taxCode === 'IGV_GRAVADO',
      );

      const orderItemId = uuidv4();
      const itemModifiers: OrderItemModifier[] = calculated.modifiersSnapshot.map((modSnap) => {
        return new OrderItemModifier({
          id: uuidv4(),
          orderItemId,
          modifierOptionId: modSnap.modifierOptionId,
          groupName: modSnap.groupName,
          optionName: modSnap.optionName,
          quantity: modSnap.quantity,
          priceDelta: Money.fromDecimal(modSnap.priceDelta, 'PEN'),
          highlightKds: modSnap.highlightKds,
        });
      });

      const orderItem = new OrderItem({
        id: orderItemId,
        orderId,
        productVariantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        station: product.prepStation,
        trackingMode: product.trackingMode,
        status: 'PENDING',
        quantity: itemInput.quantity,
        unitPrice: calculated.unitPrice,
        discountAmount: Money.zero('PEN'),
        taxCode: product.taxCode,
        taxAmount: calculated.taxAmount,
        totalPrice: calculated.totalPrice,
        notes: itemInput.notes,
        modifiers: itemModifiers,
      });

      orderItems.push(orderItem);
      itemsGrossTotal = itemsGrossTotal.add(calculated.totalPrice);
    }

    // Aplicar descuento comercial o cortesía si fue especificado
    let discountTotal = Money.zero('PEN');
    if (command.discount) {
      const d = command.discount;
      if (d.type === 'COURTESY_100') {
        discountTotal = itemsGrossTotal;
      } else if (d.type === 'PERCENTAGE') {
        const percent = Math.min(Math.max(d.value, 0), 100);
        discountTotal = itemsGrossTotal.multiply(percent / 100);
      } else if (d.type === 'FIXED') {
        discountTotal = Money.fromDecimal(Math.min(d.value, itemsGrossTotal.toDecimal()), 'PEN');
      }

      // Si el descuento supera el 10% o es cortesía, exigir autorización de supervisor por PIN
      const discountPercentage = (discountTotal.toDecimal() / itemsGrossTotal.toDecimal()) * 100;
      if (discountPercentage > 10 || d.type === 'COURTESY_100') {
        if (!d.supervisorPin) {
          throw new BadRequestException('Descuentos mayores al 10% requieren PIN de supervisor.');
        }
        const supervisor = this.authService.authorizeSupervisorAction(command.storeId, d.supervisorPin);
        await this.auditService.log({
          storeId: command.storeId,
          userId: supervisor.id,
          action: 'DISCOUNT_APPLIED',
          entity: 'ORDER',
          entityId: orderId,
          afterState: {
            discountType: d.type,
            discountValue: d.value,
            reason: d.reason,
            discountTotal: discountTotal.toDecimal(),
          },
        });
      }
    }

    const netTotal = itemsGrossTotal.subtract(discountTotal);

    // Desglose tributario del total neto
    const totalDecimal = netTotal.toDecimal();
    const subtotalDecimal = Math.round((totalDecimal / 1.18) * 100) / 100;
    const taxDecimal = Math.round((totalDecimal - subtotalDecimal) * 100) / 100;

    const orderSubtotal = Money.fromDecimal(subtotalDecimal, 'PEN');
    const orderTax = Money.fromDecimal(taxDecimal, 'PEN');
    const orderTotal = netTotal;

    // Procesar pagos
    let paymentsAmountSum = Money.zero('PEN');
    let orderTipTotal = Money.zero('PEN');
    let hasCashPayment = false;
    const paymentEntities: Payment[] = [];

    // Si es cortesía 100%, generar pago de cortesía automático
    if (orderTotal.toCents() === 0) {
      paymentEntities.push(
        new Payment({
          id: uuidv4(),
          orderId,
          idempotencyKey: `pay-${command.idempotencyKey}-courtesy`,
          method: 'TRANSFER',
          provider: 'CORTESÍA_BENEVENTO',
          reference: command.discount?.reason || 'CORTESÍA',
          status: 'COMPLETED',
          amount: Money.zero('PEN'),
          tipAmount: Money.zero('PEN'),
          paidAt: new Date(),
        }),
      );
    } else {
      for (let i = 0; i < command.payments.length; i++) {
        const pInput = command.payments[i];
        const pAmount = Money.fromDecimal(pInput.amount, 'PEN');
        const pTip = pInput.tipAmount ? Money.fromDecimal(pInput.tipAmount, 'PEN') : Money.zero('PEN');

        if (pAmount.toCents() <= 0) {
          throw new BadRequestException('El monto de cada pago debe ser mayor a cero.');
        }

        let cashTendered: Money | undefined = undefined;
        let changeDue: Money | undefined = undefined;

        if (pInput.method === 'CASH') {
          hasCashPayment = true;
          const tenderedDec = pInput.cashTendered !== undefined ? pInput.cashTendered : pInput.amount;
          cashTendered = Money.fromDecimal(tenderedDec, 'PEN');

          if (cashTendered.isLessThan(pAmount)) {
            throw new BadRequestException(
              `Efectivo insuficiente. Monto asignado: ${pAmount.format()}, Entregado: ${cashTendered.format()}`,
            );
          }
          changeDue = cashTendered.subtract(pAmount);
        }

        const paymentEntity = new Payment({
          id: uuidv4(),
          orderId,
          idempotencyKey: `pay-${command.idempotencyKey}-${i}`,
          method: pInput.method,
          provider: pInput.provider,
          reference: pInput.reference,
          status: 'COMPLETED',
          amount: pAmount,
          tipAmount: pTip,
          cashTendered,
          changeDue,
          paidAt: new Date(),
        });

        paymentEntities.push(paymentEntity);
        paymentsAmountSum = paymentsAmountSum.add(pAmount);
        orderTipTotal = orderTipTotal.add(pTip);
      }

      if (!paymentsAmountSum.equals(orderTotal)) {
        throw new BadRequestException(
          `La suma de pagos (${paymentsAmountSum.format()}) no coincide con el total neto (${orderTotal.format()}).`,
        );
      }
    }

    const seq = await this.salesRepo.getNextOrderSequence(command.storeId, command.registerId);
    const regCode = command.registerCode || 'C1';
    const orderNumber = `${regCode}-${String(seq).padStart(4, '0')}`;

    const order = new Order({
      id: orderId,
      storeId: command.storeId,
      registerId: command.registerId,
      shiftId: activeShift.shiftId,
      orderNumber,
      idempotencyKey: command.idempotencyKey,
      channel: 'POS',
      orderType: command.orderType,
      paymentStatus: 'PAID',
      status: 'RECEIVED',
      customerName: command.customerName,
      subtotal: orderSubtotal,
      discountTotal,
      taxTotal: orderTax,
      tipTotal: orderTipTotal,
      roundingAdjustment: Money.zero('PEN'),
      total: orderTotal,
      paidAt: paymentEntities[0].paidAt,
      createdAt: new Date(),
      items: orderItems,
      payments: paymentEntities,
    });

    await this.salesRepo.saveOrder(order);

    for (const p of paymentEntities) {
      await this.cashShiftPort.recordPayment(activeShift.shiftId, {
        method: p.method,
        provider: p.provider,
        reference: p.reference,
        amount: p.amount,
        tipAmount: p.tipAmount,
      });
    }

    const orderPaidEvent: DomainEvent<{
      orderId: string;
      orderNumber: string;
      shiftId: string;
      channel: string;
      orderType: string;
      customerName?: string;
      items: Array<{
        orderItemId: string;
        productName: string;
        variantName: string;
        station: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        modifiers: Array<{
          optionName: string;
          quantity: number;
          highlightKds: boolean;
        }>;
      }>;
      payments: Array<{
        method: string;
        provider?: string;
        reference?: string;
        amount: number;
        tipAmount: number;
        cashTendered?: number;
        changeDue?: number;
      }>;
      totals: {
        subtotal: number;
        discount: number;
        tax: number;
        tips: number;
        total: number;
      };
    }> = {
      eventId: uuidv4(),
      eventType: 'order.paid.v1',
      schemaVersion: 1,
      occurredAt: order.paidAt!.toISOString(),
      storeId: order.storeId,
      correlationId: `order-${order.id}`,
      actor: { userId: command.cashierUserId, registerId: order.registerId },
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        shiftId: order.shiftId,
        channel: order.channel,
        orderType: order.orderType,
        customerName: order.customerName,
        items: order.items.map((it) => ({
          orderItemId: it.id,
          variantId: it.productVariantId,
          productVariantId: it.productVariantId,
          productName: it.productName,
          variantName: it.variantName,
          station: it.station,
          trackingMode: it.trackingMode,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toDecimal(),
          totalPrice: it.totalPrice.toDecimal(),
          modifiers: it.modifiers.map((m) => ({
            modifierOptionId: m.modifierOptionId,
            optionName: m.optionName,
            quantity: m.quantity,
            highlightKds: m.highlightKds,
          })),
        })),
        payments: order.payments.map((p) => ({
          method: p.method,
          provider: p.provider,
          reference: p.reference,
          amount: p.amount.toDecimal(),
          tipAmount: p.tipAmount.toDecimal(),
          cashTendered: p.cashTendered?.toDecimal(),
          changeDue: p.changeDue?.toDecimal(),
        })),
        totals: {
          subtotal: order.subtotal.toDecimal(),
          discount: order.discountTotal.toDecimal(),
          tax: order.taxTotal.toDecimal(),
          tips: order.tipTotal.toDecimal(),
          total: order.total.toDecimal(),
        },
      },
    };

    await this.outboxWriter.write(orderPaidEvent);

    const paymentMethodsLabel = order.payments
      .map((p) => `${p.method}${p.provider ? ` (${p.provider})` : ''}: S/ ${p.amount.toDecimal().toFixed(2)}`)
      .join(' + ');

    const cashPayment = order.payments.find((p) => p.method === 'CASH');

    await this.printBridge.printCustomerReceipt(
      {
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        dateStr: order.createdAt.toLocaleString('es-PE'),
        cashierName: command.cashierName || 'Cajero',
        customerName: order.customerName,
        items: order.items.map((it) => ({
          name: it.productName,
          variantName: it.variantName,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toDecimal(),
          totalPrice: it.totalPrice.toDecimal(),
          modifiers: it.modifiers.map((m) =>
            m.quantity > 1 ? `${m.quantity}x ${m.optionName}` : m.optionName,
          ),
        })),
        subtotal: order.subtotal.toDecimal(),
        taxIgv: order.taxTotal.toDecimal(),
        total: order.total.toDecimal(),
        paymentMethod: paymentMethodsLabel,
        cashTendered: cashPayment?.cashTendered?.toDecimal(),
        changeDue: cashPayment?.changeDue?.toDecimal(),
      },
      hasCashPayment,
    );

    return order;
  }

  /**
   * Anulación total de un pedido pagado con autorización de PIN de Supervisor.
   */
  public async voidOrder(command: VoidOrderCommand): Promise<Order> {
    const order = await this.salesRepo.findOrderById(command.orderId);
    if (!order) {
      throw new NotFoundException(`Pedido ${command.orderId} no encontrado.`);
    }

    if (order.status === 'CANCELLED' || order.paymentStatus === 'VOIDED') {
      throw new BadRequestException('El pedido ya se encuentra anulado.');
    }

    if (!command.reason || command.reason.trim().length === 0) {
      throw new BadRequestException('El motivo de anulación es obligatorio.');
    }

    // 1. Autorización estricta por PIN de Supervisor
    const supervisor = this.authService.authorizeSupervisorAction(order.storeId, command.supervisorPin);

    const beforeState = {
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total.toDecimal(),
    };

    // 2. Anular la orden
    order.status = 'CANCELLED';
    order.paymentStatus = 'VOIDED';
    order.voidReason = command.reason;
    order.voidedByUserId = supervisor.id;

    for (const item of order.items) {
      item.status = 'VOIDED';
      item.voidReason = command.reason;
    }

    // 3. Reversar efectivo en caja si la orden tuvo pagos en efectivo
    let cashPaidTotal = Money.zero('PEN');
    for (const p of order.payments) {
      if (p.method === 'CASH' && p.status === 'COMPLETED') {
        cashPaidTotal = cashPaidTotal.add(p.amount);
        p.status = 'VOIDED';
      }
    }

    if (cashPaidTotal.toCents() > 0) {
      await this.cashShiftPort.recordCashRefund(order.shiftId, cashPaidTotal);
    }

    await this.salesRepo.saveOrder(order);

    // 4. Registro inmutable en AUDIT_LOG
    await this.auditService.log({
      storeId: order.storeId,
      userId: supervisor.id,
      action: 'VOID_ORDER',
      entity: 'ORDER',
      entityId: order.id,
      beforeState,
      afterState: {
        status: order.status,
        paymentStatus: order.paymentStatus,
        reason: command.reason,
        refundedCash: cashPaidTotal.toDecimal(),
      },
      deviceInfo: command.deviceInfo,
    });

    // 5. Emitir evento de compensación 'order.voided.v1' al Transactional Outbox
    const voidEvent: DomainEvent<{
      orderId: string;
      orderNumber: string;
      reason: string;
      approvedByUserId: string;
      totalVoidedAmount: number;
    }> = {
      eventId: uuidv4(),
      eventType: 'order.voided.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: order.storeId,
      correlationId: `void-${order.id}`,
      actor: { userId: supervisor.id },
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: command.reason,
        approvedByUserId: supervisor.id,
        totalVoidedAmount: order.total.toDecimal(),
      },
    };

    await this.outboxWriter.write(voidEvent);
    return order;
  }

  /**
   * Devolución parcial de un ítem devuelto por el cliente con autorización de supervisor.
   */
  public async refundOrderItem(command: RefundOrderItemCommand): Promise<Order> {
    const order = await this.salesRepo.findOrderById(command.orderId);
    if (!order) {
      throw new NotFoundException(`Pedido ${command.orderId} no encontrado.`);
    }

    const item = order.items.find((i) => i.id === command.orderItemId);
    if (!item) {
      throw new NotFoundException(`Ítem ${command.orderItemId} no encontrado en el pedido.`);
    }

    if (item.status === 'VOIDED') {
      throw new BadRequestException('El ítem ya fue anulado/devuelto previamente.');
    }

    const supervisor = this.authService.authorizeSupervisorAction(order.storeId, command.supervisorPin);

    item.status = 'VOIDED';
    item.voidReason = command.reason;

    // Si el pedido tuvo pago en efectivo, descontar el monto del ítem devuelto de la caja
    const cashPayment = order.payments.find((p) => p.method === 'CASH');
    if (cashPayment) {
      const refundAmount = item.totalPrice;
      await this.cashShiftPort.recordCashRefund(order.shiftId, refundAmount);
    }

    order.paymentStatus = 'PARTIALLY_REFUNDED';
    await this.salesRepo.saveOrder(order);

    await this.auditService.log({
      storeId: order.storeId,
      userId: supervisor.id,
      action: 'REFUND_ITEM',
      entity: 'ORDER_ITEM',
      entityId: item.id,
      afterState: {
        orderNumber: order.orderNumber,
        productName: item.productName,
        refundAmount: item.totalPrice.toDecimal(),
        reason: command.reason,
      },
      deviceInfo: command.deviceInfo,
    });

    const refundEvent: DomainEvent<{
      orderId: string;
      orderItemId: string;
      productName: string;
      refundAmount: number;
      reason: string;
      approvedByUserId: string;
    }> = {
      eventId: uuidv4(),
      eventType: 'order.refunded.v1',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      storeId: order.storeId,
      correlationId: `refund-${item.id}`,
      actor: { userId: supervisor.id },
      payload: {
        orderId: order.id,
        orderItemId: item.id,
        productName: item.productName,
        refundAmount: item.totalPrice.toDecimal(),
        reason: command.reason,
        approvedByUserId: supervisor.id,
      },
    };

    await this.outboxWriter.write(refundEvent);
    return order;
  }

  public async createAndPayCashOrder(command: CreateCashOrderCommand): Promise<Order> {
    return this.createAndPayOrder({
      storeId: command.storeId,
      registerId: command.registerId,
      registerCode: command.registerCode,
      cashierUserId: command.cashierUserId,
      cashierName: command.cashierName,
      orderType: command.orderType,
      customerName: command.customerName,
      idempotencyKey: command.idempotencyKey,
      items: command.items,
      payments: [
        {
          method: 'CASH',
          amount: command.cashTendered,
          cashTendered: command.cashTendered,
        },
      ],
    });
  }

  public async getOrderById(orderId: string): Promise<Order | null> {
    return this.salesRepo.findOrderById(orderId);
  }
}
