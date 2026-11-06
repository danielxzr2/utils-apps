/*
 * Estado y persistencia.
 *
 * Modelo de datos (data/data.json):
 *   categories: [{ id, name, color }]                 color = índice 0..7 de la paleta
 *   areas:      [{ id, name, categoryId|null, createdAt }]
 *   tasks:      [{ id, areaId, title, description, priority: 'alta'|'media'|'baja',
 *                  dueDate: 'YYYY-MM-DD'|null, done, createdAt, completedAt|null }]
 *   sessions:   [{ id, areaId, taskId|null, start, end, note }]   (ms desde epoch)
 *   goals:      [{ id, scope: 'total'|'category'|'area', targetId|null, period: 'day'|'week', minutes }]
 *   rewardRules:  [{ id, for, trigger: 'hours'|'task'|'goal'|'streak', scope, targetId, hours, priority,
 *                    goalId, streakDays, reward: { kind: 'money'|'permit', amount, quantity, unit, label },
 *                    active, since, createdAt }]                    (ver rewards.js)
 *   rewardEvents: [{ id, type: 'earn'|'redeem', at, kind, amount | quantity+unit+label, ruleId, sourceId,
 *                    reason, note, capped, voided }]
 *   habits, habitLog: hábitos diarios y lo cumplido cada día (ver habits.js)
 *   activeTimer: { areaId, taskId|null, start, note } | null
 *   settings:   { streakMinMinutes, theme: 'auto'|'light'|'dark', rewardMonthlyCap (0 = sin tope) }
 *
 * Si la app se abre con `npm start`, los datos se guardan en el archivo vía /api/data.
 * Si se abre el index.html directamente, se usan solo en localStorage (modo local).
 */
window.B = window.B || {};

B.store = (() => {
  const LS_KEY = 'bitacora:data';
  const listeners = [];
  let state = null;
  let mode = 'local';
  let saveTimer = null;
  let saving = Promise.resolve();
  let pending = false;

  const emptyState = () => ({
    version: 1,
    categories: [],
    areas: [],
    tasks: [],
    sessions: [],
    goals: [],
    rewardRules: [],
    rewardEvents: [],
    habits: [],
    habitLog: {},
    activeTimer: null,
    settings: { streakMinMinutes: 15, theme: 'auto', rewardMonthlyCap: 200000, habitThreshold: 70 },
    updatedAt: 0,
  });

  function normalize(d) {
    const base = emptyState();
    const out = Object.assign(base, d && typeof d === 'object' ? d : {});
    out.settings = Object.assign(emptyState().settings, out.settings || {});
    for (const k of ['categories', 'areas', 'tasks', 'sessions', 'goals', 'rewardRules', 'rewardEvents', 'habits']) if (!Array.isArray(out[k])) out[k] = [];
    if (!out.habitLog || typeof out.habitLog !== 'object' || Array.isArray(out.habitLog)) out.habitLog = {};
    return out;
  }

  /** Datos iniciales con el ejemplo que diste. Se pueden editar o borrar. */
  function seed(s) {
    const now = Date.now();
    const cat = (name, color) => { const c = { id: B.u.uid(), name, color }; s.categories.push(c); return c.id; };
    const area = (name, categoryId) => { const a = { id: B.u.uid(), name, categoryId, createdAt: now }; s.areas.push(a); return a.id; };
    const idiomas = cat('Idiomas', 0);
    const universidad = cat('Universidad', 1);
    const recreacion = cat('Recreación', 2);
    const personal = cat('Personal', 6);
    area('Portugués', idiomas);
    area('Alemán', idiomas);
    area('Arquitectura de software', universidad);
    area('Arquitectura de infraestructura', universidad);
    area('Piano', recreacion);
    area('Pintura', recreacion);
    area('Proyecto personal', personal);
    s.goals.push({ id: B.u.uid(), scope: 'total', targetId: null, period: 'day', minutes: 120 });
    s.goals.push({ id: B.u.uid(), scope: 'category', targetId: idiomas, period: 'week', minutes: 300 });
  }

  async function load() {
    let loaded = null;
    try {
      if (location.protocol === 'file:') throw new Error('file');
      const r = await fetch('api/data', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      loaded = await r.json();
      mode = 'server';
    } catch {
      mode = 'local';
      try { loaded = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { loaded = null; }
    }
    const isNew = !loaded || !loaded.version;
    state = normalize(loaded);
    if (isNew) { seed(state); commit(); }
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ keepalive: true }); });
    window.addEventListener('beforeunload', () => flush({ keepalive: true }));
    return state;
  }

  function mirrorLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* sin espacio o bloqueado */ }
  }

  function commit() {
    state.updatedAt = Date.now();
    mirrorLocal();
    if (mode !== 'server') return;
    pending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  let errorShown = false;
  function flush({ keepalive = false } = {}) {
    if (mode !== 'server' || !pending) return saving;
    clearTimeout(saveTimer);
    pending = false;
    const body = JSON.stringify(state);
    saving = saving.then(() => fetch('api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60000,
    }).then((r) => { if (!r.ok) throw new Error(r.status); errorShown = false; })
      .catch(() => {
        pending = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 5000); // reintento
        if (errorShown) return;
        errorShown = true;
        B.ui && B.ui.toast('No se pudo guardar en el archivo. ¿Sigue corriendo el servidor? (Los datos quedan en este navegador.)', 'error');
      }));
    return saving;
  }

  /** Al volver a la pestaña, trae cambios hechos en otra pestaña. */
  async function resync() {
    if (mode !== 'server' || pending) return;
    try {
      const r = await fetch('api/data', { cache: 'no-store' });
      const remote = normalize(await r.json());
      if (remote.updatedAt > state.updatedAt && !pending) {
        state = remote;
        mirrorLocal();
        emit();
      }
    } catch { /* servidor apagado: seguimos con lo que hay */ }
  }

  function update(fn) {
    fn(state);
    commit();
    emit();
  }

  function replaceAll(data) {
    state = normalize(data);
    commit();
    emit();
  }

  function subscribe(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  // --- Búsquedas ---
  const category = (id) => state.categories.find((c) => c.id === id) || null;
  const area = (id) => state.areas.find((a) => a.id === id) || null;
  const task = (id) => state.tasks.find((t) => t.id === id) || null;
  const areaCategory = (areaId) => { const a = area(areaId); return a ? category(a.categoryId) : null; };
  /** Color CSS de un área (el de su categoría; gris si no tiene). */
  const areaColor = (areaId) => { const c = areaCategory(areaId); return c ? `var(--c${c.color})` : 'var(--c-none)'; };
  const catColor = (c) => (c ? `var(--c${c.color})` : 'var(--c-none)');

  /** Áreas agrupadas por categoría, en orden; las sin categoría al final. */
  function groupedAreas() {
    const groups = state.categories.map((c) => ({ category: c, areas: state.areas.filter((a) => a.categoryId === c.id) }));
    const loose = state.areas.filter((a) => !a.categoryId || !category(a.categoryId));
    if (loose.length) groups.push({ category: null, areas: loose });
    return groups;
  }

  return {
    load, update, replaceAll, subscribe, flush,
    get state() { return state; },
    get mode() { return mode; },
    category, area, task, areaCategory, areaColor, catColor, groupedAreas,
  };
})();
