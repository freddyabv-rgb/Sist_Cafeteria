import { Money } from '../src/shared-kernel/types/money';

describe('Money Value Object', () => {
  it('debe crear montos desde decimales sin pérdida de precisión', () => {
    const price = Money.fromDecimal(18.5);
    expect(price.toCents()).toBe(1850);
    expect(price.toDecimal()).toBe(18.5);
    expect(price.format()).toBe('S/ 18.50');
  });

  it('debe sumar montos con precisión exacta', () => {
    const latteBase = Money.fromDecimal(11.0);
    const avenaMod = Money.fromDecimal(2.5);
    const extraShot = Money.fromDecimal(3.0);

    const total = latteBase.add(avenaMod).add(extraShot);
    expect(total.toDecimal()).toBe(16.5);
    expect(total.format()).toBe('S/ 16.50');
  });

  it('debe calcular vuelto o cambio correctamente', () => {
    const totalOrder = Money.fromDecimal(21.5);
    const tenderedCash = Money.fromDecimal(50.0);

    const changeDue = tenderedCash.subtract(totalOrder);
    expect(changeDue.toDecimal()).toBe(28.5);
    expect(changeDue.format()).toBe('S/ 28.50');
  });

  it('debe multiplicar cantidades de modificadores correctamente', () => {
    const syrupShot = Money.fromDecimal(2.0);
    const tripleShot = syrupShot.multiply(3);

    expect(tripleShot.toDecimal()).toBe(6.0);
    expect(tripleShot.toCents()).toBe(600);
  });

  it('debe prevenir operaciones entre monedas diferentes', () => {
    const soles = Money.fromDecimal(10.0, 'PEN');
    const dollars = Money.fromDecimal(10.0, 'USD');

    expect(() => soles.add(dollars)).toThrow('No se pueden operar monedas distintas');
  });
});
