/**
 * Puerto de Disponibilidad (AvailabilityPort).
 * Permite al POS consultar si un producto o modificador está disponible antes de agregarlo.
 * En la Fase 1 funciona con el flag manual 'is_available'.
 * En la Fase B se conectará con el módulo de Stock en tiempo real.
 */
export interface AvailabilityPort {
  isProductAvailable(productId: string): Promise<boolean>;
  isOptionAvailable(optionId: string): Promise<boolean>;
}

export class ManualAvailabilityAdapter implements AvailabilityPort {
  private readonly unavailableProducts = new Set<string>();
  private readonly unavailableOptions = new Set<string>();

  public async isProductAvailable(productId: string): Promise<boolean> {
    return !this.unavailableProducts.has(productId);
  }

  public async isOptionAvailable(optionId: string): Promise<boolean> {
    return !this.unavailableOptions.has(optionId);
  }

  public setProductAvailable(productId: string, available: boolean): void {
    if (available) {
      this.unavailableProducts.delete(productId);
    } else {
      this.unavailableProducts.add(productId);
    }
  }

  public setOptionAvailable(optionId: string, available: boolean): void {
    if (available) {
      this.unavailableOptions.delete(optionId);
    } else {
      this.unavailableOptions.add(optionId);
    }
  }
}
