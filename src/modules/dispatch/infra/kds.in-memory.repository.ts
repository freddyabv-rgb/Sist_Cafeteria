import { IKdsRepository } from './kds.repository.interface';
import { KdsOrderCard } from '../domain/kds-card.entity';

export class InMemoryKdsRepository implements IKdsRepository {
  private cards = new Map<string, KdsOrderCard>();

  public async saveCard(card: KdsOrderCard): Promise<void> {
    this.cards.set(card.id, card);
  }

  public async findCardById(id: string): Promise<KdsOrderCard | null> {
    return this.cards.get(id) || null;
  }

  public async findActiveQueue(storeId: string): Promise<KdsOrderCard[]> {
    return Array.from(this.cards.values())
      .filter((c) => c.storeId === storeId && (c.status === 'RECEIVED' || c.status === 'PREPARING'))
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime()); // FIFO cronológico
  }

  public async findRecentCompleted(storeId: string, limit: number = 10): Promise<KdsOrderCard[]> {
    return Array.from(this.cards.values())
      .filter((c) => c.storeId === storeId && c.status === 'READY')
      .sort((a, b) => (b.readyAt?.getTime() || 0) - (a.readyAt?.getTime() || 0))
      .slice(0, limit);
  }

  public clear(): void {
    this.cards.clear();
  }
}
