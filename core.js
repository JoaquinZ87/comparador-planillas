/* Comparador de Planillas - lógica pura (browser + Node) */
'use strict';
(function (global) {

  // ---------- utilidades de texto ----------
  function stripAccents(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function normHeader(s) {
    return stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9]/g, '');
  }
  function normText(v) {
    let s = stripAccents(String(v)).trim().toUpperCase().replace(/\s+/g, ' ');
    // "1 - Factura A" -> "FACTURA A" (prefijo numérico de código de comprobante)
    s = s.replace(/^\d+\s*-\s*/, '');
    return s;
  }
  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---------- parseo de valores ----------
  // Acepta number nativo, "16417.17", "1.234,56", "1,5", "1.234.567", "$ 1.000"
  function parseNumberSmart(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v instanceof Date || v === null || v === undefined) return null;
    let s = String(v).trim().replace(/[$\s ]/g, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    const nDots = (s.match(/\./g) || []).length;
    const nCommas = (s.match(/,/g) || []).length;
    let num;
    if (nDots && nCommas) {
      // el separador que aparece último es el decimal
      if (s.lastIndexOf('.') > s.lastIndexOf(',')) num = parseFloat(s.replace(/,/g, ''));
      else num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else if (nCommas === 1) {
      num = parseFloat(s.replace(',', '.'));       // coma decimal (formato AR)
    } else if (nCommas > 1) {
      num = parseFloat(s.replace(/,/g, ''));       // comas de miles
    } else if (nDots === 1) {
      num = parseFloat(s);                          // punto decimal (formato ARCA)
    } else if (nDots > 1) {
      num = parseFloat(s.replace(/\./g, ''));      // puntos de miles
    } else {
      num = parseFloat(s);
    }
    if (!isFinite(num)) return null;
    return neg ? -num : num;
  }

  // Devuelve "YYYY-MM-DD" o null. Asume día primero en fechas con barras (formato AR).
  function parseDateSmart(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
    }
    if (typeof v === 'string') {
      const s = v.trim();
      let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([T ].*)?$/);
      if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    }
    return null;
  }

  // ---------- comparación de valores ----------
  function compareValues(a, b, tol) {
    tol = tol === undefined ? 0.01 : tol;
    const aB = isBlank(a), bB = isBlank(b);
    if (aB && bB) return { equal: true, kind: 'empty' };
    if (aB !== bB) {
      // vacío vs 0 se considera igual (ARCA deja en blanco lo que contabilidad pone en 0)
      const n = parseNumberSmart(aB ? b : a);
      if (n !== null && Math.abs(n) <= tol) return { equal: true, kind: 'number' };
      return { equal: false, kind: 'mixed' };
    }
    const da = parseDateSmart(a), db = parseDateSmart(b);
    if (da && db) return { equal: da === db, kind: 'date' };
    const na = parseNumberSmart(a), nb = parseNumberSmart(b);
    if (na !== null && nb !== null) return { equal: Math.abs(na - nb) <= tol, kind: 'number' };
    // regla de dígitos: "30-69062124-6" vs "30690621246"
    const dgA = String(a).replace(/\D/g, ''), dgB = String(b).replace(/\D/g, '');
    if (dgA.length >= 6 && dgA === dgB) return { equal: true, kind: 'digits' };
    return { equal: normText(a) === normText(b), kind: 'text' };
  }

  // Valor canónico de una celda para armar la clave de apareo de filas
  function keyPart(v) {
    if (isBlank(v)) return '';
    const d = parseDateSmart(v);
    if (d) return d;
    const n = parseNumberSmart(v);
    if (n !== null) return String(n);
    const raw = String(v).trim();
    const dg = raw.replace(/\D/g, '');
    if (dg.length >= 6 && /^[\d\-. \/]+$/.test(raw)) return dg;
    return normText(v);
  }

  // ---------- detección de encabezados ----------
  function detectHeaderRow(rows, maxScan) {
    maxScan = maxScan || 15;
    let best = 0, bestScore = -1;
    const dateLike = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/;
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
      const cells = (rows[i] || []).filter(function (c) { return !isBlank(c); });
      const texts = cells.filter(function (c) {
        if (typeof c !== 'string') return false;
        const t = c.trim();
        return !/^[\d.,\-]+$/.test(t) && !dateLike.test(t);
      });
      if (texts.length < 2) continue;
      const uniq = new Set(cells.map(function (c) { return normHeader(c); })).size;
      const score = texts.length + uniq * 0.1 - i * 0.5;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // ---------- extracción de tabla ----------
  function extractTable(rows, headerIdx) {
    const headerRow = rows[headerIdx] || [];
    const cols = [];
    const seen = {};
    headerRow.forEach(function (h, ci) {
      if (isBlank(h)) return;
      let name = String(h).trim();
      if (seen[name]) { seen[name]++; name = name + ' (' + seen[name] + ')'; }
      else seen[name] = 1;
      cols.push({ index: ci, name: name });
    });
    const data = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const vals = cols.map(function (c) {
        return row[c.index] === undefined ? null : row[c.index];
      });
      if (vals.some(function (v) { return !isBlank(v); })) {
        data.push({ excelRow: r + 1, values: vals });
      }
    }
    return { cols: cols, data: data };
  }

  // Agrega una columna calculada "Nro. Comprobante (norm.)" con los últimos
  // 8 dígitos del número (estándar AFIP). Esto hace comparables:
  //   ARCA "Número Desde" = 1234  vs  conta "nro" = 50000001234 (PV+relleno variable)
  function addVirtualNroComp(table) {
    const findCol = function (regexes) {
      for (let i = 0; i < table.cols.length; i++) {
        const n = normHeader(table.cols[i].name);
        for (let j = 0; j < regexes.length; j++) if (regexes[j].test(n)) return i;
      }
      return -1;
    };
    const idxNum = findCol([/^numerodesde$/, /^nrodesde$/, /^numerocomprobante$/,
      /^nrocomprobante$/, /^nrocbte$/, /^numero$/, /^nro$/, /^comprobantenro$/]);
    if (idxNum < 0) return false;
    // va primera para que encabece el mapeo y el resultado
    table.cols.unshift({ index: -1, name: 'Nro. Comprobante (norm.)', virtual: true });
    table.data.forEach(function (row) {
      const v = row.values[idxNum];
      let out = null;
      if (!isBlank(v)) {
        const dg = String(v).replace(/\D/g, '');
        if (dg) out = parseInt(dg.slice(-8), 10);
      }
      row.values.unshift(out);
    });
    return true;
  }

  // ---------- mapeo automático ----------
  const SYNONYM_GROUPS = [
    ['fecha', 'fechaemision', 'fechadeemision', 'fechacomprobante', 'fchemision', 'fechacbte'],
    ['tipo', 'comprobante', 'comprobant', 'tipocomprobante', 'tipodecomprobante', 'tipocbte', 'tipodoc'],
    ['cuit', 'nrodocemisor', 'cuitemisor', 'nrodocumentoemisor', 'cuitproveedor'],
    ['denominacionemisor', 'razonsoci', 'razonsocial', 'proveedor', 'denominacion', 'razsoc', 'nombreproveedor'],
    ['nrocomprobantenorm'],
    ['netograviva21', 'neto21', 'netogravado21'],
    ['netograviva105', 'neto105', 'netogravado105'],
    ['netograviva27', 'neto27', 'netogravado27'],
    ['netograviva25', 'neto25', 'netogravado25'],
    ['netograviva5', 'neto5', 'netogravado5'],
    ['imptotal', 'total', 'importetotal', 'totalcomprobante', 'imptotaloperacion'],
    ['netogravadototal', 'netogravado', 'totalneto', 'netototal'],
    ['totaliva', 'totiva', 'ivatotal', 'imptotaliva'],
    ['netonogravado', 'nogravado', 'impnetonogravado'],
    ['opexentas', 'exento', 'exentas', 'impopexentas'],
    ['otrostributos', 'otros', 'impotrostributos', 'percepciones'],
  ];
  function canonHeader(name) {
    const n = normHeader(name);
    for (let g = 0; g < SYNONYM_GROUPS.length; g++) {
      if (SYNONYM_GROUPS[g].indexOf(n) >= 0) return 'g' + g;
    }
    return n;
  }
  const KEY_GROUPS = { g2: true, g4: true }; // cuit + número de comprobante

  function bigrams(s) {
    const r = [];
    for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2));
    return r;
  }
  function diceSim(a, b) {
    if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b);
    if (!A.length || !B.length) return 0;
    const m = new Map();
    A.forEach(function (g) { m.set(g, (m.get(g) || 0) + 1); });
    let inter = 0;
    B.forEach(function (g) {
      const c = m.get(g);
      if (c) { inter++; m.set(g, c - 1); }
    });
    return 2 * inter / (A.length + B.length);
  }

  // Devuelve [{ai, bi, isKey}] (índices dentro de cols de cada tabla)
  function autoMap(colsA, colsB) {
    const candidates = [];
    colsA.forEach(function (ca, ai) {
      const na = normHeader(ca.name), canA = canonHeader(ca.name);
      colsB.forEach(function (cb, bi) {
        const nb = normHeader(cb.name), canB = canonHeader(cb.name);
        let score = 0;
        if (na === nb) score = 3;
        else if (canA === canB) score = 2.5;
        else {
          const d = diceSim(na, nb);
          if (d >= 0.55) score = d * 2;
        }
        if (ca.virtual || cb.virtual) score += 0.1;
        if (score > 0) candidates.push({ ai: ai, bi: bi, score: score, canon: canA === canB ? canA : null });
      });
    });
    candidates.sort(function (x, y) { return y.score - x.score || x.ai - y.ai; });
    const usedA = {}, usedB = {}, mapping = [];
    candidates.forEach(function (c) {
      if (usedA[c.ai] || usedB[c.bi]) return;
      usedA[c.ai] = usedB[c.bi] = true;
      mapping.push({ ai: c.ai, bi: c.bi, isKey: !!(c.canon && KEY_GROUPS[c.canon]) });
    });
    mapping.sort(function (x, y) { return x.ai - y.ai; });
    return mapping;
  }

  // ---------- comparación de tablas ----------
  function compareTables(tableA, tableB, mapping, opts) {
    opts = opts || {};
    const tol = opts.tolerance === undefined ? 0.01 : opts.tolerance;
    const keyPairs = mapping.filter(function (m) { return m.isKey; });
    const useRowOrder = keyPairs.length === 0;
    const buildKey = function (row, side) {
      return keyPairs.map(function (m) {
        return keyPart(row.values[side === 'A' ? m.ai : m.bi]);
      }).join('|');
    };
    const emptyKey = function (k) { return k.replace(/\|/g, '') === ''; };

    const pairs = [], onlyA = [], onlyB = [];
    if (useRowOrder) {
      const n = Math.max(tableA.data.length, tableB.data.length);
      for (let i = 0; i < n; i++) {
        const ra = tableA.data[i], rb = tableB.data[i];
        if (ra && rb) pairs.push({ ra: ra, rb: rb, key: 'fila ' + (i + 1) });
        else if (ra) onlyA.push(ra);
        else onlyB.push(rb);
      }
    } else {
      const mapB = new Map();
      tableB.data.forEach(function (r) {
        const k = buildKey(r, 'B');
        if (emptyKey(k)) { onlyB.push(r); return; }
        if (!mapB.has(k)) mapB.set(k, []);
        mapB.get(k).push(r);
      });
      tableA.data.forEach(function (r) {
        const k = buildKey(r, 'A');
        if (emptyKey(k)) { onlyA.push(r); return; }
        const bucket = mapB.get(k);
        if (bucket && bucket.length) pairs.push({ ra: r, rb: bucket.shift(), key: k });
        else onlyA.push(r);
      });
      mapB.forEach(function (bucket) {
        bucket.forEach(function (r) { onlyB.push(r); });
      });
    }

    const rows = pairs.map(function (p) {
      const cells = mapping.map(function (m) {
        const a = p.ra.values[m.ai], b = p.rb.values[m.bi];
        const res = compareValues(a, b, tol);
        return { a: a, b: b, equal: res.equal, kind: res.kind };
      });
      return {
        key: p.key, ra: p.ra, rb: p.rb, cells: cells,
        diffs: cells.filter(function (c) { return !c.equal; }).length
      };
    });

    const colDiffs = mapping.map(function (m, ci) {
      return rows.filter(function (r) { return !r.cells[ci].equal; }).length;
    });

    return { rows: rows, onlyA: onlyA, onlyB: onlyB, colDiffs: colDiffs, useRowOrder: useRowOrder };
  }

  // ---------- formato para mostrar ----------
  function formatValue(v) {
    if (isBlank(v)) return '';
    if (v instanceof Date) return pad2(v.getDate()) + '/' + pad2(v.getMonth() + 1) + '/' + v.getFullYear();
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(v);
  }

  const api = {
    normHeader: normHeader, normText: normText, isBlank: isBlank,
    parseNumberSmart: parseNumberSmart, parseDateSmart: parseDateSmart,
    compareValues: compareValues, keyPart: keyPart,
    detectHeaderRow: detectHeaderRow, extractTable: extractTable,
    addVirtualNroComp: addVirtualNroComp, autoMap: autoMap, canonHeader: canonHeader,
    compareTables: compareTables, formatValue: formatValue, diceSim: diceSim
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Comparador = api;

})(typeof window !== 'undefined' ? window : globalThis);
