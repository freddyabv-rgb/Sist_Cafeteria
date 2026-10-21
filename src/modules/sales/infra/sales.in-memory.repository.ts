import { ISalesRepository } from './sales.repository.interface';
import { Order } from '../domain/order.entity';

export class InMemorySalesRepository implements ISalesRepository {
  private orders = new Map<string, Order>();
  private idempotencyIndex = new Map<string, string>();
  private sequences = new Map<string, number>();

  public async saveOrder(order: Order): Promise<void> {
    this.orders.set(order.id, order);
    this.idempotencyIndex.set(order.idempotencyKey, order.id);
  }

  public async findOrderById(id: string): Promise<Order | null> {
    return this.orders.get(id) || null;
  }

  public async findOrderByIdempotencyKey(idempotencyKey: string): Promise<Order | null> {
    const orderId = this.idempotencyIndex.get(idempotencyKey);
    if (!orderId) return null;
    return this.orders.get(orderId) || null;
  }

  public async findOrdersByShift(shiftId: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter((o) => o.shiftId === shiftId);
  }

  public async getNextOrderSequence(storeId: string, registerId: string): Promise<number> {
    const key = `${storeId}:${registerId}`;
    const current = this.sequences.get(key) || 0;
    const next = current + 1;
    this.sequences.set(key, next);
    return next;
  }

  public clear(): void {
    this.orders.clear();
    this.idempotencyIndex.clear();
    this.sequences.clear();
  }
}
