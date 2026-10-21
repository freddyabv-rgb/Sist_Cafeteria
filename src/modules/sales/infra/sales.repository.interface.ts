import { Order } from '../domain/order.entity';

export interface ISalesRepository {
  saveOrder(order: Order): Promise<void>;
  findOrderById(id: string): Promise<Order | null>;
  findOrderByIdempotencyKey(idempotencyKey: string): Promise<Order | null>;
  findOrdersByShift(shiftId: string): Promise<Order[]>;
  getNextOrderSequence(storeId: string, registerId: string): Promise<number>;
}
