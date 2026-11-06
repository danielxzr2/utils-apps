/*
 * Ajustes de datos que se aplican una sola vez al abrir la app (marcados en settings).
 * Sirven para dejar configurado lo acordado sin tener que editar data.json a mano.
 */
window.B = window.B || {};

B.migrations = (() => {
  const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /**
   * Reglas acordadas el 5 nov 2026:
   *   - Las reglas por horas cuentan todas las categorías menos Recreación.
   *   - Cada meta semanal cumplida → $5.000 para recreación.
   *   - Cada 7 días de racha → 1 h de videojuegos.
   */
  function rewardsV2() {
    const st = B.store.state;
    if (st.settings.rewardsPresetV2) return;
    const now = Date.now();
    const today = B.u.startOfDay(now);
    B.store.update((s) => {
      s.settings.rewardsPresetV2 = true;
      const study = s.categories.filter((c) => norm(c.name) !== 'recreacion').map((c) => c.id);
      const hasEarned = (r) => s.rewardEvents.some((e) => e.type === 'earn' && e.ruleId === r.id);
      for (const r of s.rewardRules) {
        if (r.trigger !== 'hours' || r.scope !== 'total' || study.length === s.categories.length) continue;
        r.scope = 'categories';
        r.targetId = null;
        r.targetIds = study.slice();
        r.since = hasEarned(r) ? now : today; // sin premios aún: sigue contando desde el inicio de hoy
      }
      const base = { scope: 'total', targetId: null, targetIds: null, hours: 10, priority: 'any', goalId: null, streakDays: 7, active: true, since: today, createdAt: now };
      if (!s.rewardRules.some((r) => r.trigger === 'goal')) {
        s.rewardRules.push({ ...base, id: B.u.uid(), trigger: 'goal', goalId: 'any-week', for: 'recreación', reward: { kind: 'money', amount: 5000 } });
      }
      if (!s.rewardRules.some((r) => r.trigger === 'streak')) {
        s.rewardRules.push({ ...base, id: B.u.uid(), trigger: 'streak', streakDays: 7, for: '', reward: { kind: 'permit', quantity: 1, unit: 'h', label: 'videojuegos' } });
      }
    });
  }

  /** Hábitos diarios (5 nov 2026): tu lista inicial y sus recompensas. */
  function habitsV1() {
    const st = B.store.state;
    if (st.settings.habitsSeeded) return;
    const now = Date.now();
    const today = B.u.startOfDay(now);
    B.store.update((s) => {
      s.settings.habitsSeeded = true;
      if (!s.habits.length) {
        for (const [name, moment, schedule, alias] of B.habits.seedList()) {
          s.habits.push({ id: B.u.uid(), name, alias: alias || '', note: '', moment, schedule, createdAt: today });
        }
      }
      if (!s.rewardRules.some((r) => r.trigger === 'habits')) {
        const base = { scope: 'total', targetId: null, targetIds: null, hours: 10, priority: 'any', goalId: null, active: true, since: today, createdAt: now };
        s.rewardRules.push(
          { ...base, id: B.u.uid(), trigger: 'habits', habitMode: 'approved', streakDays: 7, for: 'recreación', reward: { kind: 'money', amount: 2000 } },
          { ...base, id: B.u.uid(), trigger: 'habits', habitMode: 'streak', streakDays: 7, for: '', reward: { kind: 'permit', quantity: 1, unit: 'h', label: 'videojuegos' } },
        );
      }
    });
  }

  function run() {
    rewardsV2();
    habitsV1();
  }

  return { run };
})();
