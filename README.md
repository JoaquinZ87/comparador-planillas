---
title: Comparador de Planillas ARCA vs Contabilidad
emoji: 📊
colorFrom: blue
colorTo: green
sdk: static
pinned: false
---

# Comparador de Planillas

Compara el listado **"Mis Comprobantes Recibidos" de ARCA** contra el listado de
compras de un **sistema contable**, celda por celda.

- Carga de dos archivos Excel/CSV (todo se procesa **en el navegador**; las
  planillas nunca se suben a ningún servidor).
- Detección automática de la fila de encabezados (ignora títulos).
- **Propuesta automática de mapeo de columnas**, editable con selectores.
- Selector **"Comparar como"** por cada par de columnas: automático, últimos 8
  dígitos (nro. de comprobante), sólo dígitos (CUIT), número, fecha o texto.
  Con *últimos 8 dígitos*, `1234` coincide con `0005-00001234` y con
  `50000001234` (punto de venta + relleno variable), sirva la planilla que sirva.
  La propuesta automática la sugiere por nombre de columna y también analizando
  los datos (si dos columnas de identificadores sólo coinciden normalizadas).
- Apareo de filas por columnas clave (por defecto CUIT + Nro. de comprobante).
- Resultado con celdas en **verde** (iguales) y **rojo** (diferentes); las
  columnas sin mapear quedan fuera de la comparación.
- Secciones "Sólo en A" / "Sólo en B" y exportación de diferencias a XLSX
  (hojas "Diferencias", "Sólo en A" y "Sólo en B").
- El mapeo editado se recuerda en el navegador para las próximas comparaciones.

Normalizaciones al comparar: fechas (`01/06/2026` = `2026-06-01`), números con
tolerancia configurable (formatos `1.234,56` y `1234.56`), vacío = 0, CUIT con o
sin guiones, textos sin distinguir mayúsculas/acentos, y tipos de comprobante
(`1 - Factura A` = `FACTURA A`).
