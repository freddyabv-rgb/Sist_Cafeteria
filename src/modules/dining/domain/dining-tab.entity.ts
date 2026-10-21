import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type TabStatus = 'OPEN' | 'BILL_REQUESTED' | 'CLOSED' | 'CANCELLED';
export type TabItemStatus = 'ORDERED' | 'SERVED' | 'VOIDED';

export interface TabItemModifier {
  modifierOptionId: string;
  name: string;
  quantity: number;
  priceDelta: Money;
}

export interface TabItemProps {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  station: 'BARRA' | 'COCINA' | 'VITRINA';
  unitPrice: Money;
  quantity: number;
  modifiers?: TabItemModifier[];
  totalPrice: Money;
  status: TabItemStatus;
  roundNumber: number;
  orderedAt?: Date;
  notes?: string;
  voidReason?: string;
}

export class TabItem extends BaseEntity {
  public productId: string;
  public variantId: string;
  public productName: string;
  public variantName: string;
  public station: 'BARRA' | 'COCINA' | 'VITRINA';
  public unitPrice: Money;
  public quantity: number;
  public modifiers: TabItemModifier[];
  public totalPrice: Money;
  public status: TabItemStatus;
  public roundNumber: number;
  public orderedAt: Date;
  public notes?: string;
  public voidReason?: string;

  constructor(props: TabItemProps) {
    super(props.id);
    this.productId = props.productId;
    this.variantId = props.variantId;
    this.productName = props.productName;
    this.variantName = props.variantName;
    this.station = props.station;
    this.unitPrice = props.unitPrice;
    this.quantity = props.quantity;
    this.modifiers = props.modifiers || [];
    this.totalPrice = props.totalPrice;
    this.status = props.status;
    this.roundNumber = props.roundNumber;
    this.orderedAt = props.orderedAt || new Date();
    this.notes = props.notes;
    this.voidReason = props.voidReason;
  }

  public void(reason: string): void {
    this.status = 'VOIDED';
    this.voidReason = reason;
  }
}

export interface DiningTabProps {
  id: string;
  storeId: string;
  tabNumber: string; // ej. "TAB-M01-001"
  tableId: string;
  tableNumber: string;
  waiterUserId: string;
  waiterName: string;
  customerName?: string;
  paxCount: number;
  status: TabStatus;
  items: TabItem[];
  openedAt?: Date;
  closedAt?: Date;
  salesOrderId?: string;
}

export class DiningTab extends BaseEntity {
  public storeId: string;
  public tabNumber: string;
  public tableId: string;
  public tableNumber: string;
  public waiterUserId: string;
  public waiterName: string;
  public customerName?: string;
  public paxCount: number;
  public status: TabStatus;
  public items: TabItem[];
  public openedAt: Date;
  public closedAt?: Date;
  public salesOrderId?: string;

  constructor(props: DiningTabProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.tabNumber = props.tabNumber;
    this.tableId = props.tableId;
    this.tableNumber = props.tableNumber;
    this.waiterUserId = props.waiterUserId;
    this.waiterName = props.waiterName;
    this.customerName = props.customerName;
    this.paxCount = props.paxCount;
    this.status = props.status;
    this.items = props.items || [];
    this.openedAt = props.openedAt || new Date();
    this.closedAt = props.closedAt;
    this.salesOrderId = props.salesOrderId;
  }

  public get currentRoundNumber(): number {
    if (this.items.length === 0) return 0;
    return Math.max(...this.items.map((i) => i.roundNumber));
  }

  public get activeItems(): TabItem[] {
    return this.items.filter((i) => i.status !== 'VOIDED');
  }

  public addItems(newItems: TabItem[]): void {
    this.items.push(...newItems);
  }

  public voidItem(itemId: string, reason: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (item) {
      item.void(reason);
    }
  }

  public calculateTotal(): Money {
    return this.activeItems.reduce(
      (acc, it) => acc.add(it.totalPrice),
      Money.zero('PEN'),
    );
  }

  public calculateSubtotal(): Money {
    const totalDec = this.calculateTotal().toDecimal();
    const subtotalDec = Math.round((totalDec / 1.18) * 100) / 100;
    return Money.fromDecimal(subtotalDec, 'PEN');
  }

  public calculateTax(): Money {
    return this.calculateTotal().subtract(this.calculateSubtotal());
  }

  public transferToTable(newTableId: string, newTableNumber: string): void {
    this.tableId = newTableId;
    this.tableNumber = newTableNumber;
  }

  public requestBill(): void {
    this.status = 'BILL_REQUESTED';
  }

  public close(salesOrderId: string): void {
    this.status = 'CLOSED';
    this.closedAt = new Date();
    this.salesOrderId = salesOrderId;
  }
}
