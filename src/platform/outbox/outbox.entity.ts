export interface OutboxRecord {
  id: string;
  eventId: string;
  eventType: string;
  schemaVersion: number;
  payload: string; // JSON serializado
  createdAt: Date;
  publishedAt: Date | null;
  attempts: number;
  lastError: string | null;
}

export interface ProcessedEventRecord {
  eventId: string;
  handler: string;
  processedAt: Date;
}
