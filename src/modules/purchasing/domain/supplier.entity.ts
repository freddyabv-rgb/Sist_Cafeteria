import { BaseEntity } from '@shared/types/entity';

export interface SupplierProps {
  id: string;
  storeId: string;
  taxId: string; // RUC (11 dígitos en Perú)
  legalName: string; // Razón Social
  commercialName: string; // Nombre Comercial
  contactName: string;
  phone: string;
  email: string;
  leadTimeDays: number; // Tiempo promedio de entrega
  isActive: boolean;
}

export class Supplier extends BaseEntity {
  public storeId: string;
  public taxId: string;
  public legalName: string;
  public commercialName: string;
  public contactName: string;
  public phone: string;
  public email: string;
  public leadTimeDays: number;
  public isActive: boolean;

  constructor(props: SupplierProps) {
    super(props.id);
    this.validateTaxId(props.taxId);

    this.storeId = props.storeId;
    this.taxId = props.taxId;
    this.legalName = props.legalName;
    this.commercialName = props.commercialName;
    this.contactName = props.contactName;
    this.phone = props.phone;
    this.email = props.email;
    this.leadTimeDays = props.leadTimeDays;
    this.isActive = props.isActive;
  }

  private validateTaxId(taxId: string): void {
    const cleaned = taxId.trim();
    if (!/^\d{11}$/.test(cleaned)) {
      throw new Error(`El RUC del proveedor debe tener exactamente 11 dígitos numéricos. Recibido: ${taxId}`);
    }
  }
}
