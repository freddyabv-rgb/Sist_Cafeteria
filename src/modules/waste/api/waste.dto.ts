import { WasteType } from '../domain/waste-record.entity';
import { CalibrationStatus } from '../domain/grinder-calibration.entity';

export interface RecordGrinderCalibrationDto {
  storeId: string;
  grinderName: string;
  ingredientId: string;
  targetDrink?: string;
  doseInGrams: number;
  yieldOutGrams: number;
  extractionTimeSeconds: number;
  grindSetting: string;
  testShotsCount: number;
  totalWastedGrams: number;
  sensoryNotes?: string;
  status?: CalibrationStatus;
  baristaUserId: string;
  baristaName: string;
}

export interface WasteItemInput {
  ingredientId: string;
  quantity: number;
  unit?: string;
}

export interface RecordWasteDto {
  storeId: string;
  type: WasteType;
  reason: string;
  orderId?: string;
  orderNumber?: string;
  responsibleUserId: string;
  responsibleUserName: string;
  supervisorPin?: string; // Requerido si el costo supera el umbral sensible
  items: WasteItemInput[];
}

export interface RecordRemakeOrderDto {
  storeId: string;
  orderId: string;
  orderNumber: string;
  productVariantId: string;
  quantity: number;
  modifiers?: Array<{
    modifierOptionId: string;
    quantity: number;
  }>;
  reason: string;
  responsibleUserId: string;
  responsibleUserName: string;
  supervisorPin?: string;
}

export interface WasteSummaryItemReport {
  type: WasteType | 'GRINDER_CALIBRATION';
  count: number;
  totalCostDec: number;
}

export interface WasteSummaryReportDto {
  storeId: string;
  generatedAt: string;
  totalLossCostDec: number;
  totalCalibrationCostDec: number;
  totalOperationalWasteCostDec: number;
  totalCoffeeGramsCalibrated: number;
  breakdown: WasteSummaryItemReport[];
}
