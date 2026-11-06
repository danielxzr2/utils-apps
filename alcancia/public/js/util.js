/* Utilidades generales: fechas, dinero, ids y escape de HTML. */
window.A = window.A || {};

A.u = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

  // --- Fechas. Los movimientos usan 'YYYY-MM-DD' (día local, sin hora). ---
  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function weekdayIndex(t) { return (new Date(t).getDay() + 6) % 7; } // 0 = lunes
  function startOfWeek(t) { return addDays(startOfDay(t), -weekdayIndex(t)); }
  function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  const todayKey = () => dayKey(Date.now());
  function addDaysKey(k, n) { return dayKey(addDays(parseDayKey(k), n)); }
  function daysBetween(a, b) { return Math.round((parseDayKey(b) - parseDayKey(a)) / 864e5); } // b − a en días
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0..11
  /** 'YYYY-MM-DD' para el día `day` del mes (y, m); si el mes es más corto, el último día. */
  function clampDate(y, m, day) {
    const d = new Date(y, m, 1);
    const yy = d.getFullYear(), mm = d.getMonth();
    return `${yy}-${pad(mm + 1)}-${pad(Math.min(day, daysInMonth(yy, mm)))}`;
  }
  /** Lista de 'YYYY-MM-DD' en [a, b). */
  function daysIn(a, b) {
    const out = [];
    for (let k = a; k < b; k = addDaysKey(k, 1)) out.push(k);
    return out;
  }

  function fmtDate(k, { year = false, weekday = false } = {}) {
    const t = typeof k === 'string' ? parseDayKey(k) : k;
    const d = new Date(t);
    let s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (year) s += ` ${d.getFullYear()}`;
    if (weekday) s = `${WEEKDAYS[weekdayIndex(t)]} ${s}`;
    return s;
  }
  /** "Hoy", "Ayer" o la fecha. */
  function relDay(k) {
    const diff = daysBetween(k, todayKey());
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return fmtDate(k, { weekday: true, year: k.slice(0, 4) !== todayKey().slice(0, 4) });
  }

  // --- Dinero (pesos colombianos, sin decimales) ---
  const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  /** $ 1.234.567 (los negativos como −$ 1.234). */
  function money(n, { sign = false } = {}) {
    const v = Math.round(Number(n) || 0);
    const s = `$ ${nf.format(Math.abs(v))}`;
    if (v < 0) return `−${s}`;
    return sign && v > 0 ? `+${s}` : s;
  }
  /** Versión corta para gráficos y fichas: 850 mil, 1,2 M. */
  function moneyShort(n) {
    const v = Math.round(Number(n) || 0), a = Math.abs(v), neg = v < 0 ? '−' : '';
    if (a >= 1e6) return `${neg}$ ${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })} M`;
    if (a >= 1e3) return `${neg}$ ${Math.round(a / 1e3)} mil`;
    return `${neg}$ ${a}`;
  }
  /** Lee montos escritos a mano: "25.000", "25000", "25k", "1,5m", "$ 1.200.000". Devuelve NaN si no es válido. */
  function parseMoney(s) {
    let t = String(s ?? '').trim().toLowerCase().replace(/\$|\s|cop/g, '');
    if (!t) return NaN;
    let mult = 1;
    if (/(m|millones?|mill)$/.test(t)) { mult = 1e6; t = t.replace(/(m|millones?|mill)$/, ''); }
    else if (/(k|mil)$/.test(t)) { mult = 1e3; t = t.replace(/(k|mil)$/, ''); }
    if (mult > 1) t = t.replace(',', '.'); // "1,5m" → 1.5
    else t = t.replace(/\./g, '').replace(',', '.'); // "25.000" → 25000
    if (mult > 1 && (t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    if (!/^\d*\.?\d+$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * mult);
  }
  /** Formatea mientras se escribe: 1234567 → 1.234.567 */
  function groupDigits(s) {
    const digits = String(s).replace(/\D/g, '');
    return digits ? nf.format(Number(digits)) : '';
  }
  const pct = (x, digits = 0) => `${(x * 100).toLocaleString('es-CO', { maximumFractionDigits: digits })} %`;
  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  return {
    pad, uid, esc, MONTHS, MONTHS_LONG, WEEKDAYS,
    startOfDay, addDays, weekdayIndex, startOfWeek, dayKey, parseDayKey, todayKey, addDaysKey, daysBetween,
    daysInMonth, clampDate, daysIn, fmtDate, relDay,
    money, moneyShort, parseMoney, groupDigits, pct, plural,
  };
})();
