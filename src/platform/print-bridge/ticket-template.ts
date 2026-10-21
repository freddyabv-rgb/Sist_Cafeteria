import { EscPosBuilder } from './escpos-builder';
import { BeneventoTokens } from '../theme/benevento-tokens';

export interface CustomerReceiptData {
  orderNumber: string;
  orderType: 'TAKEAWAY' | 'DINE_IN';
  dateStr: string;
  cashierName: string;
  customerName?: string;
  items: Array<{
    name: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers?: string[];
  }>;
  subtotal: number;
  taxIgv: number;
  total: number;
  paymentMethod: string;
  cashTendered?: number;
  changeDue?: number;
}

/**
 * Genera el buffer ESC/POS para el ticket interno de venta de BENEVENTO (Xprinter XP-80T).
 */
export function buildCustomerReceipt(data: CustomerReceiptData): Buffer {
  const b = new EscPosBuilder();

  // Encabezado de Marca Benevento
  b.align('center')
    .bold(true)
    .size('double_size')
    .line(BeneventoTokens.brand.name)
    .size('normal')
    .line(BeneventoTokens.brand.tagline)
    .line(BeneventoTokens.brand.legalName)
    .divider('=')
    .line('TICKET DE VENTA (CONTROL INTERNO)')
    .line(`NRO PEDIDO: ${data.orderNumber}`)
    .line(`MODALIDAD: ${data.orderType === 'TAKEAWAY' ? 'PARA LLEVAR' : 'CONSUMO EN LOCAL'}`)
    .line(`FECHA: ${data.dateStr} | CAJERO: ${data.cashierName}`)
    .divider('-');

  if (data.customerName) {
    b.align('left').line(`CLIENTE: ${data.customerName}`).divider('-');
  }

  // Detalle de Ítems
  b.align('left');
  for (const item of data.items) {
    const itemTitle = `${item.quantity}x ${item.name} (${item.variantName})`;
    const priceStr = `S/ ${item.totalPrice.toFixed(2)}`;
    b.twoColumns(itemTitle, priceStr);

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        b.line(`   + ${mod}`);
      }
    }
  }

  b.divider('-');

  // Totales Financieros
  b.twoColumns('SUBTOTAL (OP. GRAVADA):', `S/ ${data.subtotal.toFixed(2)}`);
  b.twoColumns('I.G.V. (18% INCLUIDO):', `S/ ${data.taxIgv.toFixed(2)}`);
  b.bold(true).size('double_height');
  b.twoColumns('TOTAL A PAGAR:', `S/ ${data.total.toFixed(2)}`);
  b.size('normal').bold(false);
  b.divider('-');

  // Desglose de Pago
  b.twoColumns('MEDIO DE PAGO:', data.paymentMethod);
  if (data.cashTendered !== undefined && data.changeDue !== undefined) {
    b.twoColumns('EFECTIVO ENTREGADO:', `S/ ${data.cashTendered.toFixed(2)}`);
    b.twoColumns('VUELTO / CAMBIO:', `S/ ${data.changeDue.toFixed(2)}`);
  }

  // Pie de ticket
  b.divider('=')
    .align('center')
    .line('¡Gracias por disfrutar de Benevento!')
    .line('Válido para canje o reclamo el mismo día')
    .cutPaper();

  return b.toBuffer();
}

export interface PreBillReceiptData {
  tableNumber: string;
  tabNumber?: string;
  dateStr: string;
  waiterName: string;
  customerName?: string;
  paxCount: number;
  items: Array<{
    name: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers?: string[];
  }>;
  subtotal: number;
  taxIgv: number;
  total: number;
  suggestedTip10: number;
  totalWithTip: number;
}

/**
 * Genera el buffer ESC/POS para la Pre-cuenta (Estado de Mesa) en la Xprinter XP-80T.
 * No es un comprobante tributario, sino un ticket informativo de consumo para el comensal.
 */
export function buildPreBillReceipt(data: PreBillReceiptData): Buffer {
  const b = new EscPosBuilder();

  b.align('center')
    .bold(true)
    .size('double_size')
    .line(BeneventoTokens.brand.name)
    .size('normal')
    .line(BeneventoTokens.brand.tagline)
    .divider('=')
    .bold(true)
    .line('*** PRE-CUENTA DE MESA ***')
    .bold(false)
    .line('DOCUMENTO NO TRIBUTARIO / CONTROL INTERNO')
    .line(`MESA: ${data.tableNumber} | PERSONAS: ${data.paxCount}`)
    .line(`MOZO: ${data.waiterName} | FECHA: ${data.dateStr}`)
    .divider('-');

  if (data.customerName) {
    b.align('left').line(`CLIENTE / REF: ${data.customerName}`).divider('-');
  }

  // Detalle de consumos acumulados
  b.align('left');
  for (const item of data.items) {
    const itemTitle = `${item.quantity}x ${item.name} (${item.variantName})`;
    const priceStr = `S/ ${item.totalPrice.toFixed(2)}`;
    b.twoColumns(itemTitle, priceStr);

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        b.line(`   + ${mod}`);
      }
    }
  }

  b.divider('-');

  // Subtotales y Total
  b.twoColumns('SUBTOTAL GRAVADO:', `S/ ${data.subtotal.toFixed(2)}`);
  b.twoColumns('I.G.V. (18% INCLUIDO):', `S/ ${data.taxIgv.toFixed(2)}`);
  b.bold(true).size('double_height');
  b.twoColumns('TOTAL CONSUMO:', `S/ ${data.total.toFixed(2)}`);
  b.size('normal').bold(false);
  b.divider('-');

  // Sugerencia de Propina voluntaria 10%
  b.twoColumns('PROPINA SUGERIDA (10%):', `S/ ${data.suggestedTip10.toFixed(2)}`);
  b.bold(true);
  b.twoColumns('TOTAL C/ PROPINA SUG.:', `S/ ${data.totalWithTip.toFixed(2)}`);
  b.bold(false);

  // Pie
  b.divider('=')
    .align('center')
    .line('La propina es 100% voluntaria para el personal.')
    .line('Por favor acérquese a caja o solicite su POS.')
    .line('¡Esperamos que haya tenido una grata experiencia!')
    .cutPaper();

  return b.toBuffer();
}
