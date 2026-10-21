export interface DailySalesReportDto {
  storeId: string;
  date: string; // YYYY-MM-DD
  metrics: {
    orderCount: number;
    itemsCount: number;
    grossSales: number;
    discountsTotal: number;
    netSales: number;
    subtotalTaxable: number;
    taxIgv: number;
    tipsTotal: number;
    averageTicket: number;
  };
  byOrderType: {
    takeawayCount: number;
    takeawayTotal: number;
    dineInCount: number;
    dineInTotal: number;
  };
  byPaymentMethod: {
    cash: number;
    digitalWallets: number;
    cards: number;
    transfers: number;
  };
}

export interface TopProductItemDto {
  rank: number;
  productName: string;
  unitsSold: number;
  revenue: number;
  station: string;
}

export interface HourlySalesSlotDto {
  hour: number; // 0 a 23
  hourLabel: string; // "08:00 - 08:59"
  orderCount: number;
  revenue: number;
  isPeakHour: boolean;
}

export interface ShiftReconciliationDto {
  storeId: string;
  date: string;
  shiftsCount: number;
  totalInitialCash: number;
  totalCashSales: number;
  totalExpenses: number;
  totalCashDrops: number;
  totalExpectedCash: number;
  totalDeclaredCash: number;
  totalDifference: number;
  isFullyBalanced: boolean;
  shifts: Array<{
    shiftId: string;
    registerId: string;
    cashierId: string;
    openedAt: string;
    closedAt: string;
    expectedCash: number;
    declaredCash: number;
    difference: number;
  }>;
}
