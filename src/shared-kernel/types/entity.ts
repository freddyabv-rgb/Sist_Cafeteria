/**
 * Clase base para todas las entidades de dominio con identificador único.
 */
export abstract class BaseEntity {
  constructor(public readonly id: string) {}

  public equals(other: BaseEntity): boolean {
    if (!other || !(other instanceof BaseEntity)) {
      return false;
    }
    return this.id === other.id;
  }
}
