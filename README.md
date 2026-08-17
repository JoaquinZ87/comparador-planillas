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
- Tarjeta **"Nº de comprobante"**: cada planilla puede guardar el número
  distinto (PV y Nº en columnas separadas, todo pegado en un dato como
  `1100167743`, con guion como `0011-00167743`). El programa genera las
  lecturas posibles, las evalúa contra los datos y **elige la que más
  coincidencias produce**, mostrando cada opción con un ejemplo real y su
  cantidad de coincidencias, para que el usuario entienda y pueda cambiarla.
- Apareo de filas por CUIT + Nº de comprobante leído; el número se muestra
  siempre en formato canónico AFIP (`00011-00167743`).
- **Equivalencias de valores**: cuando dos planillas escriben lo mismo distinto
  (`83 - Tique` vs `TICKET`, `LAKAUT S.A.` vs `LAKAUT SA`), un clic en el botón
  ≈ de la celda roja los declara equivalentes: se aplica a todas las filas y se
  recuerda para futuras comparaciones. Un panel sugiere automáticamente los
  pares que aparecen consistentemente juntos, para aceptarlos de a uno o todos.
- Selector avanzado **"Comparar como"** por cada par de columnas: automático,
  últimos 8 dígitos, sólo dígitos (CUIT), número, fecha o texto.
- Resultado con celdas en **verde** (iguales) y **rojo** (diferentes); las
  columnas sin mapear quedan fuera de la comparación.
- Secciones "Sólo en A" / "Sólo en B" y exportación de diferencias a XLSX
  (hojas "Diferencias", "Sólo en A" y "Sólo en B").
- El mapeo editado se recuerda en el navegador para las próximas comparaciones.

Normalizaciones al comparar: fechas (`01/06/2026` = `2026-06-01`), números con
tolerancia configurable (formatos `1.234,56` y `1234.56`), vacío = 0, CUIT con o
sin guiones, textos sin distinguir mayúsculas/acentos, y tipos de comprobante
(`1 - Factura A` = `FACTURA A`).
