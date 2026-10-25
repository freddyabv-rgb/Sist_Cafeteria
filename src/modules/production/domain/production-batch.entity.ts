import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export type BatchStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProductionBatchProps {
  id: string;
  storeId: string;
  batchNumber: string; // ej. "LOT-20261019-001"
  recipeId: string;
  recipeName: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  targetQuantity: number; // Unidades planificadas (ej. 24)
  actualYield?: number; // Unidades reales obtenidas aptas para vitrina (ej. 22)
  wasteUnits?: number; // Unidades mermadas / defectuosas (ej. 2)
  status: BatchStatus;
  totalCost: Money; // Costo total de las materias primas consumidas
  unitCost: Money; // Costo unitario real (totalCost / actualYield)
  bakerUserId: string;
  bakerName: string;
  notes?: string;
  cancellationReason?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
}

export class ProductionBatch extends BaseEntity {
  public storeId: string;
  public batchNumber: string;
  public recipeId: string;
  public recipeName: string;
  public productVariantId: string;
  public productName: string;
  public variantName: string;
  public targetQuantity: number;
  public actualYield: number;
  public wasteUnits: number;
  public status: BatchStatus;
  public totalCost: Money;
  public unitCost: Money;
  public bakerUserId: string;
  public bakerName: string;
  public notes?: string;
  public cancellationReason?: string;
  public startedAt?: Date;
  public completedAt?: Date;
  public createdAt: Date;

  constructor(props: ProductionBatchProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.batchNumber = props.batchNumber;
    this.recipeId = props.recipeId;
    this.recipeName = props.recipeName;
    this.productVariantId = props.productVariantId;
    this.productName = props.productName;
    this.variantName = props.variantName;
    this.targetQuantity = props.targetQuantity;
    this.actualYield = props.actualYield ?? 0;
    this.wasteUnits = props.wasteUnits ?? 0;
    this.status = props.status;
    this.totalCost = props.totalCost;
    this.unitCost = props.unitCost;
    this.bakerUserId = props.bakerUserId;
    this.bakerName = props.bakerName;
    this.notes = props.notes;
    this.cancellationReason = props.cancellationReason;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.createdAt = props.createdAt || new Date();
  }

  public start(): void {
    this.status = 'IN_PROGRESS';
    this.startedAt = new Date();
  }

  public complete(actualYield: number, wasteUnits: number, totalCost: Money): void {
    this.status = 'COMPLETED';
    this.actualYield = actualYield;
    this.wasteUnits = wasteUnits;
    this.totalCost = totalCost;

    if (actualYield > 0) {
      const unitCostDec = totalCost.toDecimal() / actualYield;
      this.unitCost = Money.fromDecimal(Number(unitCostDec.toFixed(4)), 'PEN');
    } else {
      this.unitCost = Money.zero('PEN');
    }

    this.completedAt = new Date();
  }

  public cancel(reason: string): void {
    this.status = 'CANCELLED';
    this.cancellationReason = reason;
  }

  /**
   * Tasa de eficiencia del lote (% de unidades aptas respecto a lo planificado).
   * Ej. 22 / 24 = 91.67%
   */
  public get efficiencyRate(): number {
    if (this.targetQuantity <= 0) return 0;
    return Number(((this.actualYield / this.targetQuantity) * 100).toFixed(2));
  }
}
