import { KdsOrderCard } from '../domain/kds-card.entity';

export interface IKdsRepository {
  saveCard(card: KdsOrderCard): Promise<void>;
  findCardById(id: string): Promise<KdsOrderCard | null>;
  findActiveQueue(storeId: string): Promise<KdsOrderCard[]>;
  findRecentCompleted(storeId: string, limit?: number): Promise<KdsOrderCard[]>;
}
