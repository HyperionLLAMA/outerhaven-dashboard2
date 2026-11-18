// Export for Linked Helper (14 Nov 2026, Tengku). HQ finds and filters targets; this hands their LinkedIn URLs to Linked Helper.
// Pick a lane and whose account sends it (any name, nothing fixed), tick the rows, download a CSV per version (A / B).
// Linked Helper's own "LH CSV" is checksum-locked (an edited or added column = file rejected), so we hand over plain profile URLs.
// Every exported company is logged in lh_exports (never exported twice, also skipped if Prosp already has it);
// the results import (later) matches Linked Helper's export back on linkedin_url to score A vs B.
import { sb, esc, $, $$, toast, modal, state } from './core.js';
import { loadContacts, contactOf, cfoChanged } from './contacts.js';
import { cleanName, deadlineOf } from './outreach.js';

const LANES = { credit: 'Private credit (refinancing)', rescue: 'Rescue (distressed)', funds: 'Funds (GPs)' };
const SENDER_DEFAULT = { credit: 'Tengku', rescue: 'Tengku', funds: 'Anaz' };   // only the first suggestion; any name works
const TEAM = ['Tengku', 'Peter', 'Chase', 'Anaz', 'Razeen', 'Sara', 'Dev', 'Sahid', 'Reza'];
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// A person we can message on LinkedIn: has a profile, isn't marked wrong, hasn't left, isn't the PE owner.
const liPerson = (kind, key) => (contactOf(kind, key)?.people || []).find(p => p.linkedin && p.status !== 'wrong' && !p.left && p.role !== 'sponsor') || null;

// Every target with a LinkedIn person, exported ones included (19 Nov 2026, Tengku: show who's been contacted, like Prosp's Status column).
async function rowsFor(lane) {
  const [ex, en] = await Promise.all([sb.from('lh_exports').select('kind,key,sender,version,created_at,status'), sb.from('outreach_enrollments').select('kind,key,created_at')]);
  const done = new Map([...(en.data || []).map(e => [`${e.kind}:${e.key}`, { via: 'Prosp', at: e.created_at }]),
    ...(ex.data || []).map(e => [`${e.kind}:${e.key}`, { via: 'Linked Helper', at: e.created_at, sender: e.sender, version: e.version, status: e.status }])]);
  const out = [];
  const add = (kind, key, s, score, loc = '') => { const p = liPerson(kind, key); if (p) out.push({ kind, key, s, p, score, loc, done: done.get(`${kind}:${key}`) || null, hook: kind === 'fund' ? null : deadlineOf(kind, s) }); };
  if (lane === 'funds') {
    await loadContacts('fund', true);
    const r = await sb.from('fund_signals').select('id,fund_key,company_name,score,list,executives').eq('verdict', 'target').eq('status', 'new').order('score', { ascending: false }).limit(3000);
    const best = new Map(); for (const s of r.data || []) { const k = s.fund_key || String(s.id); if (!best.has(k)) best.set(k, s); }
    for (const [k, s] of best) { const p = liPerson('fund', k); add('fund', k, s, s.score, ((s.executives || []).find(e => e.name === p?.name) || (s.executives || [])[0])?.location || ''); }
  } else {
    await Promise.all([loadContacts('credit', true), loadContacts('bdc', true)]);
    const cr = await sb.from('credit_signals').select('*').eq('verdict', lane === 'rescue' ? 'rescue' : 'target').eq('status', 'new').limit(2000);
    for (const s of cr.data || []) { const k = String(Number(s.cik)); add('credit', k, s, s.score + (cfoChanged(k) ? 10 : 0), s.state || ''); }   // new CFO first
    if (lane === 'credit') {
      const bd = await sb.from('bdc_signals').select('*').eq('verdict', 'target').eq('lane', 'refi').eq('status', 'new').not('owner_checked_at', 'is', null).neq('rules_version', 0).limit(2000);
      for (const s of bd.data || []) add('bdc', s.company_key, s, s.score);
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
const day = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const statusOf = d => !d ? '<span class="muted">Not contacted</span>'
  : d.via === 'Prosp' ? `In Prosp · ${day(d.at)}` : `Exported · ${esc(d.sender || '')} · ${day(d.at)}${d.version ? ` · ${d.version}` : ''}${d.status && d.status !== 'exported' ? ` · ${esc(d.status)}` : ''}`;

const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function toCsv(list, withVars) {
  const head = withVars ? ['profile_url', 'first_name', 'last_name', 'company', 'title', 'hook'] : ['profile_url'];
  const line = x => { const [first, ...rest] = String(x.p.name || '').trim().split(/\s+/);
    return (withVars ? [x.p.linkedin, first, rest.join(' '), cleanName(x.s.company_name), x.p.title || '', x.hook || ''] : [x.p.linkedin]).map(csvCell).join(','); };
  return [head.join(','), ...list.map(line)].join('\n') + '\n';
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function linkedHelperModal(onDone, startLane) {
  let lane = startLane || store.get('hq-lh-lane') || 'credit', list = [], sel = null;   // sel = ticked row indexes, kept across views
  const sender = () => store.get(`hq-lh-sender-${lane}`) || SENDER_DEFAULT[lane];
  const { el } = modal({
    title: 'Export LinkedIn list (Linked Helper / Prosp)', submit: 'Download', wide: true,
    body: `<div class="form pForm">
      <label class="field">Lane<select class="select" name="lane">${Object.entries(LANES).map(([k, l]) => `<option value="${k}" ${k === lane ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Sent from (whose LinkedIn)<input class="input" name="sender" list="lhTeam" value="${esc(sender())}" required><datalist id="lhTeam">${TEAM.map(n => `<option value="${n}">`).join('')}</datalist></label>
      <label class="field">How many<input class="input" name="n" type="number" min="1" max="500" value="${store.get('hq-lh-n') || 50}"></label>
      <label class="field"><span><input type="checkbox" name="ab" ${store.get('hq-lh-ab') === '0' ? '' : 'checked'}> Split into A and B (two files, one per campaign)</span></label>
      <label class="field" style="grid-column:1/-1"><span><input type="checkbox" name="vars" ${store.get('hq-lh-vars') === '1' ? 'checked' : ''}> Add first name, company and hook columns (only with Linked Helper's custom-variables plug-in)</span></label>
      <div id="lhList" style="grid-column:1/-1"><div class="empty">Loading…</div></div></div>`,
    async onSubmit(fd) {
      const picked = [...sel].sort((a, b) => a - b).map(i => list[i]).filter(x => x && !x.done);
      const who = String(fd.get('sender') || '').trim();
      if (!picked.length || !who) { toast(who ? 'Nothing ticked' : 'Say whose account sends it'); return false; }
      const ab = !!fd.get('ab'), vars = !!fd.get('vars'), batch = crypto.randomUUID();
      picked.forEach((x, i) => x.v = ab && i % 2 ? 'B' : 'A');   // alternate down the score order, so A and B get the same quality
      const r = await sb.from('lh_exports').insert(picked.map(x => ({ kind: x.kind, key: x.key, lane, company_name: x.s.company_name, person_name: x.p.name, title: x.p.title || null,
        linkedin_url: x.p.linkedin, hook: x.hook, sender: who, version: x.v, batch_id: batch, exported_by: state.user?.email || null })));
      if (r.error) { toast(r.error.message); return false; }
      const day = new Date().toISOString().slice(0, 10), tag = `${lane}-${who.toLowerCase()}-${day}`;
      for (const v of ab ? ['A', 'B'] : ['A']) download(`lh-${tag}${ab ? '-' + v : ''}.csv`, toCsv(picked.filter(x => x.v === v), vars));
      store.set(`hq-lh-sender-${lane}`, who); store.set('hq-lh-ab', ab ? '1' : '0'); store.set('hq-lh-vars', vars ? '1' : '0');
      toast(`${picked.length} exported${ab ? ` (${picked.filter(x => x.v === 'A').length} A, ${picked.filter(x => x.v === 'B').length} B)` : ''}. In Linked Helper: open the campaign → Add → upload the file.`);
      onDone?.();
    },
  });
  const box = $('#lhList', el), nIn = $('[name=n]', el), btn = $('button[type=submit]', el);
  let view = 'new';
  const recount = () => {
    const n = sel.size, all = $('#lhAll', el), boxes = $$('[name=pick]:not(:disabled)', el), on = boxes.filter(b => b.checked).length;
    if (all) { all.checked = !!boxes.length && on === boxes.length; all.indeterminate = on > 0 && on < boxes.length; }
    const c = $('#lhSel', el); if (c) c.textContent = `${n} selected`;
    btn.textContent = n ? `Download ${n}` : 'Nothing ticked'; btn.disabled = !n;
  };
  const draw = () => {
    const n = Math.max(1, Number(nIn.value) || 50), fresh = list.filter(x => !x.done).length, old = list.length - fresh;
    if (!sel) { let k = 0; sel = new Set(list.map((x, i) => !x.done && x.p.status !== 'unconfirmed' && k++ < n ? i : -1).filter(i => i >= 0)); }   // "How many" = first n not contacted, confirmed
    const rows = list.map((x, i) => [x, i]).filter(([x]) => view === 'all' || (view === 'new' ? !x.done : x.done));
    box.innerHTML = list.length ? `<div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin:0 0 8px;flex-wrap:wrap">
        <div class="pSeg" role="group">${[['new', 'Not contacted', fresh], ['done', 'Already contacted', old], ['all', 'All', list.length]].map(([v, l, c]) => `<button type="button" data-view="${v}" class="${view === v ? 'on' : ''}">${l}<em>${c}</em></button>`).join('')}</div>
        <b id="lhSel">0 selected</b></div>
      <p class="s muted" style="margin:0 0 8px">Best score first. Anyone already exported or in Prosp is locked, so nobody gets contacted twice.</p>
      <div style="max-height:52vh;overflow:auto"><table class="tbl obTbl"><thead style="position:sticky;top:0;background:var(--card, var(--bg))"><tr><th><input type="checkbox" id="lhAll" aria-label="Select all not contacted"></th><th>Person</th><th>Company</th><th>Location</th><th>Hook</th><th>Status</th></tr></thead><tbody>
      ${rows.map(([x, i]) => `<tr${x.done ? ' style="opacity:.55"' : ''}><td><input type="checkbox" name="pick" value="${i}" ${sel.has(i) ? 'checked' : ''} ${x.done ? 'disabled' : ''} aria-label="Export ${esc(x.p.name)}"></td>
        <td><a href="${esc(x.p.linkedin)}" target="_blank" rel="noopener"><b>${esc(x.p.name)}</b> ↗</a><br><span class="s muted">${esc(x.p.title || (x.p.role || '').toUpperCase())}${x.p.status === 'confirmed' ? ' · confirmed' : x.p.status === 'unconfirmed' ? ' · ? check profile' : x.p.source === 'sec' ? ' · SEC' : ''}</span></td>
        <td>${esc(cleanName(x.s.company_name))}<br><span class="s muted">${x.kind === 'bdc' ? 'BDC' : x.kind === 'fund' ? 'Fund' : 'Public'} · score ${x.s.score}</span></td>
        <td class="s">${x.loc ? esc(x.loc) : '<span class="muted">–</span>'}</td>
        <td class="s">${x.hook ? esc(x.hook) : '<span class="muted">none</span>'}</td>
        <td class="s">${statusOf(x.done)}</td></tr>`).join('') || `<tr><td colspan="6"><div class="empty">Nobody here.</div></td></tr>`}</tbody></table></div>`
      : `<div class="empty">Nobody in this lane has a LinkedIn profile yet. Profiles fill in as the contact lookup runs.</div>`;
    $$('[name=pick]', el).forEach(b => b.addEventListener('change', () => { b.checked ? sel.add(+b.value) : sel.delete(+b.value); recount(); }));
    $('#lhAll', el)?.addEventListener('change', e => { $$('[name=pick]:not(:disabled)', el).forEach(b => { b.checked = e.target.checked; b.checked ? sel.add(+b.value) : sel.delete(+b.value); }); recount(); });
    $$('[data-view]', el).forEach(b => b.addEventListener('click', () => { view = b.dataset.view; draw(); }));
    recount();
  };
  const load = async () => { box.innerHTML = '<div class="empty">Loading…</div>'; list = await rowsFor(lane); sel = null; draw(); };
  $('[name=lane]', el).addEventListener('change', e => { lane = e.target.value; store.set('hq-lh-lane', lane); $('[name=sender]', el).value = sender(); load(); });
  nIn.addEventListener('change', () => { store.set('hq-lh-n', nIn.value); sel = null; draw(); });
  load();
}
