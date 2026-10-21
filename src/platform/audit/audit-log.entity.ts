import { BaseEntity } from '@shared/types/entity';

export interface AuditLogProps {
  id: string;
  storeId: string;
  userId: string;
  action: string;      // "VOID_ORDER", "REFUND_ITEM", "APPLY_DISCOUNT", "MANUAL_DRAWER_OPEN"
  entity: string;      // "ORDER", "ORDER_ITEM", "SHIFT"
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  deviceInfo?: string;
  createdAt: Date;
}

export class AuditLogRecord extends BaseEntity {
  public storeId: string;
  public userId: string;
  public action: string;
  public entity: string;
  public entityId: string;
  public beforeState?: Record<string, unknown>;
  public afterState?: Record<string, unknown>;
  public deviceInfo?: string;
  public createdAt: Date;

  constructor(props: AuditLogProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.userId = props.userId;
    this.action = props.action;
    this.entity = props.entity;
    this.entityId = props.entityId;
    this.beforeState = props.beforeState;
    this.afterState = props.afterState;
    this.deviceInfo = props.deviceInfo;
    this.createdAt = props.createdAt;
  }
}
