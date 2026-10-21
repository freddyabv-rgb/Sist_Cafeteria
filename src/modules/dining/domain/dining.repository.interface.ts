import { DiningTable } from './dining-table.entity';
import { DiningTab, TabStatus } from './dining-tab.entity';

export interface TabFilter {
  status?: TabStatus;
  waiterUserId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface IDiningRepository {
  saveTable(table: DiningTable): Promise<void>;
  findTableById(id: string): Promise<DiningTable | null>;
  findTableByNumber(storeId: string, tableNumber: string): Promise<DiningTable | null>;
  findTablesByStore(storeId: string, zone?: string): Promise<DiningTable[]>;

  saveTab(tab: DiningTab): Promise<void>;
  findTabById(id: string): Promise<DiningTab | null>;
  findActiveTabByTableId(tableId: string): Promise<DiningTab | null>;
  findTabsByStore(storeId: string, filter?: TabFilter): Promise<DiningTab[]>;
}
