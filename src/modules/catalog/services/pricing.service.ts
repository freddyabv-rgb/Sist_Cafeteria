import { Injectable } from '@nestjs/common';
import { Money } from '@shared/types/money';
import { ProductVariant } from '../domain/product.entity';
import { ModifierOption } from '../domain/modifier.entity';

export interface SelectedModifierInput {
  option: ModifierOption;
  groupName: string;
  quantity: number;
}

export interface CalculatedItemPrice {
  basePrice: Money;
  modifiersTotal: Money;
  unitPrice: Money;
  quantity: number;
  totalPrice: Money;
  subtotalTaxable: Money;
  taxAmount: Money;
  modifiersSnapshot: Array<{
    modifierOptionId: string;
    groupName: string;
    optionName: string;
    quantity: number;
    priceDelta: number;
    highlightKds: boolean;
  }>;
}

@Injectable()
export class PricingService {
  /**
   * Tasa de IGV en Perú (18%).
   * En venta minorista al consumidor (B2C), los precios de carta ya incluyen IGV.
   */
  private readonly TAX_RATE = 0.18;

  /**
   * Calcula el precio unitario y total de un ítem con sus modificadores.
   * Genera los snapshots inmutables para guardar en la base de datos de ventas.
   */
  public calculateItem(
    variant: ProductVariant,
    selectedModifiers: SelectedModifierInput[],
    quantity: number = 1,
    isTaxable: boolean = true,
  ): CalculatedItemPrice {
    let modifiersTotal = Money.zero(variant.price.currency);
    const modifiersSnapshot: CalculatedItemPrice['modifiersSnapshot'] = [];

    for (const item of selectedModifiers) {
      const optionCost = item.option.priceDelta.multiply(item.quantity);
      modifiersTotal = modifiersTotal.add(optionCost);

      modifiersSnapshot.push({
        modifierOptionId: item.option.id,
        groupName: item.groupName,
        optionName: item.option.name,
        quantity: item.quantity,
        priceDelta: item.option.priceDelta.toDecimal(),
        highlightKds: item.option.highlightKds,
      });
    }

    const unitPrice = variant.price.add(modifiersTotal);
    const totalPrice = unitPrice.multiply(quantity);

    let subtotalTaxable = totalPrice;
    let taxAmount = Money.zero(totalPrice.currency);

    if (isTaxable) {
      // Precio con IGV incluido: Subtotal = Total / 1.18, IGV = Total - Subtotal
      const totalDecimal = totalPrice.toDecimal();
      const subtotalDecimal = Math.round((totalDecimal / (1 + this.TAX_RATE)) * 100) / 100;
      const taxDecimal = Math.round((totalDecimal - subtotalDecimal) * 100) / 100;

      subtotalTaxable = Money.fromDecimal(subtotalDecimal, totalPrice.currency);
      taxAmount = Money.fromDecimal(taxDecimal, totalPrice.currency);
    }

    return {
      basePrice: variant.price,
      modifiersTotal,
      unitPrice,
      quantity,
      totalPrice,
      subtotalTaxable,
      taxAmount,
      modifiersSnapshot,
    };
  }
}
