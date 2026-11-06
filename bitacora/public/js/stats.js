/* Cálculos: tiempos por período, metas, rachas, XP, niveles y logros. */
window.B = window.B || {};

B.stats = (() => {
  const u = B.u;
  const H = 36e5, MIN = 6e4;

  /** Tramos del reloj en curso (sin el tiempo en pausa). */
  function activeSegments(t, now = Date.now()) {
    if (!t) return [];
    const list = (t.segments || []).slice();
    if (!t.pausedAt) list.push({ start: t.start, end: now });
    return list;
  }

  /** Para cálculos: sesiones guardadas + los tramos del reloj en curso como sesiones "virtuales". */
  function sessions(state, now = Date.now()) {
    const list = state.sessions.slice();
    const t = state.activeTimer;
    activeSegments(t, now).forEach((x, i) => list.push({ id: `__active${i}`, areaId: t.areaId, taskId: t.taskId, start: x.start, end: x.end, note: t.note, running: true }));
    return list;
  }

  /** Para mostrar en listas: sesiones guardadas + UNA fila para el reloj en curso (con sus pausas). */
  function displaySessions(state, now = Date.now()) {
    const list = state.sessions.slice();
    const t = state.activeTimer;
    if (t) {
      const segs = activeSegments(t, now);
      const first = (t.segments && t.segments.length) ? t.segments[0].start : t.start;
      list.push({ id: '__active', areaId: t.areaId, taskId: t.taskId, start: first, end: now, note: t.note, running: true,
        paused: !!t.pausedAt, durMs: segs.reduce((a, x) => a + (x.end - x.start), 0) });
    }
    return list;
  }

  const overlap = (s, a, b) => Math.max(0, Math.min(s.end, b) - Math.max(s.start, a));

  /** Suma el tiempo en [a, b) agrupando con keyFn(sesión). Devuelve Map clave → ms. */
  function sumBy(state, a, b, keyFn) {
    const m = new Map();
    for (const s of sessions(state)) {
      const ms = overlap(s, a, b);
      if (!ms) continue;
      const k = keyFn(s);
      m.set(k, (m.get(k) || 0) + ms);
    }
    return m;
  }

  function total(state, a, b, filter = () => true) {
    let sum = 0;
    for (const s of sessions(state)) if (filter(s)) sum += overlap(s, a, b);
    return sum;
  }

  const catOf = (state, areaId) => {
    const a = state.areas.find((x) => x.id === areaId);
    return a && state.categories.some((c) => c.id === a.categoryId) ? a.categoryId : null;
  };

  /** Tiempo total por tarea (todo el historial). */
  function timeByTask(state) {
    const m = new Map();
    for (const s of sessions(state)) if (s.taskId) m.set(s.taskId, (m.get(s.taskId) || 0) + (s.end - s.start));
    return m;
  }

  /** Map 'YYYY-MM-DD' → ms estudiados ese día (las sesiones que cruzan medianoche se reparten). */
  function dayTotals(state) {
    const m = new Map();
    for (const s of sessions(state)) {
      for (let d = u.startOfDay(s.start); d < s.end; d = u.addDays(d, 1)) {
        const ms = overlap(s, d, u.addDays(d, 1));
        if (ms) { const k = u.dayKey(d); m.set(k, (m.get(k) || 0) + ms); }
      }
    }
    return m;
  }

  /** Para el gráfico: por cada día del rango, ms por categoría. */
  function perDayByCategory(state, a, b) {
    return u.daysIn(a, b).map((d) => {
      const e = u.addDays(d, 1);
      return { day: d, byCat: sumBy(state, d, e, (s) => catOf(state, s.areaId)) };
    });
  }

  // --- Metas ---
  function periodRange(period, now = Date.now()) {
    if (period === 'week') { const a = u.startOfWeek(now); return [a, u.addDays(a, 7)]; }
    const a = u.startOfDay(now); return [a, u.addDays(a, 1)];
  }
  /**
   * Alcance compartido por metas y recompensas:
   *   { scope: 'total' } · { scope: 'category', targetId } · { scope: 'area', targetId }
   *   { scope: 'categories', targetIds: [...] }   ← varias categorías a la vez
   */
  function scopeFilter(state, x) {
    if (x.scope === 'area') return (s) => s.areaId === x.targetId;
    if (x.scope === 'category') return (s) => catOf(state, s.areaId) === x.targetId;
    if (x.scope === 'categories') { const ids = new Set(x.targetIds || []); return (s) => ids.has(catOf(state, s.areaId)); }
    return () => true;
  }
  /** Describe un alcance: { kind: 'total'|'one'|'list'|'except', text } */
  function scopeInfo(state, x) {
    if (x.scope === 'area') return { kind: 'one', text: state.areas.find((a) => a.id === x.targetId)?.name || '(área borrada)' };
    if (x.scope === 'category') return { kind: 'one', text: state.categories.find((c) => c.id === x.targetId)?.name || '(categoría borrada)' };
    if (x.scope === 'categories') {
      const ids = new Set(x.targetIds || []);
      const inc = state.categories.filter((c) => ids.has(c.id));
      const exc = state.categories.filter((c) => !ids.has(c.id));
      if (!inc.length) return { kind: 'list', text: '(ninguna categoría)' };
      if (!exc.length) return { kind: 'list', text: 'todas las categorías' };
      if (exc.length < inc.length) return { kind: 'except', text: `sin ${exc.map((c) => c.name).join(' ni ')}` };
      return { kind: 'list', text: inc.map((c) => c.name).join(' + ') };
    }
    return { kind: 'total', text: '' };
  }
  const goalFilter = (state, g) => scopeFilter(state, g);
  function goalLabel(state, g) {
    const per = g.period === 'week' ? 'esta semana' : 'hoy';
    const info = scopeInfo(state, g);
    const who = info.kind === 'total' ? 'Total' : info.text[0].toUpperCase() + info.text.slice(1);
    return `${who} · ${per}`;
  }
  function goalProgress(state, g, now = Date.now()) {
    const [a, b] = periodRange(g.period, now);
    const done = total(state, a, b, goalFilter(state, g));
    const target = g.minutes * MIN;
    return { done, target, pct: target ? Math.min(1, done / target) : 0, met: done >= target, periodKey: `${g.period}:${u.dayKey(a)}` };
  }

  // --- Rachas ---
  function streaks(state, now = Date.now()) {
    const min = (Number(state.settings.streakMinMinutes) || 1) * MIN;
    const totals = dayTotals(state);
    const ok = (t) => (totals.get(u.dayKey(t)) || 0) >= min;
    // Actual: si hoy aún no cumple, la racha sigue viva desde ayer.
    let d = u.startOfDay(now);
    const todayOk = ok(d);
    if (!todayOk) d = u.addDays(d, -1);
    let current = 0;
    while (ok(d)) { current++; d = u.addDays(d, -1); }
    const start = current ? u.addDays(d, 1) : null; // primer día de la racha actual
    // Mejor racha histórica.
    const keys = [...totals.keys()].filter((k) => totals.get(k) >= min).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const t = u.parseDayKey(k);
      run = prev !== null && u.dayKey(u.addDays(prev, 1)) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = t;
    }
    return { current, start, best: Math.max(best, current), todayOk, minMinutes: min / MIN };
  }

  // --- XP y niveles ---
  // 1 XP por minuto estudiado + bono por tarea completada según prioridad + hábitos (5 por check, 20 por día aprobado).
  const TASK_XP = { alta: 30, media: 20, baja: 10 };
  function xp(state) {
    let minutes = 0;
    for (const s of sessions(state)) minutes += (s.end - s.start) / MIN;
    const taskXp = state.tasks.filter((t) => t.done).reduce((acc, t) => acc + (TASK_XP[t.priority] || 10), 0);
    return Math.floor(minutes) + taskXp + (B.habits ? B.habits.xp(state) : 0);
  }
  // Nivel n se alcanza con 50·(n−1)² XP: nivel 2 = 50, 3 = 200, 5 = 800, 10 = 4050…
  const xpForLevel = (n) => 50 * (n - 1) ** 2;
  function level(state) {
    const x = xp(state);
    const n = Math.floor(Math.sqrt(x / 50)) + 1;
    const lo = xpForLevel(n), hi = xpForLevel(n + 1);
    return { xp: x, level: n, into: x - lo, needed: hi - lo, pct: (x - lo) / (hi - lo) };
  }
  const LEVEL_TITLES = ['Aprendiz', 'Curioso', 'Constante', 'Dedicado', 'Disciplinado', 'Experto', 'Maestro', 'Sabio', 'Leyenda'];
  const levelTitle = (n) => LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((n - 1) / 3))];

  // --- Logros ---
  function habitPerfect(state) {
    if (!B.habits || !state.habits.length) return false;
    return Object.keys(state.habitLog || {}).some((k) => B.habits.dayScore(state, B.u.parseDayKey(k)).perfect);
  }
  function achievements(state) {
    const all = sessions(state);
    const totalMs = all.reduce((a, s) => a + (s.end - s.start), 0);
    const doneTasks = state.tasks.filter((t) => t.done).length;
    const st = streaks(state);
    const longest = all.reduce((a, s) => Math.max(a, s.end - s.start), 0);
    const early = all.some((s) => new Date(s.start).getHours() < 7);
    const areasUsed = new Set(all.map((s) => s.areaId)).size;
    const week = (() => {
      const a = u.startOfWeek(Date.now());
      const cats = new Set();
      for (const s of all) if (overlap(s, a, u.addDays(a, 7)) > 0) cats.add(catOf(state, s.areaId));
      cats.delete(null);
      return state.categories.length >= 2 && state.categories.every((c) => cats.has(c.id));
    })();
    const list = [
      ['primer-paso', '🌱', 'Primer paso', 'Registra tu primera sesión', all.length > 0],
      ['10h', '⏱️', '10 horas', 'Acumula 10 horas en total', totalMs >= 10 * H],
      ['50h', '📚', '50 horas', 'Acumula 50 horas en total', totalMs >= 50 * H],
      ['100h', '🏛️', 'Centenario', 'Acumula 100 horas en total', totalMs >= 100 * H],
      ['maraton', '🏃', 'Maratón', 'Una sola sesión de 2 horas o más', longest >= 2 * H],
      ['racha3', '🔥', 'Calentando', 'Racha de 3 días', st.best >= 3],
      ['racha7', '🔥', 'Semana de fuego', 'Racha de 7 días', st.best >= 7],
      ['racha30', '☄️', 'Imparable', 'Racha de 30 días', st.best >= 30],
      ['tareas10', '✅', 'Cumplidor', 'Completa 10 tareas', doneTasks >= 10],
      ['tareas50', '🏆', 'Máquina de tareas', 'Completa 50 tareas', doneTasks >= 50],
      ['madrugador', '🌅', 'Madrugador', 'Empieza una sesión antes de las 7:00', early],
      ['explorador', '🧭', 'Explorador', 'Estudia en 5 áreas distintas', areasUsed >= 5],
      ['equilibrio', '⚖️', 'Equilibrio', 'Estudia en todas tus categorías en una misma semana', week],
      ['dia-perfecto', '🌟', 'Día perfecto', 'Cumple el 100 % de tus hábitos en un día', habitPerfect(state)],
      ['semana-solida', '🧱', 'Semana sólida', '7 días aprobados de hábitos seguidos', B.habits && state.habits.length ? Math.max(B.habits.bestApprovedStreak(state), 0) >= 7 : false],
      ['merecido', '🎁', 'Merecido', 'Gana tu primera recompensa', (state.rewardEvents || []).some((e) => e.type === 'earn' && !e.voided)],
    ];
    return list.map(([id, icon, name, desc, unlocked]) => ({ id, icon, name, desc, unlocked }));
  }

  return {
    sessions, displaySessions, activeSegments, overlap, sumBy, total, catOf, timeByTask, dayTotals, perDayByCategory,
    periodRange, scopeFilter, scopeInfo, goalFilter, goalLabel, goalProgress, streaks, xp, level, levelTitle, achievements, TASK_XP,
  };
})();
