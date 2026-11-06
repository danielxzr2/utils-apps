/*
 * Hábitos diarios: objetivos que se repiten (no son tareas). Todos se marcan con un check.
 *
 * Modelo:
 *   habits:   [{ id, name, alias, note, moment: 'manana'|'comidas'|'dia'|'noche',
 *                schedule: { type: 'daily' } | { type: 'days', days: [0..6] } (0 = lunes)
 *                          | { type: 'weekly', times }        (p. ej. gym 4 veces por semana),
 *                createdAt }]
 *   habitLog: { 'YYYY-MM-DD': [habitId, …] }   ← hábitos cumplidos ese día
 *   settings.habitThreshold: % mínimo para aprobar el día (70 por defecto)
 *
 * Puntaje del día = cumplidos ÷ programados ese día. Los hábitos semanales no entran en el
 * porcentaje diario: se aprueban por semana (p. ej. 4 de 7 días).
 */
window.B = window.B || {};

B.habits = (() => {
  const u = B.u;
  const S = () => B.store.state;
  const MOMENTS = [
    ['manana', 'Mañana', '🌅'],
    ['comidas', 'Comidas', '🍽️'],
    ['dia', 'Durante el día', '☀️'],
    ['noche', 'Noche', '🌙'],
  ];

  /** Antes de las 4 a. m. todavía cuenta como "ayer" (para registrar tarde en la noche). */
  function logicalToday(now = Date.now()) {
    const d0 = u.startOfDay(now);
    return new Date(now).getHours() < 4 ? u.addDays(d0, -1) : d0;
  }

  const isWeekly = (h) => h.schedule?.type === 'weekly';
  const display = (h) => (h.alias ? h.alias : h.name);
  const threshold = (state = S()) => Math.min(100, Math.max(1, Number(state.settings.habitThreshold) || 70)) / 100;

  function existsOn(h, day) { return day >= u.startOfDay(h.createdAt || 0); }
  /** ¿Aparece el hábito ese día? (los semanales aparecen todos los días) */
  function shownOn(h, day) {
    if (!existsOn(h, day)) return false;
    const s = h.schedule || { type: 'daily' };
    return s.type === 'days' ? (s.days || []).includes(u.weekdayIndex(day)) : true;
  }
  /** ¿Cuenta para el porcentaje del día? */
  const countsOn = (h, day) => shownOn(h, day) && !isWeekly(h);

  function doneSet(state, day) { return new Set(state.habitLog[u.dayKey(day)] || []); }

  function dayScore(state, day) {
    const done = doneSet(state, day);
    const list = state.habits.filter((h) => countsOn(h, day));
    const n = list.filter((h) => done.has(h.id)).length;
    const total = list.length;
    const th = threshold(state);
    const needed = Math.ceil(th * total - 1e-9);
    return { done: n, total, pct: total ? n / total : 0, needed, approved: total > 0 && n >= needed, perfect: total > 0 && n === total };
  }

  function weekCount(state, h, day) {
    const a = u.startOfWeek(day);
    let c = 0;
    for (let i = 0; i < 7; i++) if (doneSet(state, u.addDays(a, i)).has(h.id)) c++;
    return c;
  }
  const weekMet = (state, h, day) => weekCount(state, h, day) >= (h.schedule.times || 1);

  function toggle(day, id) {
    B.store.update((s) => {
      const k = u.dayKey(day);
      const arr = (s.habitLog[k] || []).slice();
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      if (arr.length) s.habitLog[k] = arr; else delete s.habitLog[k];
    });
  }

  /** Racha de un hábito: días programados seguidos cumplidos (o semanas, si es semanal). */
  function habitStreak(state, h, today = logicalToday()) {
    if (isWeekly(h)) {
      let w = u.startOfWeek(today);
      if (!weekMet(state, h, w)) w = u.addDays(w, -7); // la semana actual aún puede cumplirse
      let n = 0;
      while (n < 260 && existsOn(h, u.addDays(w, 6)) && weekMet(state, h, w)) { n++; w = u.addDays(w, -7); }
      return { n, unit: n === 1 ? 'semana' : 'semanas' };
    }
    let d = today;
    if (!doneSet(state, d).has(h.id)) d = u.addDays(d, -1); // hoy aún puede marcarse
    let n = 0;
    for (let guard = 0; guard < 800 && existsOn(h, d); guard++, d = u.addDays(d, -1)) {
      if (!shownOn(h, d)) continue; // los días que no toca no rompen la racha
      if (!doneSet(state, d).has(h.id)) break;
      n++;
    }
    return { n, unit: n === 1 ? 'día' : 'días' };
  }

  /** Días aprobados seguidos (el de hoy cuenta solo si ya está aprobado). */
  function approvedStreak(state, today = logicalToday()) {
    let d = today;
    if (!dayScore(state, d).approved) d = u.addDays(d, -1);
    let n = 0;
    while (n < 2000 && dayScore(state, d).approved) { n++; d = u.addDays(d, -1); }
    return { current: n, start: n ? u.addDays(d, 1) : null };
  }

  function bestApprovedStreak(state) {
    const first = firstDay(state);
    if (first === null) return 0;
    let best = 0, run = 0;
    for (let d = first; d <= logicalToday(); d = u.addDays(d, 1)) {
      run = dayScore(state, d).approved ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  function firstDay(state) {
    if (!state.habits.length) return null;
    return u.startOfDay(Math.min(...state.habits.map((h) => h.createdAt || Date.now())));
  }

  /** Cumplimiento de un hábito entre [a, b): { done, scheduled, pct } */
  function rate(state, h, a, b) {
    let done = 0, scheduled = 0;
    if (isWeekly(h)) {
      for (let w = u.startOfWeek(a); w < b; w = u.addDays(w, 7)) {
        if (!existsOn(h, u.addDays(w, 6)) || u.addDays(w, 6) > logicalToday()) continue;
        scheduled++; if (weekMet(state, h, w)) done++;
      }
    } else {
      const today = logicalToday();
      for (let d = u.startOfDay(a); d < b && d <= today; d = u.addDays(d, 1)) {
        if (!countsOn(h, d)) continue;
        if (d === today && !doneSet(state, d).has(h.id)) continue; // hoy aún no termina
        scheduled++; if (doneSet(state, d).has(h.id)) done++;
      }
    }
    return { done, scheduled, pct: scheduled ? done / scheduled : 0 };
  }

  function scheduleText(h) {
    const s = h.schedule || { type: 'daily' };
    if (s.type === 'weekly') return `${s.times} veces por semana`;
    if (s.type === 'days') {
      const days = (s.days || []).slice().sort();
      if (days.length === 7) return 'Todos los días';
      return days.map((d) => u.WEEKDAYS[d]).join(', ');
    }
    return 'Todos los días';
  }

  /** XP por hábitos: 5 por check + 20 por día aprobado. */
  function xp(state) {
    const ids = new Set(state.habits.map((h) => h.id));
    let checks = 0, approved = 0;
    for (const [k, arr] of Object.entries(state.habitLog || {})) {
      checks += arr.filter((id) => ids.has(id)).length;
      if (dayScore(state, u.parseDayKey(k)).approved) approved++;
    }
    return checks * 5 + approved * 20;
  }

  /** Tu lista inicial (se crea una sola vez; todo se puede editar). Días: 0 = lunes. */
  function seedList() {
    const daily = { type: 'daily' };
    return [
      ['Levantarse a las 6', 'manana', daily],
      ['Bañarme', 'manana', daily],
      ['Desayuno saludable (8 am)', 'comidas', daily],
      ['Almuerzo saludable (1 pm)', 'comidas', daily],
      ['Cena saludable (6 pm)', 'comidas', daily],
      ['No carbs refinados', 'comidas', daily],
      ['Ir a clase', 'dia', { type: 'days', days: [1, 3] }],
      ['Ir a fútbol', 'dia', { type: 'days', days: [0, 4] }],
      ['Gimnasio', 'dia', { type: 'weekly', times: 4 }],
      ['2,5 L de agua', 'dia', daily],
      ['Máx. 30 min de redes sociales', 'dia', daily],
      ['Dormir a las 10', 'noche', daily],
      ['No celular en cama', 'noche', daily],
      ['No pornografía', 'noche', daily, 'No P'],
    ];
  }

  return {
    MOMENTS, logicalToday, isWeekly, display, threshold, shownOn, countsOn, doneSet, dayScore,
    weekCount, weekMet, toggle, habitStreak, approvedStreak, bestApprovedStreak, firstDay, rate,
    scheduleText, xp, seedList,
  };
})();
