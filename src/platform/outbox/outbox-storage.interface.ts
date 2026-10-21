import { OutboxRecord, ProcessedEventRecord } from './outbox.entity';

export interface IOutboxStorage {
  save(record: Omit<OutboxRecord, 'publishedAt' | 'attempts' | 'lastError'>): Promise<void>;
  findPending(limit: number): Promise<OutboxRecord[]>;
  markPublished(id: string): Promise<void>;
  recordFailure(id: string, error: string): Promise<void>;
  isProcessed(eventId: string, handler: string): Promise<boolean>;
  markProcessed(record: ProcessedEventRecord): Promise<void>;
}
