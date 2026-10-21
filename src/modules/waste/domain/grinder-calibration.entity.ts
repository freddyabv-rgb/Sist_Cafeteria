import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type CalibrationStatus = 'APPROVED' | 'ADJUSTED' | 'REJECTED';

export interface GrinderCalibrationProps {
  id: string;
  storeId: string;
  grinderName: string;
  ingredientId: string;
  ingredientName: string;
  targetDrink?: string; // ej. "Espresso Doble 1:2"
  doseInGrams: number; // ej. 18.0 g
  yieldOutGrams: number; // ej. 36.0 g
  extractionTimeSeconds: number; // ej. 27 s
  grindSetting: string; // ej. "2.4" o "Micro 14"
  testShotsCount: number; // ej. 3 purgas/intentos
  totalWastedGrams: number; // ej. 54 g de café desechado
  unitCostDec: number; // CPP por gramo de café
  totalCost: Money; // Valor monetario de la merma de calibración
  sensoryNotes?: string; // ej. "Ratio 1:2.0, acidez cítrica, balance dulce"
  status: CalibrationStatus;
  baristaUserId: string;
  baristaName: string;
  createdAt?: Date;
}

export class GrinderCalibration extends BaseEntity {
  public storeId: string;
  public grinderName: string;
  public ingredientId: string;
  public ingredientName: string;
  public targetDrink: string;
  public doseInGrams: number;
  public yieldOutGrams: number;
  public extractionTimeSeconds: number;
  public grindSetting: string;
  public testShotsCount: number;
  public totalWastedGrams: number;
  public unitCostDec: number;
  public totalCost: Money;
  public sensoryNotes: string;
  public status: CalibrationStatus;
  public baristaUserId: string;
  public baristaName: string;
  public createdAt: Date;

  constructor(props: GrinderCalibrationProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.grinderName = props.grinderName;
    this.ingredientId = props.ingredientId;
    this.ingredientName = props.ingredientName;
    this.targetDrink = props.targetDrink || 'Espresso Estándar';
    this.doseInGrams = props.doseInGrams;
    this.yieldOutGrams = props.yieldOutGrams;
    this.extractionTimeSeconds = props.extractionTimeSeconds;
    this.grindSetting = props.grindSetting;
    this.testShotsCount = props.testShotsCount;
    this.totalWastedGrams = props.totalWastedGrams;
    this.unitCostDec = props.unitCostDec;
    this.totalCost = props.totalCost;
    this.sensoryNotes = props.sensoryNotes || '';
    this.status = props.status;
    this.baristaUserId = props.baristaUserId;
    this.baristaName = props.baristaName;
    this.createdAt = props.createdAt || new Date();
  }

  /**
   * Ratio de extracción (Brew Ratio = Líquido / Grano).
   * Ej. 36g out / 18g in = 2.0 (Ratio 1:2)
   */
  public get brewRatio(): number {
    if (this.doseInGrams <= 0) return 0;
    return Number((this.yieldOutGrams / this.doseInGrams).toFixed(2));
  }
}
