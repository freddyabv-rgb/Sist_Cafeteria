import { PaymentMethod } from '@modules/sales/domain/payment.entity';

export interface CreateTableDto {
  storeId: string;
  tableNumber: string;
  zone: string;
  capacity: number;
}

export interface OpenTableTabDto {
  storeId: string;
  tableId: string;
  waiterUserId: string;
  waiterName: string;
  paxCount: number;
  customerName?: string;
}

export interface TabItemInputModifier {
  modifierOptionId: string;
  quantity: number;
}

export interface AddRoundItemDto {
  productId: string;
  variantId: string;
  quantity: number;
  notes?: string;
  modifiers?: TabItemInputModifier[];
}

export interface AddRoundToTabDto {
  storeId: string;
  tabId: string;
  items: AddRoundItemDto[];
  waiterUserId: string;
}

export interface TransferTabDto {
  storeId: string;
  tabId: string;
  targetTableId: string;
  transferredByUserId: string;
  reason?: string;
}

export interface MergeTablesDto {
  storeId: string;
  primaryTableId: string;
  secondaryTableId: string;
  mergedByUserId: string;
  reason?: string;
}

export interface RequestBillDto {
  storeId: string;
  tabId: string;
}

export interface SplitEqualResult {
  tabId: string;
  totalGross: number;
  numberOfSplits: number;
  amountPerPerson: number;
  remainingAmount: number;
}

export interface SplitByItemsResult {
  tabId: string;
  selectedItemsTotal: number;
  remainingItemsTotal: number;
  selectedItemsCount: number;
  remainingItemsCount: number;
}

export interface CloseAndPayTabDto {
  storeId: string;
  tabId: string;
  registerId: string;
  registerCode?: string;
  cashierUserId: string;
  cashierName?: string;
  idempotencyKey: string;
  payments: Array<{
    method: PaymentMethod;
    provider?: string;
    reference?: string;
    amount: number;
    tipAmount?: number;
    cashTendered?: number;
  }>;
  discount?: {
    type: 'PERCENTAGE' | 'FIXED' | 'COURTESY_100';
    value: number;
    reason: string;
    supervisorPin?: string;
  };
}
