/**
 * Tokens de diseño e identidad visual de marca para BENEVENTO (Heladería - Pastelería - Cafetería).
 * Utilizado por el POS, KDS y plantillas de comprobantes de impresión.
 */
export const BeneventoTokens = {
  brand: {
    name: 'BENEVENTO',
    tagline: 'Heladería - Pastelería',
    legalName: 'Benevento Gelato & Pastelería S.A.C.',
  },
  colors: {
    // Paleta Oficial extraída de la guía de marca Benevento
    primaryCyan: '#00B4D8',      // Óvalo del logo Benevento y acciones de cobro primarias
    primaryCyanHover: '#0096B7', // Hover/Active táctil
    aquaPastel: '#7FBCC6',       // Elemento izquierdo de la paleta: Categorías y tags
    slateTeal: '#566F75',        // Elemento central: Pizarra azulado para encabezados y botones secundarios
    neutralGrey: '#CBCDCE',      // Elemento derecho: Bordes, divisores y elementos inactivos
    surfaceCream: '#F8F7F4',     // Fondo general cálido (ambiente pastelería/gelato)
    slateDark: '#1E292E',        // Texto de alto contraste para lectura táctil en mostrador
    pureWhite: '#FFFFFF',        // Fondo de tarjetas de producto
  },
  statusColors: {
    success: '#10B981',          // Pedido pagado / Caja cuadrada
    warning: '#F59E0B',          // Preparación barista (90 a 180s)
    danger: '#EF4444',           // Demora crítica (>180s) o anulación
    info: '#00B4D8',
  },
  kdsThresholds: {
    targetSeconds: 90,           // SLA de servicio rápido en mostrador
    warningSeconds: 180,         // Alerta amarilla
    dangerSeconds: 240,          // Alerta roja de demora excesiva
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
} as const;

export type BeneventoTheme = typeof BeneventoTokens;
