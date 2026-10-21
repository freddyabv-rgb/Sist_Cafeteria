import { OrderType } from '../domain/order.entity';

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

export interface CreateCashOrderCommand {
  storeId: string;
  registerId: string;
  registerCode?: string; // ej. "C1"
  cashierUserId: string;
  cashierName?: string;
  orderType: OrderType;
  customerName?: string;
  idempotencyKey: string;
  cashTendered: number;
  items: OrderItemInput[];
}
