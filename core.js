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
    let s = String(v).trim().replace(/[$\s ]/g, '');
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

  // ---------- transformaciones por par de columnas ----------
  // "Comparar como": normalización aplicada a ambos lados antes de comparar
  // y de armar la clave de apareo.
  const TRANSFORMS = [
    { id: 'auto',     label: 'Automático',                            short: '' },
    { id: 'ultimos8', label: 'Últimos 8 dígitos (nro. comprobante)',  short: 'últ. 8 díg.' },
    { id: 'digitos',  label: 'Sólo dígitos (CUIT, códigos)',          short: 'dígitos' },
    { id: 'numero',   label: 'Como número',                           short: 'número' },
    { id: 'fecha',    label: 'Como fecha',                            short: 'fecha' },
    { id: 'texto',    label: 'Como texto',                            short: 'texto' },
  ];

  function transformValue(v, t) {
    if (isBlank(v)) return '';
    switch (t) {
      case 'ultimos8': {
        // últimos 8 dígitos sin ceros a la izquierda: estándar AFIP de numeración.
        // Hace comparables 1234, "0005-00001234" y 50000001234 (PV+relleno variable).
        const dg = String(v).replace(/\D/g, '');
        return dg ? String(parseInt(dg.slice(-8), 10)) : normText(v);
      }
      case 'digitos': {
        const dg = String(v).replace(/\D/g, '');
        return dg || normText(v);
      }
      case 'numero': {
        const n = parseNumberSmart(v);
        return n === null ? normText(v) : String(n);
      }
      case 'fecha': {
        const d = parseDateSmart(v);
        return d || normText(v);
      }
      case 'texto':
        return normText(v);
      default:
        return keyPart(v);
    }
  }

  // ---------- comparación de valores ----------
  // Par canónico estable de dos valores, para registrar equivalencias
  // definidas por el usuario ("83 - Tique" ≈ "TICKET").
  function equivKey(a, b) {
    return keyPart(a) + '\u001f' + keyPart(b);
  }

  function compareValues(a, b, tol, transform, equivSet) {
    const r = compareValuesBase(a, b, tol, transform);
    if (!r.equal && equivSet && equivSet.has(equivKey(a, b))) {
      return { equal: true, kind: 'equiv' };
    }
    return r;
  }

  function compareValuesBase(a, b, tol, transform) {
    tol = tol === undefined ? 0.01 : tol;
    const aB = isBlank(a), bB = isBlank(b);
    if (aB && bB) return { equal: true, kind: 'empty' };

    if (transform === 'numero') {
      // vacío cuenta como 0, igual que en el modo automático
      const na = aB ? 0 : parseNumberSmart(a), nb = bB ? 0 : parseNumberSmart(b);
      if (na !== null && nb !== null) return { equal: Math.abs(na - nb) <= tol, kind: 'number' };
      return { equal: normText(aB ? '' : a) === normText(bB ? '' : b), kind: 'text' };
    }
    if (transform && transform !== 'auto') {
      if (aB !== bB) return { equal: false, kind: transform };
      return { equal: transformValue(a, transform) === transformValue(b, transform), kind: transform };
    }

    // modo automático
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
  function keyPart(v, transform) {
    if (isBlank(v)) return '';
    if (transform && transform !== 'auto') return transformValue(v, transform);
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

  // ---------- mapeo automático ----------
  const SYNONYM_GROUPS = [
    { names: ['fecha', 'fechaemision', 'fechadeemision', 'fechacomprobante', 'fchemision', 'fechacbte'] },
    { names: ['tipo', 'comprobante', 'comprobant', 'tipocomprobante', 'tipodecomprobante', 'tipocbte', 'tipodoc'] },
    { names: ['cuit', 'nrodocemisor', 'cuitemisor', 'nrodocumentoemisor', 'cuitproveedor'], key: true },
    { names: ['denominacionemisor', 'razonsoci', 'razonsocial', 'proveedor', 'denominacion', 'razsoc', 'nombreproveedor'] },
    { names: ['nro', 'numero', 'numerodesde', 'nrodesde', 'nrocomprobante', 'numerocomprobante', 'nrocbte', 'comprobantenro', 'nrocomp'], key: true, transform: 'ultimos8' },
    { names: ['netograviva21', 'neto21', 'netogravado21'] },
    { names: ['netograviva105', 'neto105', 'netogravado105'] },
    { names: ['netograviva27', 'neto27', 'netogravado27'] },
    { names: ['netograviva25', 'neto25', 'netogravado25'] },
    { names: ['netograviva5', 'neto5', 'netogravado5'] },
    { names: ['imptotal', 'total', 'importetotal', 'totalcomprobante', 'imptotaloperacion'] },
    { names: ['netogravadototal', 'netogravado', 'totalneto', 'netototal'] },
    { names: ['totaliva', 'totiva', 'ivatotal', 'imptotaliva'] },
    { names: ['netonogravado', 'nogravado', 'impnetonogravado'] },
    { names: ['opexentas', 'exento', 'exentas', 'impopexentas'] },
    { names: ['otrostributos', 'otros', 'impotrostributos', 'percepciones'] },
  ];
  function groupOf(name) {
    const n = normHeader(name);
    for (let g = 0; g < SYNONYM_GROUPS.length; g++) {
      if (SYNONYM_GROUPS[g].names.indexOf(n) >= 0) return SYNONYM_GROUPS[g];
    }
    return null;
  }

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

  // Devuelve [{ai, bi, isKey, transform}] (índices dentro de cols de cada tabla)
  function autoMap(colsA, colsB) {
    const candidates = [];
    colsA.forEach(function (ca, ai) {
      const na = normHeader(ca.name), gA = groupOf(ca.name);
      colsB.forEach(function (cb, bi) {
        const nb = normHeader(cb.name), gB = groupOf(cb.name);
        let score = 0;
        const sameGroup = gA !== null && gA === gB;
        if (na === nb) score = 3;
        else if (sameGroup) score = 2.5;
        else {
          const d = diceSim(na, nb);
          if (d >= 0.55) score = d * 2;
        }
        if (score > 0) candidates.push({ ai: ai, bi: bi, score: score, group: sameGroup || na === nb ? (gA || null) : null });
      });
    });
    candidates.sort(function (x, y) { return y.score - x.score || x.ai - y.ai; });
    const usedA = {}, usedB = {}, mapping = [];
    candidates.forEach(function (c) {
      if (usedA[c.ai] || usedB[c.bi]) return;
      usedA[c.ai] = usedB[c.bi] = true;
      mapping.push({
        ai: c.ai, bi: c.bi,
        isKey: !!(c.group && c.group.key),
        transform: (c.group && c.group.transform) || 'auto',
      });
    });
    mapping.sort(function (x, y) { return x.ai - y.ai; });
    return mapping;
  }

  // Sugerencia basada en datos, para planillas con encabezados desconocidos:
  // si dos columnas mapeadas parecen identificadores enteros y sus valores
  // recién coinciden al quedarse con los últimos 8 dígitos, propone 'ultimos8'.
  function suggestTransforms(tableA, tableB, mapping) {
    const colVals = function (t, i) {
      return t.data.map(function (r) { return r.values[i]; }).filter(function (v) { return !isBlank(v); });
    };
    const idLike = function (vals) {
      let ok = 0;
      vals.forEach(function (v) {
        if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1000) { ok++; return; }
        const s = String(v).trim();
        if (/^[\d\-\/ ]+$/.test(s) && !/[.,]/.test(s) && s.replace(/\D/g, '').length >= 4) ok++;
      });
      return ok >= vals.length * 0.8;
    };
    const overlapRate = function (A, B) {
      const sa = new Set(A), sb = new Set(B);
      let inter = 0;
      sa.forEach(function (v) { if (sb.has(v)) inter++; });
      return inter / Math.min(sa.size, sb.size);
    };
    mapping.forEach(function (m) {
      if (m.transform && m.transform !== 'auto') return;
      const va = colVals(tableA, m.ai), vb = colVals(tableB, m.bi);
      if (va.length < 5 || vb.length < 5) return;
      if (!idLike(va) || !idLike(vb)) return;
      const raw = overlapRate(va.map(function (v) { return keyPart(v); }), vb.map(function (v) { return keyPart(v); }));
      const t8 = overlapRate(va.map(function (v) { return transformValue(v, 'ultimos8'); }),
                             vb.map(function (v) { return transformValue(v, 'ultimos8'); }));
      if (t8 > raw + 0.3 && t8 > 0.4) m.transform = 'ultimos8';
    });
    return mapping;
  }

  // ---------- nº de comprobante: lecturas posibles ----------
  const digitsOf = function (v) { return String(v).replace(/\D/g, ''); };
  const last8 = function (v) {
    const dg = digitsOf(v);
    return dg ? parseInt(dg.slice(-8), 10) : null;
  };

  // Detecta las columnas relevantes para el apareo: nº comprobante, PV y CUIT.
  function detectarColumnasComprobante(table) {
    const buscar = function (pred) {
      for (let i = 0; i < table.cols.length; i++) if (pred(table.cols[i].name, i)) return i;
      return -1;
    };
    const esGrupo = function (miembro) {
      return function (name) {
        const g = groupOf(name);
        return !!(g && g.names.indexOf(miembro) >= 0);
      };
    };
    const num = buscar(esGrupo('nro'));
    const pv = buscar(function (name) { return /^(puntodeventa|ptovta|ptodeventa|pv)$/.test(normHeader(name)); });
    let cuit = buscar(esGrupo('cuit'));
    if (cuit < 0) {
      // por datos: columna con mayoría de valores de 11 dígitos
      cuit = buscar(function (name, i) {
        let ok = 0, tot = 0;
        for (let r = 0; r < Math.min(table.data.length, 200); r++) {
          const v = table.data[r].values[i];
          if (isBlank(v)) continue;
          tot++;
          if (digitsOf(v).length === 11) ok++;
        }
        return tot >= 5 && ok >= tot * 0.8;
      });
    }
    return { num: num, pv: pv, cuit: cuit };
  }

  // Formas posibles de leer el nº según la estructura de la(s) columna(s).
  // Cada opción: {id, label, desc, tienePV, leer(row) -> {pv, num}}
  function opcionesNro(table, colNum, colPV) {
    if (colNum < 0) return [];
    let conSep = 0, largos = 0, tot = 0;
    for (let r = 0; r < Math.min(table.data.length, 300); r++) {
      const v = table.data[r].values[colNum];
      if (isBlank(v)) continue;
      tot++;
      if (/^\s*\d+\s*[-\/ ]\s*\d+\s*$/.test(String(v))) conSep++;
      if (digitsOf(v).length > 8) largos++;
    }
    const ops = [];
    if (colPV >= 0) {
      ops.push({
        id: 'pv-sep', tienePV: true,
        label: 'Punto de venta y Nº en columnas separadas',
        desc: 'uso ambas columnas',
        leer: function (row) {
          const pv = parseNumberSmart(row.values[colPV]);
          return { pv: pv === null ? null : pv, num: last8(row.values[colNum]) };
        }
      });
      ops.push({
        id: 'solo-num', tienePV: false,
        label: 'Sólo el Nº, ignorar el punto de venta',
        desc: 'comparo únicamente el número',
        leer: function (row) { return { pv: null, num: last8(row.values[colNum]) }; }
      });
    } else if (tot && conSep >= tot * 0.6) {
      ops.push({
        id: 'sep', tienePV: true,
        label: 'PV y Nº separados por guion o espacio',
        desc: 'divido el dato en punto de venta + número',
        leer: function (row) {
          const m = String(row.values[colNum] === null ? '' : row.values[colNum]).match(/^\s*(\d+)\s*[-\/ ]\s*(\d+)\s*$/);
          if (!m) return { pv: null, num: last8(row.values[colNum]) };
          return { pv: parseInt(m[1], 10), num: parseInt(m[2].slice(-8), 10) };
        }
      });
      ops.push({
        id: 'ultimos8', tienePV: false,
        label: 'Sólo los últimos 8 dígitos como Nº',
        desc: 'ignoro lo que haya antes',
        leer: function (row) { return { pv: null, num: last8(row.values[colNum]) }; }
      });
    } else if (tot && largos >= tot * 0.5) {
      ops.push({
        id: 'pegados', tienePV: false,
        label: 'PV + número pegados en un solo dato',
        desc: 'tomo los últimos 8 dígitos como Nº',
        leer: function (row) { return { pv: null, num: last8(row.values[colNum]) }; }
      });
      ops.push({
        id: 'talcual', tienePV: false,
        label: 'Número completo tal cual',
        desc: 'no le saco nada',
        leer: function (row) {
          const dg = digitsOf(row.values[colNum]);
          return { pv: null, num: dg ? parseInt(dg, 10) : null };
        }
      });
    } else {
      ops.push({
        id: 'talcual', tienePV: false,
        label: 'El número, tal cual está',
        desc: '',
        leer: function (row) { return { pv: null, num: last8(row.values[colNum]) }; }
      });
    }
    return ops;
  }

  // "00011-00167743" (formato AFIP) o "00167743" si el PV no se conoce.
  function formatComprobante(c) {
    if (!c || c.num === null || c.num === undefined) return '';
    const num8 = String(c.num).padStart(8, '0');
    if (c.pv === null || c.pv === undefined) return num8;
    return String(c.pv).padStart(5, '0') + '-' + num8;
  }

  // Ejemplo legible de una opción usando la primera fila real con dato.
  function ejemploOpcion(table, colNum, colPV, op) {
    for (let r = 0; r < table.data.length; r++) {
      const row = table.data[r];
      if (isBlank(row.values[colNum])) continue;
      const lect = op.leer(row);
      if (lect.num === null) continue;
      const crudo = op.tienePV && colPV >= 0
        ? String(row.values[colPV]).trim() + ' y ' + String(row.values[colNum]).trim()
        : String(row.values[colNum]).trim();
      return crudo + ' → ' + formatComprobante(lect);
    }
    return '';
  }

  // Cuenta cuántos comprobantes coincidirían con cada combinación de lecturas.
  // Clave = CUIT + Nº (el PV entra sólo si ambas lecturas lo tienen).
  function evaluarCombinaciones(tableA, tableB, cuitA, cuitB, opsA, opsB) {
    const claves = function (table, cuitIdx, op, conPV) {
      const m = new Map();
      table.data.forEach(function (row) {
        const lect = op.leer(row);
        if (lect.num === null) return;
        const cu = cuitIdx >= 0 ? keyPart(row.values[cuitIdx]) : '';
        const k = cu + '|' + (conPV ? lect.pv + '-' + lect.num : String(lect.num));
        m.set(k, (m.get(k) || 0) + 1);
      });
      return m;
    };
    const conteos = opsA.map(function () { return opsB.map(function () { return 0; }); });
    let mejor = { ia: 0, ib: 0, conteo: -1 };
    opsA.forEach(function (oa, ia) {
      opsB.forEach(function (ob, ib) {
        const conPV = oa.tienePV && ob.tienePV;
        const ka = claves(tableA, cuitA, oa, conPV);
        const kb = claves(tableB, cuitB, ob, conPV);
        let c = 0;
        ka.forEach(function (na, k) { const nb = kb.get(k); if (nb) c += Math.min(na, nb); });
        conteos[ia][ib] = c;
        if (c > mejor.conteo) mejor = { ia: ia, ib: ib, conteo: c };
      });
    });
    return { conteos: conteos, mejor: mejor };
  }

  // ---------- comparación de tablas ----------
  function compareTables(tableA, tableB, mapping, opts) {
    opts = opts || {};
    const tol = opts.tolerance === undefined ? 0.01 : opts.tolerance;
    // modo tarjeta: la clave la definen el CUIT + la lectura del nº de comprobante
    const nro = opts.claveNro || null;   // {leerA, leerB, ambosPV}
    const cuit = opts.claveCuit || null; // {a: idx|-1, b: idx|-1}
    const cardMode = !!(nro || (cuit && (cuit.a >= 0 || cuit.b >= 0)));
    const keyPairs = mapping.filter(function (m) { return m.isKey; });
    const useRowOrder = !cardMode && keyPairs.length === 0;
    const buildKey = function (row, side) {
      if (cardMode) {
        const cu = cuit && (side === 'A' ? cuit.a : cuit.b) >= 0
          ? keyPart(row.values[side === 'A' ? cuit.a : cuit.b]) : '';
        let nk = '';
        if (nro) {
          const lect = (side === 'A' ? nro.leerA : nro.leerB)(row);
          if (lect.num !== null) nk = nro.ambosPV ? lect.pv + '-' + lect.num : String(lect.num);
        }
        return cu + '|' + nk;
      }
      return keyPairs.map(function (m) {
        return keyPart(row.values[side === 'A' ? m.ai : m.bi], m.transform);
      }).join('|');
    };
    const emptyKey = function (k) { return k.replace(/[|\-]/g, '') === ''; };

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
        const res = compareValues(a, b, tol, m.transform, m.equivSet);
        return { a: a, b: b, equal: res.equal, kind: res.kind };
      });
      const row = {
        key: p.key, ra: p.ra, rb: p.rb, cells: cells,
        diffs: cells.filter(function (c) { return !c.equal; }).length
      };
      if (nro) {
        const ca = nro.leerA(p.ra), cb = nro.leerB(p.rb);
        const equal = ca.num !== null && cb.num !== null && ca.num === cb.num &&
          (!nro.ambosPV || String(ca.pv) === String(cb.pv));
        row.comp = { a: ca, b: cb, equal: equal };
        if (!equal) row.diffs++;
      }
      return row;
    });

    const colDiffs = mapping.map(function (m, ci) {
      return rows.filter(function (r) { return !r.cells[ci].equal; }).length;
    });
    const compDiffs = nro ? rows.filter(function (r) { return r.comp && !r.comp.equal; }).length : 0;

    return { rows: rows, onlyA: onlyA, onlyB: onlyB, colDiffs: colDiffs,
      compDiffs: compDiffs, useRowOrder: useRowOrder, cardMode: cardMode };
  }

  // ---------- sugerencias de equivalencias ----------
  // Entre las filas apareadas, busca pares de valores distintos que aparecen
  // consistentemente juntos (o muy parecidos): candidatos a "son lo mismo".
  function sugerirEquivalencias(res, mapping) {
    const sugerencias = [];
    mapping.forEach(function (m, ci) {
      const porPar = new Map();   // equivKey -> {count, a, b, ka, kb}
      const totalA = new Map();   // keyPart(a) -> cuántas veces aparece en rojos de esta columna
      const totalB = new Map();
      res.rows.forEach(function (r) {
        const c = r.cells[ci];
        if (c.equal || isBlank(c.a) || isBlank(c.b)) return;
        const ka = keyPart(c.a), kb = keyPart(c.b);
        const ek = ka + '\u001f' + kb;
        if (!porPar.has(ek)) porPar.set(ek, { count: 0, a: c.a, b: c.b, ka: ka, kb: kb });
        porPar.get(ek).count++;
        totalA.set(ka, (totalA.get(ka) || 0) + 1);
        totalB.set(kb, (totalB.get(kb) || 0) + 1);
      });
      porPar.forEach(function (p, ek) {
        const exclusivo = p.count >= 2 &&
          totalA.get(p.ka) === p.count && totalB.get(p.kb) === p.count;
        const sim = diceSim(normText(p.a), normText(p.b));
        if (exclusivo || (p.count >= 2 && sim >= 0.6) || sim >= 0.75) {
          sugerencias.push({ ci: ci, a: p.a, b: p.b, ka: p.ka, kb: p.kb,
            count: p.count, sim: sim, exclusivo: exclusivo });
        }
      });
    });
    sugerencias.sort(function (x, y) { return y.count - x.count || y.sim - x.sim; });
    return sugerencias;
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
    TRANSFORMS: TRANSFORMS, transformValue: transformValue,
    detectHeaderRow: detectHeaderRow, extractTable: extractTable,
    autoMap: autoMap, suggestTransforms: suggestTransforms, groupOf: groupOf,
    detectarColumnasComprobante: detectarColumnasComprobante, opcionesNro: opcionesNro,
    formatComprobante: formatComprobante, ejemploOpcion: ejemploOpcion,
    evaluarCombinaciones: evaluarCombinaciones,
    equivKey: equivKey, sugerirEquivalencias: sugerirEquivalencias,
    compareTables: compareTables, formatValue: formatValue, diceSim: diceSim
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Comparador = api;

})(typeof window !== 'undefined' ? window : globalThis);
