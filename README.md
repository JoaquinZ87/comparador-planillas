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
- Columna calculada "Nro. Comprobante (norm.)": últimos 8 dígitos del número,
  para que `1234` (ARCA) coincida con `50000001234` (PV+relleno del sistema contable).
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
