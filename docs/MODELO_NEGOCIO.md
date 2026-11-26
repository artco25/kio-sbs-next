# KIO SBS — Modelo de negocio (spec v0.2)

> Estado: **borrador ampliado para confirmar** antes de implementar/compilar/publicar.  
> Objetivo: que SBS se adapte al negocio real (multi-sede, multi-modelo, inventario, proveedores), no al revés.

## 1) Principios

- **Multiempresa**: una empresa no ve datos de otra.
- **Multi-sede**: una empresa puede tener varias sedes/tiendas/puntos de operación.
- **Multi-modelo**: una misma empresa puede operar varios tipos de negocio (retail, restaurante, salón, tienda de barrio, etc.) desde el mismo ERP.
- **Configuración por sede, gobierno desde empresa**: la empresa define políticas globales; cada sede puede tener su tipo, catálogo, cajas, bodegas y operación.
- **Stock confiable**: todo movimiento de inventario debe ser trazable (quién, cuándo, desde dónde, hacia dónde, costo, referencia).
- **Cobro controlado**: el cajero recibe/cierra el cobro en caja/POS según permisos.

## 2) Estructura organizacional

### Empresa (tenant)
Configuración global:
- `business_types_enabled`: lista de tipos habilitados en la empresa (`retail`, `restaurant`, `service`, `full` o combinación).
- `catalog_mode_default`: `product | service | mixed`.
- Moneda, impuestos, numeración, políticas contables/comerciales, roles personalizados.

### Sede / sucursal / tienda
Nueva entidad `sites` (sede):
- `id`, `company_id`, `name`, `code`, `type` (`store`, `restaurant`, `salon`, `warehouse`, `cedi`, `mixed`), `business_type`, `catalog_mode`, `address`, `city`, `phone`, `active`.
- Una sede puede ser punto de venta, operación de servicios, cocina, bodega operativa, etc.
- Usuarios/cajas/dispositivos se asignan a sede por defecto (`site_id`), con permisos para ver otras sedes si aplica.

### Bodegas / CEDI
Nueva entidad `warehouses`:
- `id`, `company_id`, `site_id?`, `name`, `code`, `kind` (`main`/CEDI, `store`, `transit`, `virtual`, `returns`), `active`.
- **CEDI/bodega principal**: abastece sedes; puede recibir compras a proveedores.
- **Bodega de sede**: stock local para venta/consumo.
- **Bodega en tránsito**: opcional para traslados con despacho/recepción.

Regla: todo SKU con control de stock tiene existencia por `warehouse_id` (y opcionalmente lote/serie en fase avanzada).

## 3) Tipos de negocio por sede

| Tipo | Valor | Ejemplos | Módulos/flujo base |
|---|---|---|---|
| Retail / Tienda | `retail` | papelería, tienda de barrio, ferretería | POS rápido, catálogo, stock, clientes, cobro |
| Restaurante | `restaurant` | restaurante, café | POS, mesas/comandas, KDS/cocina, cobro |
| Servicios | `service` | salón de belleza, peluquería, barbería, spa | servicios/combos, agenda/orden, POS/cobro |
| Full / Mixto | `full` | negocio mixto | todos los módulos habilitados |

Una empresa puede tener sedes con distintos tipos: ej. Sede 1 retail, Sede 2 restaurante, Sede 3 salón. El ERP administra todo bajo la misma empresa.

## 4) Catálogo y comercial

### Ítems
- `item_type`: `product | service`.
- Producto: SKU, barcode, categoría, costo, precio, impuesto, `track_stock`, `min_stock`.
- Servicio: duración, recurso/profesional opcional, no stock obligatorio; puede consumir insumos.

### Dinámicas comerciales
| Dinámica | Fase |
|---|---|
| Combos/paquetes | MVP |
| Promociones (%, 2x1, precio especial por vigencia/cantidad) | MVP |
| Cupones/códigos | Fase 2 |
| Referidos | Fase 2 |
| Precios por lista/volumen | Fase 2 |
| Fidelización/puntos | Fase 3 |

Reglas: vigencia, sede/canal, tipo cliente, tope uso, acumulable/no acumulable.

## 5) Inventario, bodegas y traslados

### Existencias
- Stock por `company_id + warehouse_id + product_id`.
- Vista consolidada por empresa/sede y detalle por bodega.

### Movimientos (`stock_moves`)
Extender con:
- `warehouse_id` (origen/destino según tipo), `warehouse_to_id` para traslados, `site_id`, `reason`, `created_by`, `ref_type`, `ref_id`.
- Tipos: `in`, `out`, `adjustment`, `sale`, `return`, `purchase`, `transfer_out`, `transfer_in`, `transfer`, `production/consumption` (fase avanzada).

### Traslados entre sedes/bodegas
Flujo recomendado:
1. **Borrador**: se crea solicitud/traslado.
2. **Despachado**: sale de bodega origen (`transfer_out` / reserva).
3. **En tránsito**: opcional.
4. **Recibido**: entra a bodega destino (`transfer_in`), con diferencias parciales.
5. **Cancelado**: antes de recepción final.

Documento: `stock_transfers` + `stock_transfer_lines`. Debe soportar traslado CEDI → sede, sede → sede, sede → CEDI/devolución.

### Alertas y analítica de inventario
- **Agotamiento / stock bajo**: alerta cuando `on_hand <= min_stock` o `<= reorder_point`.
- **Rotación**: ventas/salidas vs inventario promedio por período.
- **Clasificación ABC**:
  - A: alto valor/rotación (ej. 80% valor).
  - B: medio.
  - C: bajo.
  - Aplicable a SKUs; para servicios usar ABC por ingresos/frecuencia/margen.
- **Reportes**: valorización, kardex, aging, quiebres, rotación, ABC, margen por producto/servicio/sede.

## 6) Proveedores, compras y portal de proveedores

### Proveedores
`partners` ya tiene `is_supplier`; extender con:
- contacto, condiciones de pago, lead time, categorías que suministra, estado, documentos.

### Compras / abastecimiento
Documentos: requisición, solicitud de cotización, orden de compra, recepción de compra, factura proveedor, cuentas por pagar.
MVP recomendado: requisición + orden de compra + recepción + cuenta por pagar.

### Portal de proveedores (web)
Portal externo con acceso por proveedor (usuario proveedor vinculado a `partner_id`):
- Ver requisiciones/RFQ asignadas.
- Responder cotización/precios/plazos.
- Ver órdenes de compra, estados de recepción, pagos/facturas.
- Cargar documentos (factura, remisión).

Seguridad: proveedor solo ve sus propios documentos; nunca datos de otros proveedores o clientes.

## 7) Finanzas y reportes

- Ventas por sede, canal, vendedor, tipo de negocio.
- Margen por producto/servicio/categoría/sede.
- Cuentas por cobrar/cartera y cuentas por pagar.
- Caja/POS por sesión y sede.
- Gastos/caja menor por sede/centro de costo.
- Reportes consolidados empresa y detallados por sede.

## 8) Roles y visibilidad

| Rol | Alcance |
|---|---|
| Admin/Dueño empresa | Todo, todas las sedes |
| Admin de sede | Operación/config de su sede |
| Cajero | POS/caja de su sede/sesión |
| Vendedor/Mesero | Solo lo suyo / sede asignada (definir) |
| Bodega/Logística | Stock, traslados, recepciones |
| Compras | Proveedores, requisiciones, OC |
| Contador | Finanzas/reportes consolidados o por sede |
| Proveedor (portal) | Solo sus requisiciones/OC/documentos |

Regla “solo lo suyo”: por defecto filtrar por `seller_id/created_by/assignee_id/site_id` según rol.

## 9) Modelo de datos propuesto (alto nivel)

### Nuevas tablas
- `sites` — sedes.
- `warehouses` — bodegas/CEDI.
- `warehouse_stocks` — existencia actual por bodega/producto.
- `stock_transfers`, `stock_transfer_lines` — traslados.
- `purchase_requisitions`, `purchase_requisition_lines`.
- `purchase_orders`, `purchase_order_lines`.
- `purchase_receipts`, `purchase_receipt_lines`.
- `supplier_users` / acceso portal proveedor.
- `promotions`, `promotion_rules`, `coupons` (fases comerciales).

### Campos a extender
- `companies`: `business_types_enabled`, `catalog_mode_default`, `settings`.
- `users`: `site_id`, `warehouse_id?`, permisos por sede.
- `products`: `item_type`, `service_duration_min`, `brand`, `reorder_point`, `abc_class?` (o calculada), `cost_method`.
- `stock_moves`: `site_id`, `warehouse_id`, `warehouse_to_id`, `transfer_id`, `created_by`.
- `sales`, `payments`, `expenses`, `pos_sessions`: `site_id`, `warehouse_id`.
- `partners`: campos proveedor/portal.

## 10) Fases de implementación sugeridas

### Fase A — Fundaciones
- `sites`, `warehouses`, asignación `site_id` a usuarios/cajas.
- Configuración empresa: tipos de negocio habilitados y catálogo por sede.
- Migración datos actuales a sede/bodega default.

### Fase B — Inventario multi-bodega
- `warehouse_stocks`, `stock_moves` extendido.
- Traslados entre bodegas/sedes con despacho/recepción.
- Alertas stock bajo/agotamiento.

### Fase C — Analítica inventario
- Rotación, ABC, kardex/valorización, reportes por sede.

### Fase D — Comercial por tipo de negocio
- Combos/promos MVP.
- POS/KDS/servicios adaptado por `business_type`.
- Modificadores por línea, tickets/pestañas, pago mixto.

### Fase E — Compras y portal proveedores
- Requisiciones, OC, recepción, CxP.
- Portal proveedor web con acceso restringido.

## 11) Decisiones

### Confirmadas
1. **Sede por defecto**: todo dato operativo debe tener `site_id` obligatorio, con sede/bodega default en migración. ✅
2. **Stock por bodega**: una sede puede tener varias bodegas. ✅
3. **Traslado**: afecta stock al recibir en destino; tránsito intermedio opcional. ✅
4. **Modelo por sede vs empresa**: la empresa habilita varios tipos y cada sede elige uno; se permite sede `mixed`. ✅

### Pendientes
5. **ABC**: ¿cálculo automático por período (30/60/90 días) o configurable? (recomendado configurable).
6. **Portal proveedores**: ¿MVP solo requisiciones/cotizaciones o también OC/facturas/pagos?
7. **Servicios en inventario**: ¿ABC/rotación de servicios por ingresos/frecuencia, separado de stock físico? (recomendado sí).
8. **Permisos**: vendedor solo sus pedidos; ¿admin de sede ve todas las sedes o solo la suya?

## 12) Impacto técnico

- **DB**: migraciones nuevas para sedes/bodegas/traslados/compras/portal; backfill sede/bodega default.
- **Backend**: scope por `company_id + site_id/warehouse_id`, permisos, endpoints GraphQL/REST, reportes.
- **Admin web**: configuración sedes/bodegas, traslados, compras, reportes ABC/rotación, portal proveedor.
- **Flutter/desktop POS**: selector sede/caja/bodega, flujo por tipo negocio, stock local por sede, sync con `site_id`.
- **Sync/offline**: incluir `site_id`/`warehouse_id` en payloads y resolución de conflictos; cuidado con transferencias concurrentes.
