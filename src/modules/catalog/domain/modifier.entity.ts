import { BaseEntity } from '@shared/types/entity';
import { Money } from '@shared/types/money';

export interface ModifierOptionProps {
  id: string;
  modifierGroupId: string;
  name: string;
  priceDelta: Money;
  maxQuantity: number;
  highlightKds: boolean;
  allergenTags: string[];
}

export class ModifierOption extends BaseEntity {
  public modifierGroupId: string;
  public name: string;
  public priceDelta: Money;
  public maxQuantity: number;
  public highlightKds: boolean;
  public allergenTags: string[];

  constructor(props: ModifierOptionProps) {
    super(props.id);
    this.modifierGroupId = props.modifierGroupId;
    this.name = props.name;
    this.priceDelta = props.priceDelta;
    this.maxQuantity = props.maxQuantity;
    this.highlightKds = props.highlightKds;
    this.allergenTags = props.allergenTags;
  }
}

export interface ModifierGroupProps {
  id: string;
  storeId: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export class ModifierGroup extends BaseEntity {
  public storeId: string;
  public name: string;
  public minSelections: number;
  public maxSelections: number;
  public isRequired: boolean;
  public options: ModifierOption[];

  constructor(props: ModifierGroupProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.name = props.name;
    this.minSelections = props.minSelections;
    this.maxSelections = props.maxSelections;
    this.isRequired = props.isRequired;
    this.options = props.options;
  }
}
