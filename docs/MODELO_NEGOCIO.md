# KIO SBS — Modelo de negocio (spec v0.1)

> Estado: **borrador para confirmar** antes de compilar/publicar apps.  
> Objetivo: que SBS se adapte al tipo de negocio, no al revés.

## 1) Tipos de negocio (configuración por empresa)

La empresa selecciona un `business_type`. Esto define módulos, flujos y UI por defecto; el admin puede ajustar dentro de lo permitido.

| Tipo | Valor | Enfoque | Activa por defecto |
|---|---|---|---|
| **Retail / Tienda** | `retail` | Venta rápida, inventario | POS, catálogo, stock, clientes, cobro, reportes básicos |
| **Restaurante** | `restaurant` | Comandas y cocina | POS, mesas/comandas, KDS/cocina, catálogo, cobro |
| **Salón / Servicios** | `service` | Servicios, combos, orden de trabajo | POS, servicios/combos, agenda/orden de trabajo, cobro |
| **Full** | `full` | Todo habilitado (posicionamiento) | Todos los módulos; el cliente activa/desactiva lo que use |

**Regla:** `full` no es un flujo distinto, es "sin restricciones de módulo por tipo". Sirve para negocios mixtos o para vender SBS como plataforma completa.

## 2) Catálogo: producto, servicio o mixto

La empresa configura `catalog_mode`:

- `product` — solo productos (SKU, stock, código de barras).
- `service` — solo servicios (duración, recurso/profesional opcional, sin stock obligatorio).
- `mixed` — productos y servicios en la misma venta.

Cada ítem tiene `item_type: product | service`.

### Servicios / combos
- Un **servicio** puede tener precio, duración estimada, categoría, profesional/recurso opcional.
- Un **combo** agrupa ítems (productos y/o servicios) con precio fijo o descuento sobre suma.
- Los componentes pueden consumir insumos/stock (opcional, fase 2).

## 3) Dinámicas comerciales (módulo Comercial)

El módulo Comercial debe soportar dinámicas comerciales configurables:

| Dinámica | Descripción | Fase |
|---|---|---|
| **Combos / paquetes** | Conjunto de ítems con precio especial | MVP |
| **Promociones** | % descuento, 2x1, precio especial por período/cantidad | MVP |
| **Cupones / códigos** | Código aplica descuento/regla | Fase 2 |
| **Referidos** | Cliente refiere, gana beneficio/descuento | Fase 2 |
| **Precios por lista/volumen** | Mayorista, cliente frecuente | Fase 2 |
| **Fidelización/puntos** | Acumulación y canje | Fase 3 |

Reglas de promo: vigencia, canal, sucursal/caja, tipo cliente, tope de uso, acumulable/no acumulable.

## 4) Flujo operativo y estados

### Cobro
- **El cajero siempre recibe el dinero/cierra el cobro** en POS/caja.
- Otros roles pueden tomar pedido/orden, pero no cobran salvo que tengan permiso de caja.

### Estados de venta/pedido
Base: `borrador → confirmada → anulada` (ya existe).

Extensión por operación:
- **Restaurante / cocina:** `pendiente → preparando → listo → entregado` (`kitchen_status`).
- **Servicio / orden de trabajo:** `pendiente → en_proceso → listo → entregado/cerrado`.
- **Domicilio/despacho (fase 2):** `listo → despachado → entregado`.

### Comanda / orden
La comanda/ticket debe mostrar: cliente, mesa/turno/canal, hora, tiempo transcurrido, ítems con cantidad, modificadores/notas por ítem, notas generales, quien tomó el pedido, estado.

## 5) Roles y visibilidad ("solo lo suyo")

| Rol | Acceso base | Ve |
|---|---|---|
| **Admin/Dueño** | Todo | Toda la empresa |
| **Cajero** | POS | Caja, cobrar, catálogo/clientes para vender, sus ventas/sesión |
| **Vendedor/Mesero** | Toma pedidos | **Solo pedidos creados por él** y catálogo/clientes necesarios; sin financiero/nómina/config |
| **Cocina/Preparación** | KDS/órdenes | Órdenes pendientes/preparando/listas (o asignadas a su estación) |
| **Despachador** | Entregas | **Solo pedidos asignados a él** |
| **Contador** | Financiero | Finanzas, informes, conciliación; sin operación POS |

**Regla "solo lo suyo" (propuesta por defecto):**
- Vendedor/Mesero: ve pedidos donde `seller_id = user.id` (o creados por él). 
- Cajero: ve su sesión de caja y ventas asociadas.
- Despachador: ve pedidos donde `assignee_id = user.id`.
- Admin/Contador: ven todo según permisos.

## 6) Canales

Misma lógica en **web y app**. El usuario inicia donde corresponda; permisos y visibilidad son iguales. La app móvil es para operación en campo/mostrador; web para administración y también operación.

## 7) Decisiones pendientes (confirmar)

1. **Mesero/vendedor**: ¿solo sus pedidos creados, o también los de su mesa/sesión asignada? (propuesta: creados por él).
2. **Despachador**: ¿necesario en MVP o fase 2? (propuesta: fase 2, pero dejar estado/modelo preparado).
3. **Servicios**: ¿requieren agenda/cita en MVP o solo venta/cobro de servicio? (propuesta: venta/cobro MVP, agenda fase 2).
4. **Modificadores por línea** (sin cebolla, término, etc.): ¿MVP para restaurante? (propuesta: sí, simple texto/notas por línea).

## 8) Impacto técnico (cuando se apruebe)

- DB: `companies.business_type`, `companies.catalog_mode`; `products.item_type`, `products.duration_min`; tablas `combos`, `combo_items`, `promotions`, `sale_line_modifiers` (o nota por línea).
- Backend: permisos por defecto ajustados, filtros "solo lo suyo", estados de orden.
- Admin web: configuración de negocio, dinámicas comerciales, comanda mejorada.
- Flutter: POS táctil por tipo de negocio, KDS/comanda real, modo vendedor/cajero restringido.
- Publicación app: **esperar** a que este modelo esté aprobado e implementado en MVP.
