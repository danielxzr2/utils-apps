/*
 * Recompensas reales: reglas que convierten estudio en dinero o permisos.
 *
 * Disparadores (rule.trigger):
 *   'hours'  → cada `hours` horas de estudio en un alcance (todo / una o varias categorías / un área)
 *   'task'   → cada tarea completada (opcional: solo cierta prioridad o alcance)
 *   'goal'   → cada vez que se cumple una meta (una en particular, cualquiera, cualquier diaria o
 *              cualquier semanal: goalId = id | null | 'any-day' | 'any-week'), por período
 *   'streak' → cada `streakDays` días seguidos de racha
 *   'habits' → hábitos: habitMode 'approved' (día aprobado), 'perfect' (100 %) o 'streak' (N días aprobados seguidos)
 * Premio (rule.reward):
 *   { kind: 'money', amount }                    → pesos, acumulan saldo
 *   { kind: 'permit', quantity, unit, label }    → p. ej. 2 h de videojuegos
 *
 * Todo cuenta desde `rule.since`: el inicio del día en que creas la regla, o el momento en que
 * cambias su condición o la reactivas (para no premiar dos veces las mismas horas).
 * Lo ganado se guarda como eventos 'earn' y lo usado como 'redeem'. El saldo = ganado − usado.
 * Tope mensual (settings.rewardMonthlyCap, mes calendario): solo aplica al dinero.
 */
window.B = window.B || {};

B.rewards = (() => {
  const u = B.u;
  const H = 36e5;
  const S = () => B.store.state;
  const fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const money = (n) => fmtMoney.format(Math.round(n || 0)).replace(/\s/g, ' ');
  const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ','));

  // ---------- Textos ----------
  /** Texto del alcance para una frase: '', ' en Idiomas', ' (sin Recreación)'. */
  function scopePhrase(state, x) {
    const info = B.stats.scopeInfo(state, x);
    if (info.kind === 'total') return '';
    if (info.kind === 'except') return ` (${info.text})`;
    return ` en ${info.text}`;
  }
  function hoursText(h) {
    const m = Math.round(h * 60);
    if (m % 60 === 0) return `${m / 60} h`;
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }
  function rewardText(r) {
    if (!r) return '';
    if (r.kind === 'permit') return `${num(r.quantity)} ${r.unit ? r.unit + ' de ' : ''}${r.label}`.trim();
    return money(r.amount);
  }
  function eventText(e) {
    return e.kind === 'permit' ? rewardText(e) : money(e.amount);
  }
  function triggerText(state, rule) {
    const where = scopePhrase(state, rule);
    switch (rule.trigger) {
      case 'hours': return `Cada ${hoursText(rule.hours)} de estudio${where}`;
      case 'task': return `Cada tarea${rule.priority && rule.priority !== 'any' ? ` de prioridad ${rule.priority}` : ''} completada${where}`;
      case 'goal': {
        if (rule.goalId === 'any-day') return 'Al cumplir cualquier meta diaria';
        if (rule.goalId === 'any-week') return 'Al cumplir cualquier meta semanal';
        const g = rule.goalId ? state.goals.find((x) => x.id === rule.goalId) : null;
        if (rule.goalId && !g) return 'Al cumplir una meta (borrada)';
        return g ? `Al cumplir la meta «${goalName(state, g)}»` : 'Al cumplir cualquier meta';
      }
      case 'habits': {
        const th = Math.round(B.habits.threshold(state) * 100);
        if (rule.habitMode === 'perfect') return 'Cada día perfecto de hábitos (100 %)';
        if (rule.habitMode === 'streak') return `Cada ${rule.streakDays} días seguidos con ≥ ${th} % de hábitos`;
        return `Cada día con ≥ ${th} % de hábitos`;
      }
      case 'streak': return rule.streakDays === 1 ? 'Cada día de racha' : `Cada ${rule.streakDays} días de racha`;
      default: return '';
    }
  }
  function goalName(state, g) {
    const info = B.stats.scopeInfo(state, g);
    const who = info.kind === 'total' ? 'Total' : info.text[0].toUpperCase() + info.text.slice(1);
    return `${who} · ${g.period === 'week' ? 'semanal' : 'diaria'} ${u.durCompact(g.minutes * 6e4)}`;
  }
  function permitKey(label, unit) { return `${String(label).trim().toLowerCase()}|${String(unit || '').trim().toLowerCase()}`; }

  // ---------- Progreso de reglas por horas ----------
  const filterFor = (state, rule) => B.stats.scopeFilter(state, rule);
  function hoursProgress(state, rule) {
    const th = Math.max(1, rule.hours * H);
    const ms = B.stats.total(state, rule.since, Infinity, filterFor(state, rule));
    const count = state.rewardEvents.filter((e) => e.type === 'earn' && e.ruleId === rule.id && e.epoch === rule.since).length;
    const into = Math.max(0, ms - count * th);
    return { ms, th, count, earned: Math.floor(ms / th), into, pct: Math.min(1, into / th) };
  }

  // ---------- Qué debería estar ganado (fuentes) ----------
  function sources(state, rule, now) {
    const out = [];
    if (rule.trigger === 'hours') {
      const p = hoursProgress(state, rule);
      for (let n = p.count + 1; n <= p.earned; n++) {
        out.push({ id: `h-${rule.since}-${n}`, at: now, reason: `${hoursText(rule.hours)} de estudio${scopePhrase(state, rule)}` });
      }
    } else if (rule.trigger === 'task') {
      const f = filterFor(state, rule);
      for (const t of state.tasks) {
        if (!t.done || !t.completedAt || t.completedAt < rule.since) continue;
        if (rule.priority && rule.priority !== 'any' && t.priority !== rule.priority) continue;
        if (!f({ areaId: t.areaId })) continue;
        out.push({ id: `t-${t.id}`, at: t.completedAt, reason: `Tarea completada: ${t.title}` });
      }
    } else if (rule.trigger === 'goal') {
      const goals = rule.goalId === 'any-day' ? state.goals.filter((g) => g.period === 'day')
        : rule.goalId === 'any-week' ? state.goals.filter((g) => g.period === 'week')
          : rule.goalId ? state.goals.filter((g) => g.id === rule.goalId) : state.goals;
      for (const g of goals) {
        const [a0] = B.stats.periodRange(g.period, now);
        const prev = g.period === 'week' ? u.addDays(a0, -7) : u.addDays(a0, -1);
        for (const a of [prev, a0]) {
          const b = g.period === 'week' ? u.addDays(a, 7) : u.addDays(a, 1);
          if (b <= rule.since) continue; // período anterior a la regla
          const done = B.stats.total(state, a, b, B.stats.goalFilter(state, g));
          if (done >= g.minutes * 6e4) {
            out.push({ id: `g-${g.id}-${u.dayKey(a)}`, at: Math.min(now, b - 1), reason: `Meta cumplida: ${goalName(state, g)} (${g.period === 'week' ? 'semana del ' : ''}${u.fmtDate(a)})` });
          }
        }
      }
    } else if (rule.trigger === 'habits' && state.habits.length) {
      const today = B.habits.logicalToday(now);
      if (rule.habitMode === 'streak') {
        const st = B.habits.approvedStreak(state, today);
        const n = Math.max(1, rule.streakDays || 7);
        if (st.start) {
          for (let k = n; k <= st.current; k += n) {
            const day = u.addDays(st.start, k - 1);
            if (day < u.startOfDay(rule.since)) continue;
            out.push({ id: `hs-${u.dayKey(st.start)}-${k}`, at: Math.min(now, u.addDays(day, 1) - 1), reason: `${k} días seguidos aprobados en hábitos` });
          }
        }
      } else {
        const perfect = rule.habitMode === 'perfect';
        const from = Math.max(u.startOfDay(rule.since), B.habits.firstDay(state));
        for (let d = from; d <= today; d = u.addDays(d, 1)) {
          const sc = B.habits.dayScore(state, d);
          if (perfect ? sc.perfect : sc.approved) {
            out.push({ id: `${perfect ? 'hp' : 'hd'}-${u.dayKey(d)}`, at: Math.min(now, u.addDays(d, 1) - 1), reason: `${perfect ? 'Día perfecto' : 'Día aprobado'} en hábitos (${u.fmtDate(d, { weekday: true })}: ${sc.done}/${sc.total})` });
          }
        }
      }
    } else if (rule.trigger === 'streak') {
      const st = B.stats.streaks(state, now);
      const n = Math.max(1, rule.streakDays || 7);
      if (st.start) {
        for (let k = n; k <= st.current; k += n) {
          const day = u.addDays(st.start, k - 1);
          if (day < u.startOfDay(rule.since)) continue;
          out.push({ id: `s-${u.dayKey(st.start)}-${k}`, at: Math.min(now, u.addDays(day, 1) - 1), reason: `Racha de ${B.u.plural(k, 'día', 'días')}` });
        }
      }
    }
    return out;
  }

  function monthEarned(state, t) {
    const a = u.startOfMonth(t), b = u.addMonths(a, 1);
    return state.rewardEvents
      .filter((e) => e.type === 'earn' && e.kind === 'money' && !e.voided && e.at >= a && e.at < b)
      .reduce((acc, e) => acc + (e.amount || 0), 0);
  }

  /**
   * Revisa todas las reglas y registra lo ganado. Devuelve true si cambió algo
   * (en ese caso ya llamó a store.update, que vuelve a pintar la pantalla).
   */
  function evaluate() {
    const state = S();
    if (!state || !state.rewardRules.length) return false;
    const now = Date.now();
    const earned = state.rewardEvents.filter((e) => e.type === 'earn');
    const have = new Set(earned.map((e) => `${e.ruleId}|${e.sourceId}`));
    const adds = [];
    const removeIds = new Set();
    for (const rule of state.rewardRules) {
      if (!rule.active) continue;
      const src = sources(state, rule, now);
      for (const s of src) if (!have.has(`${rule.id}|${s.id}`)) adds.push({ rule, s });
      if (rule.trigger === 'task') {
        // Si desmarcas una tarea, se quita la recompensa que había dado.
        const valid = new Set(src.map((s) => s.id));
        for (const e of earned) if (e.ruleId === rule.id && e.sourceId.startsWith('t-') && !valid.has(e.sourceId)) removeIds.add(e.id);
      }
      if (rule.trigger === 'habits' && rule.habitMode !== 'streak') {
        // Si desmarcas hábitos de hoy o ayer y el día deja de cumplir, se quita ese premio.
        const valid = new Set(src.map((s) => s.id));
        const recent = u.addDays(B.habits.logicalToday(now), -1);
        for (const e of earned) {
          if (e.ruleId !== rule.id || e.voided || valid.has(e.sourceId)) continue;
          const day = u.parseDayKey(e.sourceId.slice(3));
          if (day >= recent) removeIds.add(e.id);
        }
      }
    }
    if (!adds.length && !removeIds.size) return false;

    const fresh = [];
    B.store.update((st) => {
      if (removeIds.size) st.rewardEvents = st.rewardEvents.filter((e) => !removeIds.has(e.id));
      adds.sort((x, y) => x.s.at - y.s.at);
      for (const { rule, s } of adds) {
        const r = rule.reward || {};
        const ev = { id: u.uid(), type: 'earn', at: s.at, ruleId: rule.id, sourceId: s.id, epoch: rule.since, reason: s.reason, for: rule.for || '', kind: r.kind };
        if (r.kind === 'permit') {
          Object.assign(ev, { quantity: Number(r.quantity) || 0, unit: r.unit || '', label: r.label || 'Permiso' });
        } else {
          let amount = Math.max(0, Math.round(Number(r.amount) || 0));
          const cap = Number(st.settings.rewardMonthlyCap) || 0;
          if (cap > 0) {
            const room = Math.max(0, cap - monthEarned(st, ev.at));
            if (amount > room) { ev.capped = true; ev.originalAmount = amount; amount = room; }
          }
          ev.amount = amount;
        }
        st.rewardEvents.push(ev);
        fresh.push(ev);
      }
    });
    announce(fresh, removeIds.size);
    return true;
  }

  function announce(fresh, removed) {
    if (removed && !fresh.length) B.ui.toast('Se quitó una recompensa porque desmarcaste algo que la había dado.');
    const shown = fresh.slice(0, 3);
    for (const e of shown) {
      const what = eventText(e);
      if (e.capped && !e.amount) B.ui.toast(`🎁 Ganaste ${money(e.originalAmount)}, pero ya llegaste al tope del mes.`, 'info', 6000);
      else B.ui.toast(`🎁 ¡Ganaste ${what}${e.for ? ` para ${e.for}` : ''}!${e.capped ? ' (recortado por el tope del mes)' : ''}`, 'success', 6500);
    }
    if (fresh.length > 3) B.ui.toast(`🎁 …y ${fresh.length - 3} recompensas más. Míralas en Recompensas.`, 'success', 6500);
  }

  // ---------- Saldos ----------
  function balances(state = S()) {
    let moneyEarned = 0, moneyUsed = 0;
    const permits = new Map();
    const permit = (e) => {
      const k = permitKey(e.label, e.unit);
      if (!permits.has(k)) permits.set(k, { key: k, label: e.label, unit: e.unit, earned: 0, used: 0 });
      return permits.get(k);
    };
    for (const e of state.rewardEvents) {
      if (e.voided) continue;
      if (e.kind === 'permit') {
        const p = permit(e);
        if (e.type === 'earn') p.earned += e.quantity || 0; else p.used += e.quantity || 0;
      } else if (e.type === 'earn') moneyEarned += e.amount || 0;
      else moneyUsed += e.amount || 0;
    }
    const permitList = [...permits.values()].map((p) => ({ ...p, balance: Math.round((p.earned - p.used) * 100) / 100 }));
    return { money: moneyEarned - moneyUsed, moneyEarned, moneyUsed, permits: permitList };
  }

  // ---------- Acciones ----------
  function redeem({ kind, amount, quantity, label, unit, note }) {
    B.store.update((st) => {
      const ev = { id: u.uid(), type: 'redeem', at: Date.now(), kind, note: note || '' };
      if (kind === 'permit') Object.assign(ev, { quantity, label, unit });
      else ev.amount = amount;
      st.rewardEvents.push(ev);
    });
  }

  /** La regla de ejemplo que pediste, creada una sola vez (se puede editar o borrar). */
  function seedOnce() {
    const st = S();
    if (st.settings.rewardsSeeded) return;
    const now = Date.now();
    const today = u.startOfDay(now);
    B.store.update((s) => {
      s.settings.rewardsSeeded = true;
      if (s.rewardRules.length) return;
      s.rewardRules.push(
        { id: u.uid(), for: 'recreación', trigger: 'hours', scope: 'total', targetId: null, hours: 10, priority: 'any', goalId: null, streakDays: 7, reward: { kind: 'money', amount: 15000 }, active: true, since: today, createdAt: now },
        { id: u.uid(), for: '', trigger: 'hours', scope: 'total', targetId: null, hours: 10, priority: 'any', goalId: null, streakDays: 7, reward: { kind: 'permit', quantity: 2, unit: 'h', label: 'videojuegos' }, active: true, since: today, createdAt: now },
      );
    });
  }

  return { money, num, hoursText, rewardText, eventText, triggerText, goalName, hoursProgress, monthEarned, evaluate, balances, redeem, seedOnce, permitKey };
})();
