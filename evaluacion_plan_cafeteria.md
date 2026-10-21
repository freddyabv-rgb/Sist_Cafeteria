# Evaluación del Plan de Desarrollo Modular — CoffeeOS

**Documento evaluado:** `plan_sistema_cafeteria.md`
**Objetivo de la evaluación:** detectar deficiencias y proponer mejoras para desarrollar el sistema **módulo por módulo, paso a paso**, validando cada entrega antes de pasar a la siguiente.

> Las referencias tipo *(L85-94)* apuntan a las líneas del plan original.
> Los puntos legales/tributarios están marcados como **por verificar**: confírmalos con tu contador o con la autoridad tributaria de tu país antes de decidir.

---

## 1. Resumen ejecutivo

**Veredicto:** el plan tiene una base sólida (buen conocimiento del negocio de cafetería, flujo Pay-First, arqueo ciego, monolito modular, eventos de dominio). Pero **hoy no está listo para ejecutarse paso a paso**, por tres razones:

1. **La Fase 1 es demasiado grande** para ser un primer paso: son 5 módulos, tiempo real, impresión, pagos mixtos y caja. No hay un primer entregable pequeño que se pueda probar en una cafetería real.
2. **El mecanismo que une los módulos (el bus de eventos) no es confiable tal como está descrito**: si el proceso se cae, se pierden eventos y, con ellos, ventas en caja, descuentos de stock o comprobantes fiscales.
3. **Faltan piezas operativas que una cafetería necesita desde el día 1**: anulaciones, devoluciones, descuentos, roles con permisos, auditoría, funcionamiento sin internet e impresión real desde el navegador.

### Los 8 puntos más importantes a corregir

| # | Problema | Severidad |
|---|---|---|
| 1 | Bus de eventos en memoria, sin *outbox*, sin reintentos, sin idempotencia | 🔴 Crítica |
| 2 | Comprobante fiscal diferido a Fase 3 sin confirmar la obligación legal; el modelo de datos no está preparado para facturar | 🔴 Crítica |
| 3 | Sin estrategia offline ni definición de dónde corre el sistema; la impresión ESC/POS desde un navegador no funciona sin un puente local | 🔴 Crítica |
| 4 | No hay anulaciones, devoluciones, descuentos, cortesías, roles ni auditoría en el MVP | 🔴 Crítica |
| 5 | Contradicciones en el flujo Pay-First ↔ KDS (¿`OrderCreated` o `OrderPaid`?) y en el enrutamiento por estación | 🔴 Crítica |
| 6 | Fase 1 monolítica y fases que mezclan módulos sin relación (Fase 3 y Fase 5) | 🟠 Alta |
| 7 | Falta el módulo de **Compras / Proveedores / Costos / Conteo físico**, del que dependen stock real y margen por taza | 🟠 Alta |
| 8 | Modelo de datos incompleto (sin `store_id`, entidades sin definir, sin *snapshots*, sin cantidad en modificadores) | 🟠 Alta |

---

## 2. Lo que el plan hace bien (conviene conservarlo)

- **Flujo Pay-First como predeterminado** y mesas/cuentas abiertas diferidas a una fase posterior.
- **Arqueo ciego** y cierre Z desglosado por medio de pago.
- **Modificadores como ciudadanos de primera clase** (leche, temperatura, endulzante, extras) con delta de precio.
- **Merma por calibración de molino**: detalle muy realista que evita descuadres "falsos".
- **Monolito modular** en vez de microservicios: decisión correcta para empezar.
- **Evento con datos "gordos"** (nombres de producto y modificadores dentro del evento): reduce la necesidad de consultar al POS desde otros módulos.
- **Modo contingencia fiscal** pensado (cola de reenvío).
- **Plan de verificación con escenarios E2E** reales (apertura, ráfaga, despacho, cierre).

---

## 3. Deficiencias detalladas

### 🔴 Críticas

#### C1. El bus de eventos no garantiza entrega

**Qué dice el plan:** bus interno con `@nestjs/event-emitter` *(L22, L414)*; la verificación pide que "el fallo de un suscriptor no bloquee la venta" *(L430)*.

**Problema:** `@nestjs/event-emitter` es **en memoria y en el mismo proceso**. Si el servidor se reinicia entre guardar el pago y procesar el evento, el evento **se pierde**. Y el plan hace que cosas críticas dependan de él: acumulación en caja *(L402)*, descuento de inventario *(L103)*, emisión fiscal *(L104)*. Además, "que no bloquee la venta" resuelve la disponibilidad, pero no dice **cómo se reprocesa** lo que falló.

**Mejora:**
- Aplicar el patrón **Transactional Outbox**: en la misma transacción que guarda orden + pago, se inserta una fila en una tabla `outbox_events`. Un *dispatcher* la lee y publica a los suscriptores.
- Cada suscriptor guarda en `processed_events(event_id, handler)` para ser **idempotente** (procesar dos veces el mismo evento no duplica el efecto).
- **Reintentos con backoff** y una cola de **eventos fallidos (dead-letter)** con pantalla/alerta de administración para reprocesar.
- Cambiar la prueba de verificación: no solo "no bloquea la venta", sino "**el evento fallido se reprocesa y el resultado final es correcto**".
- Las funciones que deben cuadrar al centavo (caja) **no deberían depender de eventos asíncronos** (ver C-A6).

#### C2. Fiscal diferido sin verificar la obligación legal; modelo no preparado para facturar

**Qué dice el plan:** Open Question 1 recomienda ticket interno en el MVP y activar facturación en Fase 3 *(L34-35)*.

**Problema:**
- En muchos países (y, **por verificar**, en Perú para la mayoría de negocios formales) emitir un ticket interno en lugar de un comprobante válido **no es legal** si el negocio está obligado a emitir comprobante electrónico. Salir a producción sin eso puede ser un bloqueo, no una optimización.
- Aunque se difiera la integración, el **modelo de datos de la Fase 1 no tiene lo necesario**: sin tipo de afectación del impuesto por línea, sin serie/correlativo propio, sin tipo de documento, sin datos del cliente en la orden *(L298-319)*. Agregarlos después sí sería una migración destructiva, contra lo que promete el plan *(L238)*.
- El número de pedido `C-0104` *(L301)* es un número operativo, **no** un correlativo fiscal.
- Mezcla de países: el plan cita SUNAT/AFIP/SAT/DIAN pero usa IGV, Yape y Plin: falta **decidir el país objetivo**.

**Mejora:**
1. Confirmar con el contador: ¿es obligatorio emitir comprobante desde la apertura? Tres salidas posibles:
   - **Obligatorio:** mover Fiscal **antes del piloto**, o usar un facturador externo/PSE y registrar solo la referencia.
   - **Piloto sin ventas reales** (pruebas internas): ticket interno es aceptable temporalmente.
   - **Ya factura con otro sistema:** el POS solo debe registrar "comprobante emitido externamente" (serie-número).
2. En Fase 1 agregar al modelo, aunque no se use todavía: `tax_code`/afectación por línea, `tax_amount` por línea, `document_type`, `document_series`, `document_number`, datos del cliente (tipo/número de documento) y regla de redondeo.
3. Definir **cálculo de impuesto por línea vs. por total**: da diferencias de centavos que luego rechazan los validadores fiscales.

#### C3. Sin estrategia offline, sin definición de despliegue, impresión sin puente

**Qué dice el plan:** PWA para "cacheo de catálogo" *(L416)*, WebSockets entre caja y barista *(L417)*, "librería ESC/POS" *(L418)*. El modo contingencia solo aparece en Fase 3 *(L204)*.

**Problemas:**
- No se dice si el backend está **en la nube** o en un **servidor local** de la cafetería. Si es nube y se cae internet, **no se puede vender ni despachar**. Una cafetería en hora pico no puede parar.
- El modo "el POS continúa cobrando sin internet" aparece en Fase 3, pero eso exige que el POS **ya nazca** con cola local, IDs generados en el cliente y numeración local. No se puede agregar en Fase 3 sin reescribir.
- **Un navegador/PWA no puede enviar ESC/POS directamente** a una impresora de red o USB. Hace falta un **puente de impresión** (servicio local, app Android, QZ Tray, WebUSB/Bluetooth según el hardware) o impresión desde un servidor en la misma red. El plan no lo menciona.

**Mejora:**
- Decidir y documentar uno de tres modelos: (a) nube con degradación offline limitada, (b) servidor local en la tienda con sincronización a la nube, (c) híbrido. Para una sola cafetería, **(b) o (c) suele ser más robusto**.
- Diseñar desde Fase 1: **IDs en el cliente (UUID)**, **`idempotency_key`** por operación, cola local (IndexedDB), reintentos de sincronización, numeración de pedido **por caja** (ej. `C1-0104`).
- Agregar un **componente "Print Bridge"** al diagrama de arquitectura y probarlo con la impresora real antes de construir más.
- El POS y el KDS deben **reconciliar estado al reconectar** el WebSocket (pedir el estado actual, no confiar solo en eventos en vivo).

#### C4. Faltan anulaciones, devoluciones, descuentos, roles y auditoría en el MVP

**Qué dice el plan:** el estado `CANCELLED` existe *(L304)* pero ningún módulo ni evento describe cómo se cancela algo ya pagado. Auth/Permisos aparece solo en el núcleo *(L52)*.

**Problemas (y todos ocurren el primer día):**
- El cliente cambia o devuelve una bebida **después de pagar**. ¿Qué pasa con la caja, el KDS, el stock futuro y el comprobante?
- No hay **descuentos, cortesías ni consumo de personal**, ni combos (café + croissant), muy comunes en cafeterías.
- No hay **roles** definidos (cajero, barista, supervisor, administrador) ni autorización por PIN para operaciones sensibles.
- No hay **registro de auditoría** (quién anuló, quién cambió precios, quién abrió el cajón). En control de efectivo es el principal control antifraude.
- El contrato de eventos solo tiene `OrderPaid`; sin `OrderCancelled`/`OrderRefunded`/`OrderVoided`, las fases 2, 3 y 5 **no pueden revertir** nada (stock, nota de crédito, sellos).

**Mejora:** agregar al MVP un módulo "**Correcciones y permisos**":
- Anulación antes de preparar / después de preparar; devolución parcial por ítem; motivo obligatorio.
- Descuento y cortesía con motivo; aprobación de supervisor por PIN.
- Roles y permisos mínimos + `audit_log` (usuario, acción, antes/después, fecha, dispositivo).
- Eventos `order.voided` y `order.refunded` desde el primer día.

#### C5. Contradicciones en el flujo Pay-First y el KDS

**Qué dice el plan:**
- Diagrama: el KDS consume `OrderCreated` *(L89)*. Texto: el KDS escucha `OrderCreatedEvent` *(L102)*.
- Pero el contrato de eventos lista `BaristaNotificationHandler` como suscriptor de `OrderPaidEvent` *(L398)*, "si no fue enviado previamente".
- `OrderReady` se publica *(L87)* pero **nadie lo consume**.
- El contrato pone `station` a nivel de **pedido** *(L368)*, pero en el catálogo es por **producto** *(L270)*; un pedido real tiene bebida (BARRA) y croissant (VITRINA). El KDS spec no usa ese campo.

**Problema:** en Pay-First, **no se debe preparar nada sin pago**. Si el KDS muestra pedidos creados pero no pagados, el barista prepara bebidas que quizá nunca se cobren. Y "si no fue enviado previamente" revela que el flujo no está decidido.

**Mejora:**
- Decisión explícita: el KDS **solo recibe pedidos pagados** (`order.paid`), salvo que el negocio decida "preparar antes de cobrar".
- Mover `station` a **cada ítem** del evento. El KDS muestra solo ítems de su estación; los ítems de vitrina se entregan al instante y no ocupan la cola.
- Definir cuándo un pedido pasa a `READY`: cuando **todas** sus estaciones terminaron.
- Definir quién consume `order.ready` (pantalla de llamado al cliente, notificación de pick-up en Fase 5) o eliminarlo.

---

### 🟠 Altas

#### A1. Fase 1 monolítica; fases que mezclan módulos independientes

- La Fase 1 *(L111-165)* reúne catálogo, POS, KDS, caja y reportes **más** tiempo real, impresión, pagos mixtos y turnos. Es lo que más riesgo concentra y no ofrece un punto de validación intermedio.
- **Fase 3** junta **Mesas** (necesidad operativa) y **Fiscal** (necesidad legal): tienen motivadores, plazos y dependencias distintos.
- **Fase 5** junta **Fidelización**, **Pedido anticipado/QR** y **BI**. El pick-up online introduce un **nuevo canal de ventas con pago en línea** (pasarela, conciliación, estados distintos); es un proyecto en sí mismo.
- La analítica básica de horas pico *(L231)* solo necesita `paid_at`: **ya está disponible desde la Fase 1**. No hay motivo para esperar a la Fase 5.
- Los "Módulos 1.1 a 1.5" son más bien **funcionalidades** que módulos entregables independientes (p. ej. el reporte 1.5 es una lectura de datos de otros módulos).

**Mejora:** ver la hoja de ruta propuesta en la sección 7.

#### A2. Falta el módulo de Compras, Proveedores, Costos y Conteo físico

El plan pasa de "vender" a "descontar por receta" *(L169-188)* sin explicar **cómo entra el stock** ni **cuánto cuesta**:

- Sin **recepción de mercadería**, el stock empieza en cero o se carga a mano.
- Sin **costo de compra** no hay **margen bruto por taza** *(L232)*; la Fase 5 depende de un dato que ningún módulo produce.
- Sin **conteo físico / inventario cíclico** y **ajustes**, el stock teórico se aleja del real en semanas.
- Sin **unidades y conversiones** (kg ↔ g, litro ↔ ml, bolsa de 1 kg), las recetas no pueden descontar bien.
- Falta política de **stock negativo** (el sistema nunca debe impedir una venta por un descuadre de inventario) y **lotes/vencimientos** para leche y pastelería.
- Faltan mermas más allá de la calibración: bebida rehecha, derrame, vencimiento, consumo de personal.

**Mejora:** agregar un módulo **"Compras y Costos"** dentro de la etapa de Stock: proveedores, entradas, costo promedio, kardex, ajustes, conteo físico.

#### A3. "Zero-Coupling" absoluto no es viable

**Qué dice el plan:** *"El POS NO debe saber que existen inventarios… ni tarjetas de puntos"* *(L98)*.

**Problema:** el POS **sí necesita** consultar algunas cosas de módulos futuros:
- **Disponibilidad**: marcar "agotado" cuando se acaba la leche de avena (stock) *(Fase 2)*.
- **Cliente identificado**: para sumar sellos en el momento de la venta (fidelización) *(Fase 5)*.
- **Descuentos/promociones** que modifican el total *antes* de cobrar.
- **Datos fiscales del cliente** antes de emitir *(Fase 3)*.

Un modelo 100% "eventos después del pago" no cubre decisiones que ocurren *antes* del pago.

**Mejora:** usar eventos para **efectos posteriores**, y **puertos (interfaces) explícitos** para consultas previas:
```
POS  ──consulta──>  AvailabilityPort   (Fase 1: flag manual "Agotado"; Fase 2: stock real)
POS  ──consulta──>  CustomerPort       (Fase 1: nulo; Fase 5: fidelización)
POS  ──consulta──>  PricingAdjustmentsPort (descuentos/promos)
```
En Fase 1, cada puerto tiene una implementación "vacía" o manual; luego se reemplaza **sin tocar el POS**. Eso sí cumple la promesa de "bloque de Lego".

#### A4. Modelo de datos incompleto o frágil

Observaciones sobre el diagrama ER *(L240-348)*:

| Hallazgo | Impacto | Corrección |
|---|---|---|
| Sin `store_id` / `tenant_id` en ninguna tabla | Multi-sucursal exige migración destructiva, contra lo que promete el plan *(L23, L238)* | Incluir `store_id` desde el día 1 (aunque haya una sola tienda) o declarar explícitamente "single-store" |
| `CASH_TRANSACTION` y `PRODUCT_MODIFIER_GROUP` aparecen en relaciones *(L244-248)* pero **no están definidas** | Modelo imposible de implementar | Definirlas con campos |
| `ORDER_ITEM` y `ORDER_ITEM_MODIFIER` solo guardan **FK**, no el nombre | Si cambias el nombre o precio del catálogo, el histórico cambia | Guardar **snapshot** (`product_name`, `variant_name`, `option_name`, `tax_*`) |
| `ORDER_ITEM_MODIFIER` sin `quantity` | "Doble shot" o "2 jarabes" no se representa; Fase 2 no sabe cuánto descontar | Agregar `quantity` |
| `ORDER` sin `payment_status`, `channel`, `customer_id`, `discount_total`, `tip_total`, `store_id`, `register_id` | No se puede distinguir pedido pagado/sin pagar ni canal POS/QR/App | Agregar campos y estados (`UNPAID`, `PAID`, `REFUNDED`, `VOIDED`) |
| `ORDER_ITEM` sin estado propio ni estación | Anulación parcial y KDS por estación imposibles | `status`, `station`, `void_reason` por ítem |
| `PAYMENT` sin estado, referencia externa ni propina | No se puede conciliar Yape/tarjeta ni registrar propinas | `status`, `provider`, `reference` (nº de operación), `tip_amount` |
| `REGISTER_SHIFT` sin `register_id`, `closed_by`, `difference`, `store_id` | Imposible tener 2 cajas; la diferencia del arqueo no se guarda | Agregar campos; calcular `expected_cash` y guardar el **snapshot** al cierre |
| Faltan entidades: `USER`, `ROLE`, `STORE`, `REGISTER`, `TAX`, `CUSTOMER`, `AUDIT_LOG`, `OUTBOX_EVENT` | Funcionalidad base sin soporte | Añadir al núcleo |
| Montos como `decimal` sin precisión definida | Errores de redondeo | Definir `numeric(12,2)` o enteros en céntimos + clase `Money` |
| FKs directas entre contextos (`ORDER_ITEM → PRODUCT_VARIANT`, `ORDER → REGISTER_SHIFT`) | Acopla esquemas; dificulta la extracción futura | Referenciar por ID **sin FK física entre módulos** o aceptar el acoplamiento de forma consciente |

#### A5. Contrato del evento `OrderPaid` inconsistente e incompleto

*(L356-394)*

- **Enum de pago distinto**: el evento usa `CASH | CARD | DIGITAL_WALLET` *(L384)* y el ER usa `CASH | CARD | YAPE_PLIN | TRANSFER` *(L331)*.
- `eventType: 'ORDER_PAID'` vs nombre de clase `OrderPaidEvent` vs `OrderPaid`: elegir una convención (ej. `order.paid.v1`).
- Faltan metadatos: `schemaVersion`, `storeId`, `registerId`, `shiftId`, `cashierId`, `correlationId`, `occurredAt` en UTC.
- Faltan campos monetarios: `discount`, `tip`, `currency`, ajuste de redondeo, impuesto **por línea**.
- `modifiers` sin `quantity` (ver A4).
- `station` a nivel pedido (ver C5).
- `customerDoc` solo admite `DNI | RUC`: restringe por país.
- No hay eventos de **reversa** (C4) ni de **cierre de turno** (`shift.closed`), que sirven a Fiscal/BI.

Ver propuesta de contrato corregido en la sección 6.

#### A6. Módulo de caja: dos fuentes de verdad y conceptos mal ubicados

- **Doble fuente de verdad:** `CashShiftHandler` "acumula el ingreso" por evento *(L402)*, pero las tablas `PAYMENT` y `ORDER` ya relacionan con `REGISTER_SHIFT`. Si el evento falla o llega duplicado, la caja **no cuadra**.
  - **Mejora:** calcular el efectivo esperado **a partir de `PAYMENT` y `CASH_TRANSACTION`** dentro de la misma transacción (consulta/vista), no por acumulación asíncrona.
- **Propinas como "salida de caja"** *(L158)*: conceptualmente es incorrecto. Una propina cobrada **no es un gasto**; es dinero de terceros que se retiene y se reparte.
  - **Mejora:** modelar propinas como parte del pago (`tip_amount`) y tener un reporte de reparto.
- Faltan: **retiros parciales de efectivo (cash drops)**, **traspaso de turno entre cajeros**, **ajuste por diferencia** con aprobación, **varias cajas**, y **conciliación de tarjeta/Yape** (el POS de tarjeta es externo *(L143)*, por lo que hay doble digitación y riesgo de descuadre).
- El plan usa "Turnos" en el núcleo *(L53)* y "Caja & Arqueos" en Fase 1 *(L61)*: definir **a quién pertenece** el turno de caja para evitar duplicidad.

#### A7. Los límites entre módulos no están protegidos

- Un módulo de NestJS **no impide** que otro importe sus clases. Sin reglas automáticas, en 3 meses habrá imports cruzados y el "bloque de Lego" será un monolito enredado.
- El plan afirma que los módulos pueden extraerse como microservicios "**sin cambiar su lógica de negocio**" *(L23)*. Es optimista: cambian transacciones, consistencia, manejo de fallos y latencia. Conviene presentarlo como objetivo, no como garantía.

**Mejora:**
- Cada módulo expone una **API pública** (`index.ts`); todo lo demás es privado.
- Regla automática con `dependency-cruiser`, `eslint-plugin-boundaries` o Nx: **CI falla si hay import prohibido**.
- Un **`shared-kernel`** mínimo (Money, StoreId, DomainEvent, tipos base) y nada más.
- Esquema/prefijo de tablas por módulo (`catalog_*`, `sales_*`, `cash_*`).

---

### 🟡 Medias

#### M1. KDS de barista
- Los umbrales de color (verde < 2 min, amarillo 2-4, rojo > 4) *(L148-151)* **no coinciden con el objetivo de 90-180 s** que el propio plan declara *(L5)*. Un pedido a 3,5 min ya estaría fuera de objetivo y seguiría "amarillo".
  - Hacerlos **configurables por tienda y por tipo de producto** (un cold brew no tarda igual que un latte).
- Definir **desde cuándo** corre el cronómetro (`paid_at`) y registrar tiempos de inicio/fin para el análisis posterior.
- Existe el estado `PREPARING` *(L304)*, pero el KDS no tiene la acción "Comenzar".
- **Color como único indicador** no es accesible (daltonismo, reflejos de luz): agregar icono/texto.
- Resaltar modificadores por **atributo configurable** (`highlight`, `allergen_tag`) y no escribir "LECHE DE AVENA" fijo en el código; además la avena no necesariamente es un alérgeno: modelar alérgenos como etiquetas del catálogo.
- Sin pantalla/llamado de **cliente** (número listo para retirar).

#### M2. Stack tecnológico
- **Next.js** *(L416)* aporta poco para un POS/KDS (no hay SEO ni SSR necesario) y añade complejidad. Un **SPA/PWA con Vite + React** es más simple. Dejar Next.js solo si luego se hace carta web pública.
- "**Prisma / TypeORM**" *(L415)*: elegir **uno**. Cambiar de ORM después es costoso.
- "**JSONB para flexibilidad de modificadores**" contradice el modelo relacional de modificadores *(L321)*. Decidir una sola fuente: relacional para el pedido; JSONB solo para configuración opcional.
- **Socket.io**: definir reconexión, *acks* y resincronización (ver C3).
- Faltan: cola de trabajos (`BullMQ`/`pg-boss`) para outbox y reintentos, observabilidad (logs, métricas, alertas), estrategia de respaldo.

#### M3. Plan de verificación insuficiente
*(L422-443)*
- Los escenarios **no tienen valores esperados**: "cambio calculado" y "cuadre exactamente" no son verificables. Escribir los números: ejemplo, fondo S/ 100 + ventas en efectivo − S/ 15 de hielo = efectivo esperado **X**.
- Faltan **casos negativos**: pago insuficiente, cierre con diferencia, doble clic en "Cobrar", pérdida de red a mitad de pago, anulación después de pagar, cierre sin turno abierto.
- Faltan pruebas de **concurrencia** (dos cajas cerrando, numeración de pedidos simultánea), **idempotencia de eventos**, **reconexión del KDS** y una **prueba de carga** simulando hora pico (decenas de pedidos en pocos minutos).
- Faltan pruebas de **impresión real** con el hardware elegido.
- Falta **criterio de aceptación por módulo** y una **prueba piloto con baristas reales** (un POS que el barista no entiende en 10 segundos fracasa aunque pase todas las pruebas técnicas).

#### M4. Recetas, modificadores y unidades *(Fase 2)*
El ejemplo "descuenta 18 g de café, 220 ml de leche de avena…" *(L103)* oculta decisiones no resueltas:
- Receta **por variante** (8/12/16 oz) **y** por modificador: "Leche de avena" **reemplaza** la leche base; "Shot extra" **suma** 9 g; "Sin espuma" no cambia nada.
- Se necesita un modelo de **reglas de consumo por modificador** (sustitución, suma, multiplicador) y la `quantity` del modificador (ver A4).
- Definir qué hacer si el producto **no tiene receta** (no bloquear la venta, registrar alerta).
- Descuento **al pagar** vs **al preparar**: afecta anulaciones y bebidas rehechas.

#### M5. Idempotencia y numeración
- Un doble toque o un reintento por mala señal puede **crear dos pedidos o dos pagos**. Todo comando de escritura debe aceptar `idempotency_key`.
- El número de pedido `C-0104` necesita regla clara: por día, por caja, reinicio diario, y sin colisiones con la numeración offline.

#### M6. Falta una "Fase 0" y temas transversales
No aparecen: **despliegue** (dónde se hospeda, CI/CD, entornos de prueba/producción), **respaldos y recuperación**, **observabilidad**, **migración/carga inicial del catálogo** (importar desde CSV/Excel), **capacitación del personal**, **plan de contingencia manual** (qué hace el cajero si el sistema falla: formato en papel), **gestión de actualizaciones sin cerrar la tienda**.

#### M7. Datos personales y canales online *(Fase 5)*
- Fidelización por teléfono/QR implica **datos personales**: consentimiento, finalidad, derecho de acceso/eliminación (**por verificar** la ley de protección de datos de tu país).
- El pick-up online exige: pasarela de pago, conciliación, campo `channel` en la orden, estados nuevos (pagado online, aceptado, listo), y manejo de cancelaciones.

---

### ⚪ Bajas

- **B1.** Afirmaciones sin sustento: "representa el 80% de la dinámica" *(L27)* y "90 a 180 segundos" *(L5)*. Marcarlas como **supuestos a validar** con la cafetería real.
- **B2.** Las "Open Questions" *(L31-39)* traen recomendaciones, pero **no son decisiones tomadas**. Convertirlas en una lista de decisiones con responsable y fecha (sección 9).
- **B3.** Nomenclatura mezclada (`OrderPaidEvent`, `ORDER_PAID`, `OrderPaid`; "faja"/"fajilla"). Unificar.
- **B4.** Si un producto es de tercero y otro es propio, el flujo de vitrina vs. obrador *(L38-39)* se define "después", pero el catálogo ya necesita un campo `source` (propio/tercero) y `tracking_mode` (por unidad/por receta/sin control).
- **B5.** Faltan **impresiones de cliente** opcionales (ticket vs. sin ticket), y la **pantalla de llamado de pedidos listos**.

---

## 4. Inconsistencias internas (resumen rápido)

| Parte A | Parte B | Qué corregir |
|---|---|---|
| KDS consume `OrderCreated` (L89, L102) | `BaristaNotificationHandler` consume `OrderPaid` (L398) | Elegir `order.paid` |
| `station` por producto (L270) | `station` por pedido en el evento (L368) | Mover a ítem |
| Pago `YAPE_PLIN \| TRANSFER` (L331) | Pago `DIGITAL_WALLET` (L384) | Un solo enum |
| Caja suma por evento (L402) | `PAYMENT` ya enlaza al turno (L248, L253) | Calcular desde datos |
| "Turnos" en núcleo (L53) | "Caja & Arqueos" en Fase 1 (L61) | Definir dueño |
| Propinas como salida de caja (L158) | Propina es ingreso de terceros | Modelar en pago |
| Contingencia offline en Fase 3 (L204) | POS sin soporte offline en Fase 1 | Diseñar offline desde Fase 1 |
| `CASH_TRANSACTION` / `PRODUCT_MODIFIER_GROUP` en relaciones | No definidas en entidades | Completar ER |
| `OrderReady` publicado (L87) | Nadie lo consume | Asignar consumidor o quitar |
| Margen por taza (L232) | Ningún módulo registra costos | Módulo de Compras y Costos |

---

## 5. Mejoras concretas al modelo de datos (Fase 1)

Agregar o modificar (en cursiva lo opcional si hay una sola sucursal):

**Núcleo**
- `STORE(id, name, tax_id, timezone, currency)`
- `REGISTER(id, store_id, name, is_active)`
- `USER(id, store_id, name, pin_hash, is_active)` · `ROLE` · `USER_ROLE` · `PERMISSION`
- `AUDIT_LOG(id, store_id, user_id, action, entity, entity_id, before, after, created_at, device)`
- `OUTBOX_EVENT(id, event_type, payload, created_at, published_at, attempts, last_error)`
- `PROCESSED_EVENT(event_id, handler, processed_at)`

**Catálogo**
- `PRODUCT`: agregar `source` (OWN/THIRD_PARTY), `tracking_mode`, `tax_code`, `is_available` (agotado manual), `allergen_tags`.
- `MODIFIER_OPTION`: agregar `code`, `highlight` (para KDS), `max_quantity`.
- Definir `PRODUCT_MODIFIER_GROUP(product_id, modifier_group_id, display_order)`.

**Ventas**
- `ORDER`: `store_id`, `register_id`, `channel`, `payment_status`, `customer_id?`, `discount_total`, `tip_total`, `rounding_adjustment`, `paid_at`, `idempotency_key`, `void_reason?`.
- `ORDER_ITEM`: `product_name`, `variant_name`, `station`, `status`, `tax_code`, `tax_amount`, `discount_amount`, `void_reason?`.
- `ORDER_ITEM_MODIFIER`: `option_name`, `group_name`, `quantity`.
- `PAYMENT`: `status`, `provider`, `reference`, `tip_amount`, `idempotency_key`.
- `REFUND(id, order_id, payment_id, amount, reason, approved_by, created_at)`.

**Caja**
- `REGISTER_SHIFT`: `store_id`, `register_id`, `closed_by`, `difference`, `expected_cash_snapshot`, `approved_by` (si hay diferencia).
- `CASH_TRANSACTION(id, shift_id, type[EXPENSE|DROP|FLOAT_IN], amount, reason, approved_by, created_at)`.

---

## 6. Contrato de evento mejorado (propuesta)

```typescript
// Sobre común a TODOS los eventos de dominio
interface DomainEvent<TPayload> {
  eventId: string;          // UUID; clave de idempotencia
  eventType: string;        // 'order.paid'  (convención: dominio.accion)
  schemaVersion: number;    // 1, 2, ... para evolucionar sin romper suscriptores
  occurredAt: string;       // ISO 8601 en UTC
  storeId: string;
  correlationId: string;    // agrupa toda la operación (venta, cobro, impresión)
  causationId?: string;     // evento que originó este
  actor: { userId: string; registerId?: string };
  payload: TPayload;
}

interface OrderPaidPayload {
  orderId: string;
  orderNumber: string;
  shiftId: string;
  channel: 'POS' | 'QR' | 'APP';
  orderType: 'TAKEAWAY' | 'DINE_IN';
  currency: string;
  customer?: { id?: string; name?: string; docType?: string; docNumber?: string };
  items: Array<{
    orderItemId: string;
    variantId: string;
    productName: string;
    variantName: string;
    station: 'BARRA' | 'COCINA' | 'VITRINA';   // POR ÍTEM
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxCode: string;
    taxAmount: number;
    modifiers: Array<{
      modifierOptionId: string;
      groupName: string;
      optionName: string;
      quantity: number;
      priceDelta: number;
    }>;
  }>;
  payments: Array<{
    paymentId: string;
    method: 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'TRANSFER';
    provider?: string;     // 'YAPE', 'PLIN', 'VISA'...
    reference?: string;
    amount: number;
    tipAmount?: number;
  }>;
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    roundingAdjustment: number;
    total: number;
  };
}

// Eventos que faltan desde el día 1
type OrderVoided   = DomainEvent<{ orderId: string; itemIds?: string[]; reason: string; approvedBy?: string }>;
type OrderRefunded = DomainEvent<{ orderId: string; refundId: string; amount: number; items?: string[]; reason: string }>;
type OrderReady    = DomainEvent<{ orderId: string; stationsReady: string[] }>;
type ShiftClosed   = DomainEvent<{ shiftId: string; expectedCash: number; declaredCash: number; difference: number }>;
```

**Reglas del contrato**
1. Los eventos son **inmutables y versionados**; se agregan campos, no se cambian los existentes.
2. Todo suscriptor es **idempotente** (usa `eventId`).
3. Test de contrato por cada suscriptor: si el evento cambia, el test falla.
4. El publicador **no sabe** quién escucha, pero **sí garantiza** persistir el evento (outbox).

---

## 7. Hoja de ruta propuesta: paso a paso, módulo por módulo

Principio: **cada paso es un entregable pequeño, probado y utilizable** (o al menos demostrable en la cafetería) antes de comenzar el siguiente. Tamaños relativos: **S** pequeño · **M** mediano · **L** grande.

### Etapa A — Cimientos y MVP vendible

| Paso | Módulo | Entrega concreta | Depende de | Tamaño | Criterio de "terminado" |
|---|---|---|---|---|---|
| **0** | **Fundamentos y decisiones** | Decisiones de la sección 9 tomadas; repositorio, CI/CD, entornos, respaldos; `shared-kernel`; reglas de límites de módulos; outbox + idempotencia (esqueleto); roles + PIN + `audit_log`; `store_id` en el esquema | — | M | Un "hola mundo" despliega a un entorno de pruebas; el CI falla si se rompe un límite de módulo; el outbox publica un evento de prueba y lo reprocesa tras un fallo simulado |
| **1** | **Catálogo** | CRUD de categorías, productos, variantes, grupos y opciones de modificadores, impuestos, flag manual "Agotado"; importación CSV | 0 | M | Catálogo real de la cafetería cargado; precios con modificadores calculados correctamente en pruebas unitarias |
| **2** | **Turnos y caja mínima** | Apertura con fondo, registro de egresos, cierre con arqueo ciego, diferencia guardada | 0 | M | Se abre y cierra un turno con diferencia calculada y auditada |
| **3** | **POS: venta en efectivo + ticket** | Selección con ≤2 toques, modificadores, para llevar / para tomar aquí, cobro en efectivo con vuelto, ticket, pedido con `idempotency_key`, numeración por caja | 1, 2 | L | Una venta completa en **menos de ~20 s** con un cajero real; doble toque no duplica; la venta cuadra en caja |
| **4** | **Despacho de barra (impreso primero)** | Comanda impresa por estación vía **Print Bridge** probado con la impresora real | 3 | M | Comanda legible con modificadores resaltados, impresa en la cafetería real |
| **5** | **KDS de barista** | Pantalla en tiempo real con resincronización al reconectar, estados `PAID → PREPARING → READY`, solo ítems de BARRA, umbrales configurables | 3, 4 | M | Se corta el WiFi 30 s y la pantalla se recupera sola con el estado correcto |
| **6** | **Pagos digitales, mixtos y propinas** | Yape/Plin/transferencia/tarjeta con referencia, pago dividido, propina | 3 | M | Cierre de turno con desglose por medio de pago que coincide con extractos |
| **7** | **Correcciones y permisos** | Anulación, devolución, descuento, cortesía con PIN de supervisor, eventos `order.voided` / `order.refunded` | 3, 6 | M | Una anulación posterior al pago ajusta la caja y queda auditada |
| **8** | **Reportes básicos + cierre Z** | Ventas del día, top productos, desglose por medio de pago, horas pico (ya con `paid_at`) | 3, 6 | S | Reporte cuadra con el cierre Z |
| ★ | **Piloto** | 1-2 semanas de uso real con plan de contingencia en papel | 0-8 | — | Sin pérdidas de ventas ni de caja; baristas capacitados; lista de ajustes priorizada |

> **Compuerta fiscal:** si en el Paso 0 se confirma que el comprobante electrónico es **obligatorio desde el primer día**, insertar el **módulo Fiscal** (Paso F) **antes del Piloto**.

### Etapa B — Control y cumplimiento

| Paso | Módulo | Entrega | Depende de |
|---|---|---|---|
| **F** | **Facturación electrónica** (adaptador `FiscalBillingAdapter`, cola de contingencia, notas de crédito ante devoluciones) | Comprobante válido por cada venta; reenvío automático ante caída | 3, 7 |
| **9** | **Stock de vitrina** + "Agotado" automático (`AvailabilityPort`) | Conteo de apertura/cierre, descuento por unidad, alertas | 1, 3 |
| **10** | **Compras, proveedores y costos** | Entradas, costo promedio, kardex, ajustes, conteo físico, unidades y conversiones | 9 |
| **11** | **Recetas de taza** | Receta por variante + reglas por modificador (sustitución / suma) + descuento por evento con idempotencia | 1, 10 |
| **12** | **Mermas y calibración** | Calibración de molino, bebida rehecha, derrames, consumo de personal | 11 |

### Etapa C — Operación ampliada (solo si aplica)

| Paso | Módulo | Nota |
|---|---|---|
| **13** | **Salón y cuentas abiertas** (mesas, transferencia, división) | Solo si hay servicio en salón/coworking |
| **14** | **Producción / obrador** | Solo si la cafetería hornea; consume Compras y Recetas |

### Etapa D — Crecimiento (módulos independientes, en el orden que dicte el negocio)

| Paso | Módulo | Nota |
|---|---|---|
| **15** | **Fidelización** | Requiere `CustomerPort` y consentimiento de datos |
| **16** | **Pick-up / QR online** | Nuevo canal: pasarela de pago, conciliación y estados propios |
| **17** | **BI avanzado** (margen por taza, turnos óptimos) | Requiere costos reales de Paso 10 |

---

## 8. Reglas para que cada módulo sea realmente "enchufable"

Checklist que debe cumplir **cada módulo antes de darse por terminado**:

- [ ] Carpeta propia con `api/` (pública), `domain/`, `infra/`, e `index.ts` como único punto de entrada.
- [ ] Sus tablas llevan prefijo propio; **no hay joins ni FKs hacia tablas de otros módulos**.
- [ ] Solo se comunica con otros módulos mediante **puertos** (consultas previas) o **eventos versionados** (efectos posteriores).
- [ ] Cada suscriptor es **idempotente** y tiene **reintentos**.
- [ ] Tiene **feature flag** para activarlo/desactivarlo por tienda.
- [ ] Migraciones **aditivas** (nunca destructivas) y reversibles.
- [ ] Tests de **contrato** de los eventos que publica y consume.
- [ ] Su propio **modelo de lectura** para reportes (no consulta tablas ajenas).
- [ ] **Definition of Done** firmada con un usuario real (cajero/barista).
- [ ] Documentación breve: qué publica, qué consume, qué puertos necesita.

Estructura de carpetas sugerida:

```
src/
  shared-kernel/          # Money, StoreId, DomainEvent, tipos base (mínimo)
  platform/               # auth, roles, audit, outbox, config de tienda
  modules/
    catalog/   { api/ domain/ infra/ index.ts }
    sales/     { api/ domain/ infra/ index.ts }   # POS, pagos, correcciones
    cash/      { api/ domain/ infra/ index.ts }
    dispatch/  { api/ domain/ infra/ index.ts }   # KDS e impresión
    reports/   { ... }
    stock/     { ... }        # fases siguientes
    fiscal/    { ... }
```

---

## 9. Decisiones que deben tomarse antes de programar (Paso 0)

| # | Decisión | Opciones | Por qué importa |
|---|---|---|---|
| 1 | **País y normativa** | Perú / otro | Define impuestos, comprobantes, medios de pago |
| 2 | ¿Es obligatorio **comprobante electrónico desde el día 1**? | Sí / No / Lo emite otro sistema | Puede mover Fiscal antes del piloto |
| 3 | **Dónde corre el sistema** | Nube / servidor local / híbrido | Define el comportamiento sin internet |
| 4 | **Hardware** (POS, KDS, impresora, cajón) y **cómo se conecta** | Tablet+Android app / PC / navegador+puente | Define el Print Bridge |
| 5 | **Una o varias sucursales/cajas** | 1 tienda / varias | `store_id` y `register_id` |
| 6 | **¿Se cobra antes de preparar siempre?** | Pay-First único / mixto | Define el flujo del KDS |
| 7 | **Roles y permisos** | Lista de roles y acciones sensibles | Auditoría y control |
| 8 | **Política de stock** (futuro) | Permitir negativo / bloquear | Nunca bloquear ventas por descuadre |
| 9 | **ORM y herramientas** | Prisma o TypeORM; cola de trabajos | Evitar cambiar después |
| 10 | **Propinas** | ¿Se aceptan? ¿cómo se reparten? | Modelo de pagos |
| 11 | **¿Elabora productos propios?** | Sí / No | Define Paso 14 y el campo `source` |
| 12 | **Responsable de validar** cada módulo en la cafetería | Nombre | Sin validación no hay "terminado" |

---

## 10. Plan de pruebas mejorado

**Unitarias**
- Precio con tamaño + leche vegetal + doble shot + descuento (con valores esperados escritos).
- Cálculo de impuesto por línea y por total, con redondeo.
- Vuelto, pago dividido, propina.
- Fórmula de efectivo esperado: `fondo + ventas en efectivo − egresos − retiros ± ajustes`.

**Contrato y eventos**
- Cada suscriptor procesa el mismo evento dos veces sin duplicar efectos.
- Un suscriptor que falla se reintenta y termina con el resultado correcto.
- Un cambio incompatible en el contrato rompe el test.

**Integración y robustez**
- Doble toque en "Cobrar" → un solo pedido y un solo pago.
- Corte de red a mitad de cobro y en el KDS → recuperación sin pérdida.
- Dos cajas cerrando turno y generando pedidos simultáneamente.
- Impresión real con la impresora elegida (58 mm / 80 mm).

**Escenarios E2E con números** (ejemplo)
1. Apertura con fondo S/ 100,00.
2. Pedido A: Americano 8 oz con hielo + croissant, pago en efectivo S/ 50,00 → total y vuelto **esperados escritos**.
3. Pedido B: Latte 12 oz con leche de almendra + shot extra, pago Yape → total esperado.
4. Anulación posterior al pago del pedido B con PIN de supervisor → caja y reportes se ajustan.
5. Egreso de S/ 15,00 por hielo.
6. Cierre con efectivo declarado → **efectivo esperado = valor calculado a mano** y diferencia registrada.

**Carga (hora pico)**
- Simular ráfagas de pedidos en 5-10 minutos con 2 cajas y 1 KDS y medir latencia de aparición en pantalla.

**Pruebas de usuario**
- Cajero nuevo toma un pedido con modificadores sin ayuda en menos de 10 s por toque principal.
- Barista identifica el modificador crítico a 1,5 m de la pantalla.

---

## 11. Riesgos principales y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Caída de internet en hora pico | Alta | Alto | Offline desde Fase 1 / servidor local |
| Impresora no funciona desde el navegador | Alta | Medio | Print Bridge probado en Paso 0-4 |
| Evento perdido → caja o stock descuadrado | Media | Alto | Outbox + idempotencia + dead-letter |
| Obligación fiscal descubierta tarde | Media | Alto | Confirmar con contador en Paso 0 |
| Baristas rechazan el sistema por lento | Media | Alto | Pruebas de usuario en cada paso |
| Acoplamiento entre módulos | Alta | Medio | Reglas automáticas de límites en CI |
| Fase gigante sin entregables | Alta | Alto | Hoja de ruta de la sección 7 |
| Margen/BI sin costos reales | Media | Medio | Módulo Compras y Costos antes de BI |

---

## 12. Próximo paso recomendado

1. **Responder las 12 decisiones** de la sección 9 (especialmente las de país/fiscal, dónde corre el sistema y hardware).
2. Actualizar el plan con: **Fase 0**, la nueva secuencia de pasos (sección 7), el modelo de datos corregido (sección 5) y el contrato de eventos (sección 6).
3. Empezar por los **Pasos 0 → 1 → 2 → 3** y hacer una **demostración con la cafetería real** al terminar el Paso 3, antes de construir KDS y pagos digitales.

*Con este orden, cada paso entrega algo que se puede usar y validar, y los módulos posteriores se conectan sin tocar el núcleo ya probado.*
