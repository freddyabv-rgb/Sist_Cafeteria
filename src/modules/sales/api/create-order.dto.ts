import { OrderType } from '../domain/order.entity';
import { PaymentMethod } from '../domain/payment.entity';

export interface OrderItemInputModifier {
  modifierOptionId: string;
  quantity: number;
}

export interface OrderItemInput {
  productId: string;
  variantId: string;
  quantity: number;
  notes?: string;
  modifiers?: OrderItemInputModifier[];
}

export interface PaymentInput {
  method: PaymentMethod;
  provider?: string;    // "YAPE", "PLIN", "VISA", "MASTERCARD"
  reference?: string;   // Nro de operación / voucher
  amount: number;
  tipAmount?: number;   // Propina opcional
  cashTendered?: number; // Para pagos en efectivo
}

export interface DiscountInput {
  type: 'PERCENTAGE' | 'FIXED' | 'COURTESY_100';
  value: number; // Porcentaje (ej. 10 para 10%) o Monto fijo en Soles (ej. 5.0)
  reason: string;
  supervisorPin?: string;
}

export interface CreateOrderCommand {
  storeId: string;
  registerId: string;
  registerCode?: string; // ej. "C1"
  cashierUserId: string;
  cashierName?: string;
  orderType: OrderType;
  customerName?: string;
  idempotencyKey: string;
  items: OrderItemInput[];
  payments: PaymentInput[];
  discount?: DiscountInput;
}

export interface VoidOrderCommand {
  orderId: string;
  reason: string;
  supervisorPin: string;
  deviceInfo?: string;
}

export interface RefundOrderItemCommand {
  orderId: string;
  orderItemId: string;
  reason: string;
  supervisorPin: string;
  deviceInfo?: string;
}
