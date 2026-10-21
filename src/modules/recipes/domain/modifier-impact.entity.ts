import { BaseEntity } from '@shared/types/entity';

export type ModifierImpactAction = 'SUBSTITUTE' | 'ADD' | 'REMOVE';

export interface ModifierRecipeImpactProps {
  id: string;
  storeId: string;
  modifierOptionId: string; // ID de la opción del catálogo (ej. "opt-leche-avena", "opt-extra-shot")
  optionName: string;
  action: ModifierImpactAction;
  targetIngredientId: string; // Insumo que se añade o que entra a sustituir
  targetIngredientName: string;
  targetSubstitutableGroup?: string; // Grupo que sustituye (ej. "DAIRY")
  quantityDelta: number; // Cantidad a sumar (si ADD), o 0 si reemplaza 1:1 en volumen (si SUBSTITUTE)
  unit: 'GRAM' | 'MILLILITER' | 'UNIT';
}

export class ModifierRecipeImpact extends BaseEntity {
  public storeId: string;
  public modifierOptionId: string;
  public optionName: string;
  public action: ModifierImpactAction;
  public targetIngredientId: string;
  public targetIngredientName: string;
  public targetSubstitutableGroup?: string;
  public quantityDelta: number;
  public unit: 'GRAM' | 'MILLILITER' | 'UNIT';

  constructor(props: ModifierRecipeImpactProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.modifierOptionId = props.modifierOptionId;
    this.optionName = props.optionName;
    this.action = props.action;
    this.targetIngredientId = props.targetIngredientId;
    this.targetIngredientName = props.targetIngredientName;
    this.targetSubstitutableGroup = props.targetSubstitutableGroup;
    this.quantityDelta = props.quantityDelta;
    this.unit = props.unit;
  }
}
