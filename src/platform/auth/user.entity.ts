import { BaseEntity } from '@shared/types/entity';

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'CASHIER' | 'BARISTA';

export interface UserProps {
  id: string;
  storeId: string;
  name: string;
  role: UserRole;
  pinHash: string; // Hash con sal para autenticación rápida
  isActive: boolean;
}

export class User extends BaseEntity {
  public storeId: string;
  public name: string;
  public role: UserRole;
  public pinHash: string;
  public isActive: boolean;

  constructor(props: UserProps) {
    super(props.id);
    this.storeId = props.storeId;
    this.name = props.name;
    this.role = props.role;
    this.pinHash = props.pinHash;
    this.isActive = props.isActive;
  }

  public isSupervisorOrAdmin(): boolean {
    return this.role === 'SUPERVISOR' || this.role === 'ADMIN';
  }
}
