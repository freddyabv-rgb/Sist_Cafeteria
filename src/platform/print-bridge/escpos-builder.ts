/**
 * Generador de comandos ESC/POS calibrado para impresoras térmicas Xprinter XP-80T (80mm).
 * Ancho estándar: 48 caracteres en Fuente A.
 */
export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  /** Inicializa la impresora (borra buffer, resetea modos) */
  public init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @
    return this;
  }

  /** Alineación de texto: 0=Izquierda, 1=Centro, 2=Derecha */
  public align(alignment: 'left' | 'center' | 'right'): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, code); // ESC a n
    return this;
  }

  /** Activa o desactiva negrita */
  public bold(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0); // ESC E n
    return this;
  }

  /** Establece tamaño de texto: normal, doble altura, o doble tamaño (altura + ancho) */
  public size(size: 'normal' | 'double_height' | 'double_size'): this {
    let mode = 0x00;
    if (size === 'double_height') mode = 0x01; // Altura doble
    if (size === 'double_size') mode = 0x11;   // Altura y anchura doble (ideal para N° Pedido y modificadores)
    this.buffer.push(0x1d, 0x21, mode); // GS ! n
    return this;
  }

  /** Agrega texto plano */
  public text(content: string): this {
    const encoded = Buffer.from(content, 'latin1');
    for (const byte of encoded) {
      this.buffer.push(byte);
    }
    return this;
  }

  /** Agrega una línea con salto de línea */
  public line(content: string = ''): this {
    this.text(content);
    this.buffer.push(0x0a); // LF
    return this;
  }

  /** Imprime una línea divisoria discontinua de 48 caracteres (ancho 80mm) */
  public divider(char: string = '-'): this {
    const line = char.repeat(48);
    return this.line(line);
  }

  /**
   * Imprime dos columnas justificadas (ej. Producto a la izquierda, Precio a la derecha)
   * adaptado a 48 columnas de la XP-80T.
   */
  public twoColumns(left: string, right: string, totalWidth: number = 48): this {
    const spacesNeeded = totalWidth - left.length - right.length;
    if (spacesNeeded <= 0) {
      const truncatedLeft = left.substring(0, totalWidth - right.length - 1);
      return this.line(`${truncatedLeft} ${right}`);
    }
    const spaces = ' '.repeat(spacesNeeded);
    return this.line(`${left}${spaces}${right}`);
  }

  /** Avanza 'lines' líneas en blanco */
  public feed(lines: number = 3): this {
    this.buffer.push(0x1b, 0x64, lines); // ESC d n
    return this;
  }

  /** Envía pulso eléctrico al conector RJ11 para abrir el cajón portamonedas */
  public kickCashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa); // ESC p 0 25 250
    return this;
  }

  /** Realiza corte automático de papel */
  public cutPaper(partial: boolean = false): this {
    this.feed(3);
    this.buffer.push(0x1d, 0x56, partial ? 0x01 : 0x00); // GS V n
    return this;
  }

  /** Retorna el buffer de bytes listo para enviar al puerto RAW TCP 9100 o USB */
  public toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }
}
