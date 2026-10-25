import { OrderType } from '../domain/order.entity';
import { OrderItemInput } from './create-order.dto';

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
