import { EscPosBuilder } from './escpos-builder';

export interface BaristaOrderItem {
  name: string;
  variantName: string;
  quantity: number;
  notes?: string;
  modifiers: Array<{
    optionName: string;
    quantity: number;
    highlightKds?: boolean;
  }>;
}

export interface BaristaSlipData {
  orderNumber: string;
  orderType: 'TAKEAWAY' | 'DINE_IN';
  timeStr: string;
  customerName?: string;
  items: BaristaOrderItem[];
}

/**
 * Genera la comanda física para la barra/barista en la Xprinter XP-80T.
 * Destaca el número de orden y modificadores críticos en tamaño grande.
 */
export function buildBaristaSlip(data: BaristaSlipData): Buffer {
  const b = new EscPosBuilder();

  b.align('center')
    .bold(true)
    .size('double_size')
    .line(`*** ${data.orderNumber} ***`)
    .size('normal')
    .line(data.orderType === 'TAKEAWAY' ? '[ PARA LLEVAR ]' : '[ CONSUMO EN BARRA/LOCAL ]')
    .line(`HORA: ${data.timeStr}${data.customerName ? ` | ${data.customerName}` : ''}`)
    .divider('=');

  b.align('left');
  for (const item of data.items) {
    b.bold(true)
      .size('double_height')
      .line(`${item.quantity}x ${item.name} [${item.variantName}]`)
      .size('normal')
      .bold(false);

    for (const mod of item.modifiers) {
      const modText = mod.quantity > 1 ? `${mod.quantity}x ${mod.optionName}` : mod.optionName;
      if (mod.highlightKds) {
        // Modificador crítico (ej. LECHE VEGETAL / EXTRA SHOT) en negrita y doble altura
        b.bold(true).size('double_height').line(`  >> * ${modText.toUpperCase()} *`).size('normal').bold(false);
      } else {
        b.line(`   + ${modText}`);
      }
    }

    if (item.notes) {
      b.line(`   NOTA: ${item.notes}`);
    }
    b.divider('-');
  }

  b.feed(2).cutPaper();
  return b.toBuffer();
}
