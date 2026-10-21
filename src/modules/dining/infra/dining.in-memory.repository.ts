import { Injectable } from '@nestjs/common';
import {
  IDiningRepository,
  TabFilter,
} from '../domain/dining.repository.interface';
import { DiningTable } from '../domain/dining-table.entity';
import { DiningTab } from '../domain/dining-tab.entity';

@Injectable()
export class InMemoryDiningRepository implements IDiningRepository {
  private readonly tables = new Map<string, DiningTable>();
  private readonly tabs = new Map<string, DiningTab>();

  public async saveTable(table: DiningTable): Promise<void> {
    this.tables.set(table.id, table);
  }

  public async findTableById(id: string): Promise<DiningTable | null> {
    return this.tables.get(id) || null;
  }

  public async findTableByNumber(
    storeId: string,
    tableNumber: string,
  ): Promise<DiningTable | null> {
    for (const table of this.tables.values()) {
      if (
        table.storeId === storeId &&
        table.tableNumber.toUpperCase() === tableNumber.toUpperCase()
      ) {
        return table;
      }
    }
    return null;
  }

  public async findTablesByStore(
    storeId: string,
    zone?: string,
  ): Promise<DiningTable[]> {
    return Array.from(this.tables.values()).filter((t) => {
      if (t.storeId !== storeId) return false;
      if (zone && t.zone !== zone) return false;
      return true;
    });
  }

  public async saveTab(tab: DiningTab): Promise<void> {
    this.tabs.set(tab.id, tab);
  }

  public async findTabById(id: string): Promise<DiningTab | null> {
    return this.tabs.get(id) || null;
  }

  public async findActiveTabByTableId(tableId: string): Promise<DiningTab | null> {
    for (const tab of this.tabs.values()) {
      if (
        tab.tableId === tableId &&
        (tab.status === 'OPEN' || tab.status === 'BILL_REQUESTED')
      ) {
        return tab;
      }
    }
    return null;
  }

  public async findTabsByStore(
    storeId: string,
    filter?: TabFilter,
  ): Promise<DiningTab[]> {
    return Array.from(this.tabs.values()).filter((tab) => {
      if (tab.storeId !== storeId) return false;
      if (filter?.status && tab.status !== filter.status) return false;
      if (filter?.waiterUserId && tab.waiterUserId !== filter.waiterUserId) return false;
      if (filter?.fromDate && tab.openedAt < filter.fromDate) return false;
      if (filter?.toDate && tab.openedAt > filter.toDate) return false;
      return true;
    });
  }
}
