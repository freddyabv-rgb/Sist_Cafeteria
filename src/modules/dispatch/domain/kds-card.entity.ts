import { BaseEntity } from '@shared/types/entity';

export type KdsCardStatus = 'RECEIVED' | 'PREPARING' | 'READY';
export type SlaStatus = 'TARGET' | 'WARNING' | 'DANGER';

export interface KdsCardModifier {
  optionName: string;
  quantity: number;
  highlightKds: boolean;
}

export interface KdsCardItem {
  orderItemId: string;
  name: string;
  variantName: string;
  quantity: number;
  notes?: string;
  modifiers: KdsCardModifier[];
}

export interface KdsCardProps {
  id: string;
  storeId: string;
  orderNumber: string;
  orderType: 'TAKEAWAY' | 'DINE_IN';
  customerName?: string;
  paidAt: Date;
  status: KdsCardStatus;
  startedAt?: Date;
  readyAt?: Date;
  prepDurationSeconds?: number;
  items: KdsCardItem[];
}

export class KdsOrderCard extends BaseEntity {
  public storeId: string;
  public orderNumber: string;
  public orderType: 'TAKEAWAY' | 'DINE_IN';
  public customerName?: string;
  public paidAt: Date;
  public status: KdsCardStatus;
  public startedAt?: Date;
  public readyAt?: Date;
  public prepDurationSeconds?: number;
  public items: KdsCardItem[];

  constructor(props: KdsCardProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.orderNumber = props.orderNumber;
    this.orderType = props.orderType;
    this.customerName = props.customerName;
    this.paidAt = props.paidAt;
    this.status = props.status;
    this.startedAt = props.startedAt;
    this.readyAt = props.readyAt;
    this.prepDurationSeconds = props.prepDurationSeconds;
    this.items = props.items;
  }

  /**
   * Cambia el estado a PREPARING registrando la hora de inicio de barista.
   */
  public startPreparing(): void {
    if (this.status !== 'RECEIVED') {
      return;
    }
    this.status = 'PREPARING';
    this.startedAt = new Date();
  }

  /**
   * Marca el pedido como READY y calcula la duración exacta de preparación en segundos.
   */
  public markAsReady(): void {
    this.status = 'READY';
    this.readyAt = new Date();
    const startTime = this.startedAt || this.paidAt;
    this.prepDurationSeconds = Math.round(
      (this.readyAt.getTime() - startTime.getTime()) / 1000,
    );
  }

  /**
   * Calcula el estado SLA y badge accesible según el tiempo transcurrido desde el pago:
   * - < 90s: TARGET (Verde / "A TIEMPO")
   * - 90s - 180s: WARNING (Amarillo / "ATENCIÓN")
   * - > 180s: DANGER (Rojo / "DEMORA")
   */
  public getSlaStatus(currentDate: Date = new Date()): {
    status: SlaStatus;
    elapsedSeconds: number;
    colorToken: string;
    accessibleLabel: string;
  } {
    const elapsedSeconds = Math.round(
      (currentDate.getTime() - this.paidAt.getTime()) / 1000,
    );

    if (elapsedSeconds < 90) {
      return {
        status: 'TARGET',
        elapsedSeconds,
        colorToken: '#10B981', // Verde
        accessibleLabel: 'A TIEMPO [✓]',
      };
    }

    if (elapsedSeconds <= 180) {
      return {
        status: 'WARNING',
        elapsedSeconds,
        colorToken: '#F59E0B', // Amarillo
        accessibleLabel: 'EN TIEMPO LÍMITE [!]',
      };
    }

    return {
      status: 'DANGER',
      elapsedSeconds,
      colorToken: '#EF4444', // Rojo
      accessibleLabel: 'DEMORA CRÍTICA [⚠]',
    };
  }
}
