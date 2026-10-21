/**
 * Objeto de valor inmutable para manejo monetario preciso sin errores de coma flotante.
 * Trabaja internamente en céntimos enteros (cents) para cálculos 100% exactos.
 */
export class Money {
  private constructor(
    private readonly cents: number,
    public readonly currency: string = 'PEN',
  ) {}

  public static fromDecimal(amount: number, currency: string = 'PEN'): Money {
    const roundedCents = Math.round(amount * 100);
    return new Money(roundedCents, currency);
  }

  public static fromCents(cents: number, currency: string = 'PEN'): Money {
    return new Money(Math.round(cents), currency);
  }

  public static zero(currency: string = 'PEN'): Money {
    return new Money(0, currency);
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents + other.cents, this.currency);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents - other.cents, this.currency);
  }

  public multiply(multiplier: number): Money {
    return new Money(Math.round(this.cents * multiplier), this.currency);
  }

  public toDecimal(): number {
    return this.cents / 100;
  }

  public toCents(): number {
    return this.cents;
  }

  public format(): string {
    const symbol = this.currency === 'PEN' ? 'S/' : this.currency;
    return `${symbol} ${this.toDecimal().toFixed(2)}`;
  }

  public equals(other: Money): boolean {
    return this.currency === other.currency && this.cents === other.cents;
  }

  public isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents > other.cents;
  }

  public isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents < other.cents;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `No se pueden operar monedas distintas: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
