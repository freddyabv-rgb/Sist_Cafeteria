import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AuditLogRecord } from './audit-log.entity';

export interface CreateAuditLogInput {
  storeId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  deviceInfo?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private records: AuditLogRecord[] = [];

  public async log(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const record = new AuditLogRecord({
      id: uuidv4(),
      storeId: input.storeId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      beforeState: input.beforeState,
      afterState: input.afterState,
      deviceInfo: input.deviceInfo,
      createdAt: new Date(),
    });

    this.records.push(record);
    this.logger.log(
      `[AUDIT_LOG] Acción: ${input.action} sobre ${input.entity} #${input.entityId} por Usuario: ${input.userId}`,
    );
    return record;
  }

  public async getLogsByEntity(entityId: string): Promise<AuditLogRecord[]> {
    return this.records.filter((r) => r.entityId === entityId);
  }

  public async getAllLogs(storeId: string): Promise<AuditLogRecord[]> {
    return this.records.filter((r) => r.storeId === storeId);
  }

  public clear(): void {
    this.records = [];
  }
}
