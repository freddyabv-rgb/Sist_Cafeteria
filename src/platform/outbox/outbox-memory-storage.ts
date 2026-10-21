import { IOutboxStorage } from './outbox-storage.interface';
import { OutboxRecord, ProcessedEventRecord } from './outbox.entity';

export class InMemoryOutboxStorage implements IOutboxStorage {
  private records: Map<string, OutboxRecord> = new Map();
  private processed: Set<string> = new Set();

  public async save(
    record: Omit<OutboxRecord, 'publishedAt' | 'attempts' | 'lastError'>,
  ): Promise<void> {
    this.records.set(record.id, {
      ...record,
      publishedAt: null,
      attempts: 0,
      lastError: null,
    });
  }

  public async findPending(limit: number): Promise<OutboxRecord[]> {
    const list: OutboxRecord[] = [];
    for (const record of this.records.values()) {
      if (!record.publishedAt && record.attempts < 5) {
        list.push(record);
        if (list.length >= limit) break;
      }
    }
    return list;
  }

  public async markPublished(id: string): Promise<void> {
    const item = this.records.get(id);
    if (item) {
      item.publishedAt = new Date();
    }
  }

  public async recordFailure(id: string, error: string): Promise<void> {
    const item = this.records.get(id);
    if (item) {
      item.attempts += 1;
      item.lastError = error;
    }
  }

  public async isProcessed(eventId: string, handler: string): Promise<boolean> {
    return this.processed.has(`${eventId}:${handler}`);
  }

  public async markProcessed(record: ProcessedEventRecord): Promise<void> {
    this.processed.add(`${record.eventId}:${record.handler}`);
  }

  public clear(): void {
    this.records.clear();
    this.processed.clear();
  }
}
