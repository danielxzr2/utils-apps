/* Utilidades generales: fechas, formatos, ids y escape de HTML. */
window.B = window.B || {};

B.u = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  // --- Fechas (siempre en hora local; la semana empieza el lunes) ---
  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function weekdayIndex(t) { return (new Date(t).getDay() + 6) % 7; } // 0 = lunes
  function startOfWeek(t) { return addDays(startOfDay(t), -weekdayIndex(t)); }
  function startOfMonth(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime(); }
  function addMonths(t, n) { const d = new Date(startOfMonth(t)); d.setMonth(d.getMonth() + n); return d.getTime(); }

  function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }

  /** Lista de inicios de día en [a, b). */
  function daysIn(a, b) {
    const out = [];
    for (let t = startOfDay(a); t < b; t = addDays(t, 1)) out.push(t);
    return out;
  }

  // --- Formatos ---
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  function dur(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return ms > 0 ? '<1 min' : '0 min';
    const h = Math.floor(m / 60), mm = m % 60;
    if (!h) return `${mm} min`;
    return mm ? `${h} h ${mm} min` : `${h} h`;
  }
  function durCompact(ms) {
    const m = Math.round(ms / 60000);
    const h = Math.floor(m / 60), mm = m % 60;
    if (!h) return `${mm}m`;
    return `${h}h ${pad(mm)}m`;
  }
  function fmtDate(t, { year = false, weekday = false } = {}) {
    const d = new Date(t);
    let s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (year) s += ` ${d.getFullYear()}`;
    if (weekday) s = `${WEEKDAYS[weekdayIndex(t)]} ${s}`;
    return s;
  }
  function fmtTime(t) { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function toInputDateTime(t) { const d = new Date(t); return `${dayKey(t)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fromInputDateTime(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }
  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  return {
    pad, uid, esc, MONTHS, MONTHS_LONG, WEEKDAYS, WEEKDAYS_LONG,
    startOfDay, addDays, weekdayIndex, startOfWeek, startOfMonth, addMonths,
    dayKey, parseDayKey, daysIn, clock, dur, durCompact, fmtDate, fmtTime,
    toInputDateTime, fromInputDateTime, plural,
  };
})();
