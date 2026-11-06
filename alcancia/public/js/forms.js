/* Formularios: movimiento, cuenta, categoría, gasto fijo, meta y cumplir meta. */
window.A = window.A || {};

A.forms = (() => {
  const { esc, money } = A.u;
  const st = () => A.store.state;

  const TYPES = [
    ['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Transferencia'], ['aporte', 'Aporte a meta'],
  ];

  function lastAccount(type) {
    const id = (st().settings.lastAccount || {})[type];
    const a = id && A.store.account(id);
    if (a && !a.archived) return a.id;
    const live = st().accounts.filter((x) => !x.archived && !A.store.isDebt(x));
    const first = live.find((x) => x.type === 'banco') || live[0];
    return first ? first.id : (st().accounts[0] || {}).id;
  }

  function catChips(kind, selectedTopId) {
    return `<div class="chips" role="radiogroup" aria-label="Categoría">
      ${A.store.topCategories(kind).map((c) => `
        <label class="chip" style="--cc:${A.store.catColor(c)}">
          <input type="radio" name="top" value="${c.id}" ${c.id === selectedTopId ? 'checked' : ''}>
          <span>${esc(c.icon || '')} ${esc(c.name)}</span>
        </label>`).join('')}
    </div>`;
  }

  function subSelect(topId, selectedId) {
    const subs = topId ? A.store.subcategories(topId) : [];
    if (!subs.length) return '';
    return `<label class="field"><span>Subcategoría <em>(opcional)</em></span>
      <select name="sub"><option value="">— ${esc(A.store.category(topId)?.name || '')} en general —</option>
      ${subs.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
  }

  function typeFields(type, v) {
    const top = v.categoryId ? A.store.topCategory(v.categoryId) : null;
    const topId = top ? top.id : null;
    const subId = v.categoryId && v.categoryId !== topId ? v.categoryId : null;
    if (type === 'gasto' || type === 'ingreso') {
      if (v.goalId && type === 'gasto') {
        const g = A.store.goal(v.goalId);
        var goalNote = `<p class="hint-box">🎯 Compra pagada con lo ahorrado en <b>${esc(g ? g.name : 'una meta')}</b>: no cuenta en el presupuesto del mes.</p>`;
      }
      return `
        ${goalNote || ''}
        <div class="field"><span>Categoría</span>${catChips(type, topId)}</div>
        <div data-sub>${subSelect(topId, subId)}</div>
        <label class="field"><span>${type === 'gasto' ? 'Pagado con' : 'Entró a'}</span>
          <select name="accountId">${A.ui.accountOptions(v.accountId || lastAccount(type), { filter: (a) => type === 'gasto' || !A.store.isDebt(a) })}</select></label>`;
    }
    if (type === 'transferencia') {
      return `
        <div class="field-row">
          <label class="field"><span>Desde</span><select name="accountId">${A.ui.accountOptions(v.accountId || lastAccount('transferencia'))}</select></label>
          <label class="field"><span>Hacia</span><select name="toAccountId">${A.ui.accountOptions(v.toAccountId, { placeholder: 'Elige…' })}</select></label>
        </div>
        <p class="hint">Para pagar la tarjeta: desde tu cuenta bancaria hacia la tarjeta. No cuenta como gasto (el gasto ya se contó al comprar).</p>`;
    }
    // aporte
    const goals = A.ui.goalOptions(v.goalId);
    if (!goals) return `<p class="empty-small">Aún no tienes metas. <button type="button" class="link" data-action="new-goal">Crea una</button> primero.</p>`;
    return `
      <label class="field"><span>Meta</span><select name="goalId">${goals}</select></label>
      <div class="field"><span>Movimiento</span>
        <div class="segmented">
          <label><input type="radio" name="dir" value="in" ${v.dir === 'out' || v.amount < 0 ? '' : 'checked'}><span>Aportar</span></label>
          <label><input type="radio" name="dir" value="out" ${v.dir === 'out' || v.amount < 0 ? 'checked' : ''}><span>Retirar</span></label>
        </div></div>
      <p class="hint">El dinero sigue en tu cuenta, pero queda apartado para la meta y deja de contar como dinero libre.</p>`;
  }

  /** Formulario de movimiento. mv = existente (editar) o null. preset = valores iniciales. */
  function movement(mv, preset = {}) {
    const isNew = !mv;
    const v = Object.assign({ type: 'gasto', date: A.u.todayKey(), amount: null, note: '' }, preset, mv || {});
    let type = v.type === 'ajuste' ? 'ajuste' : v.type;
    if (type === 'ajuste') return adjustEdit(mv);
    const typeSeg = `<div class="segmented type-seg" role="radiogroup" aria-label="Tipo">
      ${TYPES.map(([k, l]) => `<label><input type="radio" name="type" value="${k}" ${k === type ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    const body = `
      ${v.goalId && type === 'gasto' ? '' : typeSeg}
      <label class="field amount-field"><span>Monto</span>
        <div class="amount-wrap"><span class="amount-sign">$</span>
        <input name="amount" data-money inputmode="decimal" autocomplete="off" placeholder="0" value="${A.ui.moneyValue(v.amount)}" autofocus></div></label>
      <div data-typefields>${typeFields(type, v)}</div>
      <div class="field-row">
        <label class="field"><span>Fecha</span><input type="date" name="date" value="${v.date}" max="${A.u.addDaysKey(A.u.todayKey(), 366)}"></label>
        <label class="field"><span>Nota <em>(opcional)</em></span><input name="note" maxlength="140" value="${esc(v.note || '')}" placeholder="Ej. almuerzo con amigos"></label>
      </div>
      <p class="hint">Atajo: escribe <code>25k</code> para 25.000 o <code>1,5m</code> para 1.500.000.</p>`;

    A.ui.modal({
      title: isNew ? 'Nuevo movimiento' : 'Editar movimiento',
      body,
      wide: true,
      submitLabel: 'Guardar',
      extraButtons: isNew ? '<button type="submit" class="btn btn-ghost" value="another">Guardar y otro</button>' : '',
      onDelete: isNew ? null : async () => {
        if (!(await A.ui.confirm('¿Eliminar este movimiento? Los saldos y totales se recalculan.'))) return false;
        A.store.update((s) => { s.movements = s.movements.filter((x) => x.id !== mv.id); });
        A.ui.toast('Movimiento eliminado.');
        return true;
      },
      onMount(form) {
        const tf = form.querySelector('[data-typefields]');
        const bindTop = () => {
          form.querySelectorAll('input[name=top]').forEach((r) => r.addEventListener('change', () => {
            form.querySelector('[data-sub]').innerHTML = subSelect(r.value, null);
          }));
        };
        bindTop();
        form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => {
          type = r.value;
          tf.innerHTML = typeFields(type, { ...v, categoryId: null, accountId: null, goalId: type === 'aporte' ? v.goalId : null });
          bindTop();
        }));
      },
      onSubmit(d, form) {
        const amount = A.ui.readMoney(d.amount);
        if (!(amount > 0)) return A.ui.fieldError(form, 'amount', 'Escribe un monto mayor que 0.');
        if (!d.date) return A.ui.fieldError(form, 'date', 'Elige una fecha.');
        const rec = {
          id: isNew ? A.u.uid() : mv.id, type, amount, date: d.date, note: (d.note || '').trim(),
          accountId: null, toAccountId: null, categoryId: null, goalId: null,
          recurringId: v.recurringId || null, createdAt: isNew ? Date.now() : (mv.createdAt || Date.now()),
        };
        if (type === 'gasto' || type === 'ingreso') {
          if (!d.top) { form.querySelector('.chips').insertAdjacentHTML('afterend', '<p class="field-error">Elige una categoría.</p>'); return false; }
          rec.categoryId = d.sub || d.top;
          rec.accountId = d.accountId;
          if (type === 'gasto' && v.goalId) rec.goalId = v.goalId;
          if (type !== 'gasto') rec.recurringId = null;
        } else if (type === 'transferencia') {
          if (!d.toAccountId) return A.ui.fieldError(form, 'toAccountId', 'Elige la cuenta de destino.');
          if (d.toAccountId === d.accountId) return A.ui.fieldError(form, 'toAccountId', 'Debe ser otra cuenta.');
          rec.accountId = d.accountId; rec.toAccountId = d.toAccountId; rec.recurringId = null;
        } else if (type === 'aporte') {
          if (!d.goalId) return false;
          rec.goalId = d.goalId; rec.recurringId = null;
          if (d.dir === 'out') {
            const bal = A.stats.goalBalance(st(), d.goalId) + (mv && mv.goalId === d.goalId && mv.type === 'aporte' ? -mv.amount : 0);
            if (amount > bal) return A.ui.fieldError(form, 'amount', `Solo hay ${money(bal)} apartados en esa meta.`);
            rec.amount = -amount;
          }
        }
        A.store.update((s) => {
          s.settings.lastAccount = Object.assign({}, s.settings.lastAccount, rec.accountId ? { [type]: rec.accountId } : {});
          if (isNew) s.movements.push(rec);
          else s.movements[s.movements.findIndex((x) => x.id === mv.id)] = rec;
        });
        const what = type === 'gasto' ? `Gasto de ${money(amount)} en ${A.store.catLabel(rec.categoryId)}`
          : type === 'ingreso' ? `Ingreso de ${money(amount)}`
          : type === 'transferencia' ? `Transferencia de ${money(amount)}`
          : rec.amount < 0 ? `Retiraste ${money(amount)} de la meta` : `Apartaste ${money(amount)} 🎯`;
        A.ui.toast(`${what} ✓`, 'success', 2600);
        if (d.__submitter === 'another') {
          setTimeout(() => movement(null, { type, date: d.date, accountId: rec.accountId }), 10);
        }
        return true;
      },
    });
  }

  function adjustEdit(mv) {
    const a = A.store.account(mv.accountId);
    A.ui.modal({
      title: 'Ajuste de saldo',
      body: `<p class="muted small">Ajuste automático de <b>${esc(a ? a.name : '')}</b> del ${A.u.fmtDate(mv.date, { year: true })}. No cuenta como gasto ni ingreso.</p>
        <label class="field"><span>Monto <em>(negativo = bajó el saldo)</em></span><input name="amount" data-money="signed" value="${mv.amount < 0 ? '-' : ''}${A.ui.moneyValue(mv.amount)}"></label>
        <label class="field"><span>Nota</span><input name="note" value="${esc(mv.note || '')}"></label>`,
      onDelete: async () => {
        if (!(await A.ui.confirm('¿Eliminar este ajuste?'))) return false;
        A.store.update((s) => { s.movements = s.movements.filter((x) => x.id !== mv.id); });
        return true;
      },
      onSubmit(d, form) {
        const n = A.ui.readMoney(d.amount, { signed: true });
        if (Number.isNaN(n) || n === 0) return A.ui.fieldError(form, 'amount', 'Escribe un monto distinto de 0.');
        A.store.update(() => { mv.amount = n; mv.note = d.note.trim(); });
      },
    });
  }

  // ---------- Cuenta ----------
  function account(a) {
    const isNew = !a;
    const v = a || { type: 'banco', name: '', initial: 0 };
    const bal = isNew ? 0 : A.stats.balances(st()).get(a.id) || 0;
    const debt = A.store.isDebt(v);
    const typeOpts = Object.entries(A.ui.ACCOUNT_TYPES).map(([k, t]) => `<option value="${k}" ${k === v.type ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('');
    const extra = (type) => {
      if (type === 'credito') return `
        <div class="field-row">
          <label class="field"><span>Cupo total</span><input name="limit" data-money inputmode="decimal" value="${A.ui.moneyValue(v.limit)}" placeholder="0"></label>
          <span></span>
        </div>
        <div class="field-row">
          <label class="field"><span>Día de corte</span><input type="number" name="cutDay" min="1" max="31" value="${v.cutDay || ''}"></label>
          <label class="field"><span>Día límite de pago</span><input type="number" name="payDay" min="1" max="31" value="${v.payDay || ''}"></label>
        </div>`;
      if (type === 'prestamo') return `<label class="field"><span>Monto original del préstamo <em>(para medir cuánto llevas pagado)</em></span>
        <input name="original" data-money inputmode="decimal" value="${A.ui.moneyValue(v.original)}" placeholder="0"></label>`;
      return '';
    };
    const balLabel = (type) => (type === 'credito' || type === 'prestamo' ? 'Deuda actual' : 'Saldo actual');
    const body = `
      <div class="field-row">
        <label class="field"><span>Nombre</span><input name="name" maxlength="40" value="${esc(v.name)}" placeholder="Ej. Bancolombia"></label>
        <label class="field"><span>Tipo</span><select name="type" ${isNew ? '' : 'disabled'}>${typeOpts}</select></label>
      </div>
      <label class="field"><span data-ballabel>${balLabel(v.type)}</span>
        <input name="balance" data-money inputmode="decimal" value="${A.ui.moneyValue(debt ? -bal : bal)}" placeholder="0"></label>
      <p class="hint" data-balhint>${isNew ? 'Lo que hay hoy en la cuenta. Desde aquí, la app lo actualiza con cada movimiento.'
        : 'Si no coincide con lo real, corrígelo aquí: se crea un ajuste (no cuenta como gasto ni ingreso).'}</p>
      <div data-extra>${extra(v.type)}</div>
      ${isNew ? '' : `<label class="check-line"><input type="checkbox" name="archived" ${v.archived ? 'checked' : ''}> Archivar (ocultarla de los formularios)</label>`}`;

    A.ui.modal({
      title: isNew ? 'Nueva cuenta' : `Editar ${v.name}`,
      body,
      onMount(form) {
        const sel = form.querySelector('[name=type]');
        sel.addEventListener('change', () => {
          form.querySelector('[data-extra]').innerHTML = extra(sel.value);
          form.querySelector('[data-ballabel]').textContent = balLabel(sel.value);
          A.ui.initMoneyInputs(form.querySelector('[data-extra]'));
        });
      },
      onDelete: isNew ? null : async () => {
        const used = st().movements.some((m) => m.accountId === a.id || m.toAccountId === a.id) || st().recurring.some((r) => r.accountId === a.id);
        if (used) { A.ui.toast('Esta cuenta tiene movimientos. Archívala en vez de borrarla.', 'error', 5000); return false; }
        if (!(await A.ui.confirm(`¿Eliminar la cuenta "${a.name}"?`))) return false;
        A.store.update((s) => { s.accounts = s.accounts.filter((x) => x.id !== a.id); });
        return true;
      },
      onSubmit(d, form) {
        const name = (d.name || '').trim();
        if (!name) return A.ui.fieldError(form, 'name', 'Ponle un nombre.');
        const type = isNew ? d.type : v.type;
        const isD = type === 'credito' || type === 'prestamo';
        const entered = d.balance.trim() === '' ? 0 : A.ui.readMoney(d.balance);
        if (Number.isNaN(entered)) return A.ui.fieldError(form, 'balance', 'Monto no válido.');
        const target = isD ? -entered : entered;
        const extraVals = {};
        if (type === 'credito') {
          extraVals.limit = d.limit ? A.ui.readMoney(d.limit) || 0 : 0;
          extraVals.cutDay = Math.min(31, Math.max(0, Number(d.cutDay) || 0)) || null;
          extraVals.payDay = Math.min(31, Math.max(0, Number(d.payDay) || 0)) || null;
        }
        if (type === 'prestamo') extraVals.original = d.original ? A.ui.readMoney(d.original) || 0 : 0;
        A.store.update((s) => {
          if (isNew) {
            s.accounts.push({ id: A.u.uid(), name, type, initial: target, createdAt: Date.now(), archived: false, ...extraVals });
            return;
          }
          const acc = s.accounts.find((x) => x.id === a.id);
          Object.assign(acc, { name, archived: !!d.archived }, extraVals);
          const diff = target - bal;
          if (diff !== 0) {
            const hasMoves = s.movements.some((m) => m.accountId === a.id || m.toAccountId === a.id);
            if (!hasMoves) acc.initial = (Number(acc.initial) || 0) + diff;
            else s.movements.push({ id: A.u.uid(), type: 'ajuste', amount: diff, date: A.u.todayKey(), accountId: a.id, toAccountId: null, categoryId: null, goalId: null, recurringId: null, note: 'Ajuste de saldo', createdAt: Date.now() });
          }
        });
      },
    });
  }

  // ---------- Categoría ----------
  function category(c, { kind = 'gasto', parentId = null } = {}) {
    const isNew = !c;
    const v = c || { name: '', kind, parentId, icon: '', color: null, budget: null };
    const isTop = !v.parentId;
    const parents = A.store.topCategories(v.kind).filter((p) => !c || p.id !== c.id);
    const hasSubs = c && A.store.subcategories(c.id).length > 0;
    const sw = [null, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => `
      <label class="swatch" title="${i == null ? 'Gris' : `Color ${i + 1}`}"><input type="radio" name="color" value="${i == null ? '' : i}" ${v.color === i || (v.color == null && i == null) ? 'checked' : ''}>
      <span style="--sw:${i == null ? 'var(--c-none)' : `var(--c${i})`}"></span></label>`).join('');
    const body = `
      <div class="field-row">
        <label class="field"><span>Nombre</span><input name="name" maxlength="40" value="${esc(v.name)}"></label>
        <label class="field"><span>Dentro de</span>
          <select name="parentId" ${hasSubs ? 'disabled title="Tiene subcategorías"' : ''}>
            <option value="">— Es una categoría principal —</option>
            ${parents.map((p) => `<option value="${p.id}" ${p.id === v.parentId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select></label>
      </div>
      <div data-toponly ${isTop ? '' : 'hidden'}>
        <div class="field-row">
          <label class="field"><span>Ícono <em>(un emoji)</em></span><input name="icon" maxlength="4" value="${esc(v.icon || '')}" placeholder="🍽️"></label>
          <span></span>
        </div>
        <div class="field"><span>Color</span><div class="swatches">${sw}</div></div>
        ${v.kind === 'gasto' ? `
        <div class="field"><span>Límite mensual</span>
          <div class="inline-inputs">
            <select name="bmode" style="width:auto">
              <option value="none" ${!v.budget ? 'selected' : ''}>Sin límite</option>
              <option value="pct" ${v.budget?.mode === 'pct' ? 'selected' : ''}>% del ingreso</option>
              <option value="fixed" ${v.budget?.mode === 'fixed' ? 'selected' : ''}>Monto fijo</option>
            </select>
            <input name="bvalue" inputmode="decimal" value="${v.budget ? (v.budget.mode === 'fixed' ? A.ui.moneyValue(v.budget.value) : v.budget.value) : ''}" style="width:140px">
          </div></div>` : ''}
      </div>`;
    A.ui.modal({
      title: isNew ? (v.parentId ? 'Nueva subcategoría' : 'Nueva categoría') : 'Editar categoría',
      body,
      onMount(form) {
        const ps = form.querySelector('[name=parentId]');
        ps.addEventListener('change', () => { form.querySelector('[data-toponly]').hidden = !!ps.value; });
      },
      onDelete: isNew ? null : async () => {
        const used = st().movements.filter((m) => m.categoryId === c.id).length;
        if (hasSubs) { A.ui.toast('Primero elimina o mueve sus subcategorías.', 'error'); return false; }
        if (used && !c.parentId) { A.ui.toast(`Tiene ${used} movimientos. No se puede borrar una categoría principal con movimientos.`, 'error', 5000); return false; }
        const msg = used ? `Sus ${used} movimientos pasarán a "${A.store.category(c.parentId)?.name}".` : '¿Eliminar esta categoría?';
        if (!(await A.ui.confirm(msg))) return false;
        A.store.update((s) => {
          for (const m of s.movements) if (m.categoryId === c.id) m.categoryId = c.parentId;
          for (const r of s.recurring) if (r.categoryId === c.id) r.categoryId = c.parentId;
          s.categories = s.categories.filter((x) => x.id !== c.id);
        });
        return true;
      },
      onSubmit(d, form) {
        const name = (d.name || '').trim();
        if (!name) return A.ui.fieldError(form, 'name', 'Ponle un nombre.');
        const parent = hasSubs ? null : d.parentId || null;
        let budget = null;
        if (!parent && v.kind === 'gasto' && d.bmode && d.bmode !== 'none') {
          const val = d.bmode === 'fixed' ? A.ui.readMoney(d.bvalue) : Number(String(d.bvalue).replace(',', '.'));
          if (!(val > 0)) return A.ui.fieldError(form, 'bvalue', 'Escribe un valor mayor que 0.');
          if (d.bmode === 'pct' && val > 100) return A.ui.fieldError(form, 'bvalue', 'Máximo 100 %.');
          budget = { mode: d.bmode, value: val };
        }
        const rec = { name, parentId: parent, icon: parent ? '' : (d.icon || '').trim(), color: parent || d.color === '' || d.color == null ? null : Number(d.color), budget };
        A.store.update((s) => {
          if (isNew) s.categories.push({ id: A.u.uid(), kind: v.kind, ...rec });
          else Object.assign(s.categories.find((x) => x.id === c.id), rec);
        });
      },
    });
  }

  // ---------- Gasto fijo ----------
  function recurring(r) {
    const isNew = !r;
    const v = r || { name: '', amount: null, categoryId: null, accountId: lastAccount('transferencia'), day: 1, active: true };
    A.ui.modal({
      title: isNew ? 'Nuevo gasto fijo' : 'Editar gasto fijo',
      body: `
        <div class="field-row">
          <label class="field"><span>Nombre</span><input name="name" maxlength="40" value="${esc(v.name)}" placeholder="Ej. Arriendo"></label>
          <label class="field"><span>Monto mensual</span><input name="amount" data-money inputmode="decimal" value="${A.ui.moneyValue(v.amount)}" placeholder="0"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Categoría</span><select name="categoryId">${A.ui.categoryOptions('gasto', v.categoryId)}</select></label>
          <label class="field"><span>Se paga con</span><select name="accountId">${A.ui.accountOptions(v.accountId)}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Día del mes en que se paga</span><input type="number" name="day" min="1" max="31" value="${v.day}"></label>
          <span></span>
        </div>
        <label class="check-line"><input type="checkbox" name="active" ${v.active !== false ? 'checked' : ''}> Activo</label>
        <p class="hint" style="margin-top:10px">Cada periodo aparece como pendiente. Al marcarlo como pagado se registra el gasto (y puedes cambiar el monto si ese mes fue distinto).</p>`,
      onDelete: isNew ? null : async () => {
        if (!(await A.ui.confirm(`¿Eliminar "${r.name}"? Los pagos ya registrados se conservan como gastos normales.`))) return false;
        A.store.update((s) => {
          s.recurring = s.recurring.filter((x) => x.id !== r.id);
          for (const m of s.movements) if (m.recurringId === r.id) m.recurringId = null;
        });
        return true;
      },
      onSubmit(d, form) {
        const name = d.name.trim();
        if (!name) return A.ui.fieldError(form, 'name', 'Ponle un nombre.');
        const amount = A.ui.readMoney(d.amount);
        if (!(amount > 0)) return A.ui.fieldError(form, 'amount', 'Escribe un monto mayor que 0.');
        const day = Math.min(31, Math.max(1, Number(d.day) || 1));
        const rec = { name, amount, categoryId: d.categoryId, accountId: d.accountId, day, active: !!d.active };
        A.store.update((s) => {
          if (isNew) s.recurring.push({ id: A.u.uid(), ...rec });
          else Object.assign(s.recurring.find((x) => x.id === r.id), rec);
        });
      },
    });
  }

  /** Marcar un gasto fijo como pagado en este periodo. */
  function payRecurring(r, due) {
    const today = A.u.todayKey();
    movement(null, { type: 'gasto', amount: r.amount, categoryId: r.categoryId, accountId: r.accountId, recurringId: r.id, note: r.name, date: due < today ? due : today });
  }

  // ---------- Metas ----------
  const GOAL_KINDS = { compra: ['🛍️', 'Comprar algo'], ahorro: ['🐷', 'Ahorro'], emergencia: ['🛟', 'Fondo de emergencia'] };
  function goal(g, preset = {}) {
    const isNew = !g;
    const v = g || Object.assign({ name: '', emoji: '🎯', kind: 'compra', target: null, deadline: '' }, preset);
    const avg = A.stats.avgMonthlyExpenses(st());
    const body = `
      <div class="field"><span>Tipo</span><div class="segmented">
        ${Object.entries(GOAL_KINDS).map(([k, [ic, l]]) => `<label><input type="radio" name="kind" value="${k}" ${k === v.kind ? 'checked' : ''}><span>${ic} ${l}</span></label>`).join('')}
      </div></div>
      <div class="field-row">
        <label class="field"><span>Nombre</span><input name="name" maxlength="50" value="${esc(v.name)}" placeholder="Ej. Piano digital"></label>
        <label class="field"><span>Emoji</span><input name="emoji" maxlength="4" value="${esc(v.emoji || '')}" style="width:80px"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>¿Cuánto necesitas?</span><input name="target" data-money inputmode="decimal" value="${A.ui.moneyValue(v.target)}" placeholder="0"></label>
        <label class="field"><span>¿Para cuándo? <em>(opcional)</em></span><input type="date" name="deadline" value="${v.deadline || ''}" min="${A.u.todayKey()}"></label>
      </div>
      <div data-emerg ${v.kind === 'emergencia' ? '' : 'hidden'}>
        <p class="hint-box">🛟 Un fondo de emergencia cubre de 3 a 6 meses de gastos. ${avg > 0 ? `Tus gastos de un mes son unos <b>${money(avg)}</b>.` : 'Cuando registres gastos te sugeriré un monto.'}
        ${avg > 0 ? `<span class="btn-row" style="margin-top:8px"><button type="button" class="btn btn-sm btn-ghost" data-fill="${avg * 3}">3 meses · ${A.u.moneyShort(avg * 3)}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-fill="${avg * 6}">6 meses · ${A.u.moneyShort(avg * 6)}</button></span>` : ''}</p>
      </div>
      ${isNew ? '' : `<label class="check-line"><input type="checkbox" name="done" ${v.doneAt ? 'checked' : ''}> Cumplida</label>`}`;
    A.ui.modal({
      title: isNew ? 'Nueva meta' : 'Editar meta',
      body,
      onMount(form) {
        form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => {
          form.querySelector('[data-emerg]').hidden = r.value !== 'emergencia';
          const name = form.querySelector('[name=name]'), em = form.querySelector('[name=emoji]');
          if (r.value === 'emergencia' && !name.value) { name.value = 'Fondo de emergencia'; em.value = '🛟'; }
        }));
        form.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => {
          form.querySelector('[name=target]').value = A.u.groupDigits(b.dataset.fill);
        }));
      },
      onDelete: isNew ? null : async () => {
        const bal = A.stats.goalBalance(st(), g.id);
        const n = st().movements.filter((m) => m.goalId === g.id).length;
        if (!(await A.ui.confirm(`¿Eliminar "${g.name}"?${n ? ` Se borran sus ${n} aportes y movimientos ligados${bal > 0 ? ` (los ${money(bal)} apartados vuelven a ser dinero libre)` : ''}.` : ''}`))) return false;
        A.store.update((s) => {
          s.goals = s.goals.filter((x) => x.id !== g.id);
          s.movements = s.movements.filter((m) => !(m.type === 'aporte' && m.goalId === g.id));
          for (const m of s.movements) if (m.goalId === g.id) m.goalId = null;
        });
        return true;
      },
      onSubmit(d, form) {
        const name = d.name.trim();
        if (!name) return A.ui.fieldError(form, 'name', 'Ponle un nombre.');
        const target = A.ui.readMoney(d.target);
        if (!(target > 0)) return A.ui.fieldError(form, 'target', 'Escribe un monto mayor que 0.');
        const rec = { name, emoji: (d.emoji || '').trim() || GOAL_KINDS[d.kind][0], kind: d.kind, target, deadline: d.deadline || null };
        A.store.update((s) => {
          if (isNew) s.goals.push({ id: A.u.uid(), createdAt: Date.now(), doneAt: null, ...rec });
          else {
            const x = s.goals.find((y) => y.id === g.id);
            Object.assign(x, rec);
            if (d.done && !x.doneAt) x.doneAt = Date.now();
            if (!d.done) x.doneAt = null;
          }
        });
      },
    });
  }

  /** Cumplir una meta: para compras, registra el gasto pagado con lo ahorrado. */
  function completeGoal(g) {
    const p = A.stats.goalProgress(st(), g);
    if (g.kind !== 'compra') {
      A.ui.confirm(`¡Felicitaciones! Marca "${g.name}" como cumplida. Los ${money(p.balance)} siguen apartados; si los usas, regístralo como retiro.`, { okLabel: 'Marcar cumplida', danger: false, title: '🏅 Meta cumplida' })
        .then((ok) => { if (ok) A.store.update(() => { st().goals.find((x) => x.id === g.id).doneAt = Date.now(); }); });
      return;
    }
    A.ui.modal({
      title: `🛍️ ¡A comprar: ${g.name}!`,
      body: `
        <p class="muted small">Registra la compra. Se paga con lo apartado (${money(p.balance)}) y no afecta el presupuesto del mes.</p>
        <div class="field-row">
          <label class="field"><span>¿Cuánto costó?</span><input name="amount" data-money inputmode="decimal" value="${A.ui.moneyValue(Math.min(p.balance, g.target) || g.target)}"></label>
          <label class="field"><span>Fecha</span><input type="date" name="date" value="${A.u.todayKey()}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Categoría</span><select name="categoryId">${A.ui.categoryOptions('gasto', null)}</select></label>
          <label class="field"><span>Pagado con</span><select name="accountId">${A.ui.accountOptions(lastAccount('gasto'))}</select></label>
        </div>`,
      submitLabel: 'Registrar compra y cumplir meta',
      onSubmit(d, form) {
        const amount = A.ui.readMoney(d.amount);
        if (!(amount > 0)) return A.ui.fieldError(form, 'amount', 'Escribe un monto mayor que 0.');
        A.store.update((s) => {
          s.movements.push({ id: A.u.uid(), type: 'gasto', amount, date: d.date || A.u.todayKey(), accountId: d.accountId, toAccountId: null, categoryId: d.categoryId, goalId: g.id, recurringId: null, note: `${g.emoji || ''} ${g.name}`.trim(), createdAt: Date.now() });
          s.goals.find((x) => x.id === g.id).doneAt = Date.now();
        });
        const extra = p.balance - amount;
        if (extra > 0) A.ui.toast(`Sobraron ${money(extra)} apartados en la meta. Puedes retirarlos o pasarlos a otra meta.`, 'info', 6000);
      },
    });
  }

  /** Pagar la tarjeta / un préstamo: transferencia prellenada. */
  function payDebt(a) {
    const owed = Math.max(0, -(A.stats.balances(st()).get(a.id) || 0));
    const from = (st().settings.lastAccount || {}).transferencia;
    const fromAcc = from && A.store.account(from) && !A.store.isDebt(A.store.account(from)) ? from : (st().accounts.find((x) => !A.store.isDebt(x) && !x.archived) || {}).id;
    movement(null, { type: 'transferencia', toAccountId: a.id, accountId: fromAcc, amount: owed || null, note: `Pago ${a.name}` });
  }

  return { movement, account, category, recurring, payRecurring, goal, completeGoal, payDebt, GOAL_KINDS };
})();
