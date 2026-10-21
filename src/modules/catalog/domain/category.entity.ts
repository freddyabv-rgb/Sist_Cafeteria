import { BaseEntity } from '@shared/types/entity';

export interface CategoryProps {
  id: string;
  storeId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export class Category extends BaseEntity {
  public storeId: string;
  public name: string;
  public displayOrder: number;
  public isActive: boolean;

  constructor(props: CategoryProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.name = props.name;
    this.displayOrder = props.displayOrder;
    this.isActive = props.isActive;
  }
}
