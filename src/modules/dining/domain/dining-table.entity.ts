import { BaseEntity } from '@shared/types/entity';

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILL_PRINTED' | 'RESERVED';

export interface DiningTableProps {
  id: string;
  storeId: string;
  tableNumber: string; // ej. "M01", "M02", "T01" (Terraza), "B01" (Barra)
  zone: string; // ej. 'SALON_PRINCIPAL' | 'TERRAZA' | 'BARRA'
  capacity: number;
  status: TableStatus;
  currentTabId?: string;
  mergedWithTableId?: string;
  isActive: boolean;
}

export class DiningTable extends BaseEntity {
  public storeId: string;
  public tableNumber: string;
  public zone: string;
  public capacity: number;
  public status: TableStatus;
  public currentTabId?: string;
  public mergedWithTableId?: string;
  public isActive: boolean;

  constructor(props: DiningTableProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.tableNumber = props.tableNumber;
    this.zone = props.zone;
    this.capacity = props.capacity;
    this.status = props.status;
    this.currentTabId = props.currentTabId;
    this.mergedWithTableId = props.mergedWithTableId;
    this.isActive = props.isActive;
  }

  public occupy(tabId: string): void {
    this.status = 'OCCUPIED';
    this.currentTabId = tabId;
  }

  public markBillPrinted(): void {
    if (this.status === 'OCCUPIED') {
      this.status = 'BILL_PRINTED';
    }
  }

  public release(): void {
    this.status = 'AVAILABLE';
    this.currentTabId = undefined;
    this.mergedWithTableId = undefined;
  }

  public mergeInto(targetTableId: string): void {
    this.mergedWithTableId = targetTableId;
    this.status = 'OCCUPIED';
  }

  public unmerge(): void {
    this.mergedWithTableId = undefined;
    this.status = 'AVAILABLE';
  }
}
