import { EscPosBuilder } from '../src/platform/print-bridge/escpos-builder';
import { buildCustomerReceipt, CustomerReceiptData } from '../src/platform/print-bridge/ticket-template';
import { buildBaristaSlip, BaristaSlipData } from '../src/platform/print-bridge/barista-ticket-template';

describe('Print Bridge — Xprinter XP-80T (80mm ESC/POS)', () => {
  it('debe generar secuencias binarias estándar de inicialización, corte y apertura de gaveta', () => {
    const builder = new EscPosBuilder();
    builder.kickCashDrawer().cutPaper();

    const buffer = builder.toBuffer();

    // Verificación de Opcode ESC @ (0x1B, 0x40) de inicialización
    expect(buffer[0]).toBe(0x1b);
    expect(buffer[1]).toBe(0x40);

    // Verificación de Opcode ESC p 0 25 250 (0x1B, 0x70, 0x00, 0x19, 0xFA) apertura de cajón RJ11
    const kickIndex = buffer.indexOf(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
    expect(kickIndex).toBeGreaterThan(-1);

    // Verificación de Opcode GS V 0 (0x1D, 0x56, 0x00) corte completo de papel
    const cutIndex = buffer.indexOf(Buffer.from([0x1d, 0x56, 0x00]));
    expect(cutIndex).toBeGreaterThan(-1);
  });

  it('debe generar el ticket de cliente con la marca BENEVENTO y cálculo de IGV 18%', () => {
    const receiptData: CustomerReceiptData = {
      orderNumber: 'C1-0042',
      orderType: 'TAKEAWAY',
      dateStr: '2026-10-11 10:15',
      cashierName: 'María G.',
      customerName: 'Carlos Mendoza',
      items: [
        {
          name: 'Latte',
          variantName: '12oz',
          quantity: 1,
          unitPrice: 13.0,
          totalPrice: 15.5,
          modifiers: ['Leche de Avena (+S/ 2.50)'],
        },
        {
          name: 'Croissant de Almendras',
          variantName: 'Unidad',
          quantity: 1,
          unitPrice: 9.0,
          totalPrice: 9.0,
        },
      ],
      subtotal: 20.76,
      taxIgv: 3.74,
      total: 24.5,
      paymentMethod: 'EFECTIVO',
      cashTendered: 50.0,
      changeDue: 25.5,
    };

    const buffer = buildCustomerReceipt(receiptData);
    const textOutput = buffer.toString('latin1');

    expect(textOutput).toContain('BENEVENTO');
    expect(textOutput).toContain('Heladería - Pastelería');
    expect(textOutput).toContain('C1-0042');
    expect(textOutput).toContain('PARA LLEVAR');
    expect(textOutput).toContain('Carlos Mendoza');
    expect(textOutput).toContain('Leche de Avena');
    expect(textOutput).toContain('S/ 24.50');
    expect(textOutput).toContain('S/ 25.50'); // Vuelto
  });

  it('debe generar la comanda de barista destacando modificadores críticos para la barra', () => {
    const slipData: BaristaSlipData = {
      orderNumber: 'C1-0042',
      orderType: 'TAKEAWAY',
      timeStr: '10:15:20',
      items: [
        {
          name: 'Latte',
          variantName: '12oz',
          quantity: 1,
          modifiers: [
            {
              optionName: 'Leche de Avena',
              quantity: 1,
              highlightKds: true,
            },
          ],
        },
      ],
    };

    const buffer = buildBaristaSlip(slipData);
    const textOutput = buffer.toString('latin1');

    expect(textOutput).toContain('*** C1-0042 ***');
    expect(textOutput).toContain('Latte [12oz]');
    expect(textOutput).toContain('* LECHE DE AVENA *');
  });
});
