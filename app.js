const $ = s => document.querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'সমস্যা হয়েছে');
  return d;
}

let ME = null, TAX = null;

async function boot() {
  try {
    const me = await api('/me');
    ME = me.user; ME.settings = me.settings; ME.pending = me.pending_requests || 0;
    TAX = await api('/taxonomy');
  } catch (e) { return; }
  $('#brand').textContent = ME.settings.site_name;
  document.title = ME.settings.site_name;
  $('#whoami').textContent = ME.name;
  if (!ME.can_manage) $('#adminTab').classList.add('hidden');
  else updateAdminBadge(ME.pending);
  $('#logout').onclick = async () => { await api('/logout', 'POST'); location.href = '/login'; };
  document.querySelectorAll('#tabs button[data-tab]').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  switchTab('dashboard');
}
function updateAdminBadge(n) {
  const t = $('#adminTab');
  t.innerHTML = 'অ্যাডমিন' + (n > 0 ? ` <span class="badge">${n}</span>` : '');
}

function switchTab(name) {
  document.querySelectorAll('#tabs button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['dashboard', 'entries', 'admin'].forEach(v => $('#view-' + v).classList.toggle('hidden', v !== name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'entries') renderEntries();
  if (name === 'admin') renderAdmin();
}

// ===================================================== DASHBOARD
const STATUS_BN = { ok: '✅ ঠিক আছে', gap: '⚠️ গ্যাপ', unpublished: '🟠 পোস্ট বাকি', none: '🔴 নেই' };
function statusChip(s, since) {
  let txt = STATUS_BN[s];
  if (s === 'gap' && since != null) txt = `⚠️ গ্যাপ (${since} দিন)`;
  return `<span class="chip ${s}">${txt}</span>`;
}
async function renderDashboard() {
  const root = $('#view-dashboard');
  root.innerHTML = '<p class="hint">লোড হচ্ছে…</p>';
  const d = await api('/dashboard');
  const k = d.kpi;
  const headRows = d.headRows.map(r => `<tr>
      <td><b>${esc(r.name)}</b></td>
      <td class="center">${r.created}</td>
      <td class="center">${r.published}</td>
      <td class="center">${r.pending}</td>
      <td class="center">${r.last ? esc(r.last) : '—'}</td>
      <td class="center">${r.since == null ? '—' : r.since}</td>
      <td>${statusChip(r.status, r.since)}</td></tr>`).join('');
  const typeRows = d.typeRows.map(r => `<tr>
      <td>${esc(r.name)}</td>
      <td class="hint">${esc(r.head_name)}</td>
      <td class="center">${r.created}</td>
      <td class="center">${r.published}</td>
      <td class="center">${r.last ? esc(r.last) : '—'}</td>
      <td>${statusChip(r.status, r.since)}</td></tr>`).join('');
  const platRows = d.platforms.map(p => `<tr><td>${esc(p.name)}</td><td class="center">${p.published}</td></tr>`).join('');
  const dayRows = d.last7.map(x => {
    const dt = new Date(x.date + 'T00:00');
    const lbl = dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    return `<tr><td>${lbl}</td><td class="center">${x.published}</td></tr>`;
  }).join('');

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="label">📦 মোট কন্টেন্ট</div><div class="num">${k.totalCreated}</div></div>
      <div class="kpi green"><div class="label">✅ পাবলিশড</div><div class="num">${k.totalPublished}</div></div>
      <div class="kpi amber"><div class="label">⏳ বাকি (Pending)</div><div class="num">${k.totalPending}</div></div>
      <div class="kpi"><div class="label">🗓️ শেষ ৭ দিনে</div><div class="num">${k.last7Published}</div></div>
    </div>
    <div class="section"><h2>📁 কন্টেন্ট হেড অনুযায়ী গ্যাপ <span class="hint" style="color:#cfe8e8">গ্যাপ সীমা: ${d.threshold} দিন</span></h2>
      <div class="tablewrap"><table>
        <thead><tr><th>হেড</th><th class="center">তৈরি</th><th class="center">পাবলিশড</th><th class="center">বাকি</th><th class="center">শেষ পোস্ট</th><th class="center">কত দিন আগে</th><th>অবস্থা</th></tr></thead>
        <tbody>${headRows}</tbody></table></div></div>
    <div class="section"><h2>🎬 কন্টেন্ট টাইপ অনুযায়ী (ঠিক কোন কন্টেন্ট যাচ্ছে)</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>টাইপ</th><th>হেড</th><th class="center">তৈরি</th><th class="center">পাবলিশড</th><th class="center">শেষ পোস্ট</th><th>অবস্থা</th></tr></thead>
        <tbody>${typeRows}</tbody></table></div></div>
    <div class="row">
      <div class="section"><h2>📱 প্ল্যাটফর্ম অনুযায়ী পাবলিশড</h2>
        <div class="tablewrap"><table><thead><tr><th>প্ল্যাটফর্ম</th><th class="center">পাবলিশড</th></tr></thead><tbody>${platRows}</tbody></table></div></div>
      <div class="section"><h2>🗓️ শেষ ৭ দিন — দৈনিক পোস্ট</h2>
        <div class="tablewrap"><table><thead><tr><th>তারিখ</th><th class="center">পাবলিশড</th></tr></thead><tbody>${dayRows}</tbody></table></div></div>
    </div>`;
}

// ===================================================== ENTRIES
let ENTRIES = [];
function opt(arr, val, key = 'id', label = 'name') {
  return arr.map(o => `<option value="${o[key]}" ${String(o[key]) === String(val) ? 'selected' : ''}>${esc(o[label])}</option>`).join('');
}
async function renderEntries() {
  const root = $('#view-entries');
  root.innerHTML = '<p class="hint">লোড হচ্ছে…</p>';
  ENTRIES = await api('/entries');
  const canCreate = ME.can_create || ME.can_manage;
  const headFilter = `<select id="fHead"><option value="">সব হেড</option>${opt(TAX.heads)}</select>`;
  const statusFilter = `<select id="fStatus"><option value="">সব স্ট্যাটাস</option>${TAX.publish_status.map(s => `<option>${s}</option>`).join('')}</select>`;
  root.innerHTML = `
    <div class="toolbar">
      <div class="grow"><input id="fSearch" placeholder="🔍 টপিক খুঁজুন…"></div>
      ${headFilter}${statusFilter}
      ${canCreate ? '<button class="btn" id="addBtn">+ নতুন এন্ট্রি</button>' : ''}
    </div>
    <div id="entryList"></div>`;
  if (canCreate) $('#addBtn').onclick = () => openEntryModal(null);
  ['fSearch', 'fHead', 'fStatus'].forEach(id => $('#' + id).addEventListener('input', drawEntries));
  drawEntries();
}
function drawEntries() {
  const q = ($('#fSearch')?.value || '').toLowerCase();
  const fh = $('#fHead')?.value || '';
  const fs = $('#fStatus')?.value || '';
  const list = ENTRIES.filter(e =>
    (!q || (e.title || '').toLowerCase().includes(q)) &&
    (!fh || String(e.head_id) === fh) &&
    (!fs || e.publish_status === fs));
  const box = $('#entryList');
  if (!list.length) { box.innerHTML = '<p class="hint">কোনো এন্ট্রি নেই।</p>'; return; }
  box.innerHTML = list.map(e => {
    const canEdit = ME.can_manage || (ME.can_create && e.created_by === ME.id) || ME.can_publish;
    return `<div class="entry-card">
      <div class="top">
        <div>
          <div class="title">${esc(e.title)}</div>
          <div class="meta">${esc(e.head_name)} › ${esc(e.type_name || '—')} • ${esc(e.date_created)} • ✍️ ${esc(e.created_by_name || '—')}</div>
        </div>
        ${canEdit ? `<button class="btn ghost sm" onclick="openEntryModal(${e.id})">এডিট</button>` : ''}
      </div>
      <div class="chips">
        <span class="chip gray">তৈরি: ${esc(e.prod_status)}</span>
        <span class="chip ${e.publish_status}">${esc(e.publish_status)}</span>
        ${e.platform_name ? `<span class="chip gray">${esc(e.platform_name)}</span>` : ''}
        ${e.posted_by_name ? `<span class="chip gray">📤 ${esc(e.posted_by_name)}</span>` : ''}
        ${e.link ? `<a class="chip gray" href="${esc(e.link)}" target="_blank" rel="noopener">🔗 লিংক</a>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openEntryModal(id) {
  const e = id ? ENTRIES.find(x => x.id === id) : null;
  const canCore = ME.can_manage || !id || (ME.can_create && e && e.created_by === ME.id);
  const canPub = ME.can_manage || ME.can_publish;
  const typesFor = hid => TAX.types.filter(t => String(t.head_id) === String(hid));
  const curHead = e ? e.head_id : (TAX.heads[0] && TAX.heads[0].id);
  const m = el(`<div class="modal-bg"><div class="modal">
    <h3>${id ? 'এন্ট্রি এডিট' : 'নতুন কন্টেন্ট এন্ট্রি'} <button class="x">&times;</button></h3>
    <div class="mbody">
      <div id="eErr"></div>
      <div class="row">
        <div><label>তারিখ</label><input id="m_date" type="date" value="${e ? esc(e.date_created) : todayISO()}" ${canCore ? '' : 'disabled'}></div>
        <div><label>Created By (এমপ্লয়ি)</label><select id="m_cb" ${canCore ? '' : 'disabled'}>${opt(TAX.users, e ? e.created_by : ME.id)}</select></div>
      </div>
      <div class="row">
        <div><label>কন্টেন্ট হেড</label><select id="m_head" ${canCore ? '' : 'disabled'}>${opt(TAX.heads, curHead)}</select></div>
        <div><label>কন্টেন্ট টাইপ</label><select id="m_type" ${canCore ? '' : 'disabled'}>${opt(typesFor(curHead), e ? e.type_id : '')}</select></div>
      </div>
      <label>টপিক / শিরোনাম</label>
      <input id="m_title" value="${e ? esc(e.title) : ''}" ${canCore ? '' : 'disabled'} placeholder="যেমন: Funny EN→BN meme #12">
      <label>Production Status (তৈরির অবস্থা)</label>
      <select id="m_prod" ${canCore ? '' : 'disabled'}>${TAX.prod_status.map(s => `<option ${e && e.prod_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>

      <div style="border-top:1px dashed var(--line);margin:16px 0 4px;padding-top:6px"></div>
      <p class="hint">📤 পোস্ট তথ্য ${canPub ? '(এক্সিকিউটিভ পূরণ করবে)' : '— তোমার পোস্ট করার অনুমতি নেই'}</p>
      <div class="row">
        <div><label>পোস্ট তারিখ</label><input id="m_pdate" type="date" value="${e && e.publish_date ? esc(e.publish_date) : ''}" ${canPub ? '' : 'disabled'}></div>
        <div><label>প্ল্যাটফর্ম</label><select id="m_plat" ${canPub ? '' : 'disabled'}><option value="">—</option>${opt(TAX.platforms, e ? e.platform_id : '')}</select></div>
      </div>
      <div class="row">
        <div><label>Posted By (এক্সিকিউটিভ)</label><select id="m_pb" ${canPub ? '' : 'disabled'}><option value="">—</option>${opt(TAX.users, e ? e.posted_by : '')}</select></div>
        <div><label>Publish Status</label><select id="m_pstatus" ${canPub ? '' : 'disabled'}>${TAX.publish_status.map(s => `<option ${e && e.publish_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div>
      <label>পোস্ট লিংক</label>
      <input id="m_link" value="${e ? esc(e.link) : ''}" ${canPub ? '' : 'disabled'} placeholder="https://...">
    </div>
    <div class="mfoot">
      ${id && (ME.can_manage || (ME.can_create && e && e.created_by === ME.id)) ? '<button class="btn danger" id="m_del" style="margin-right:auto">ডিলিট</button>' : ''}
      <button class="btn ghost x2">বাতিল</button>
      <button class="btn" id="m_save">সেভ</button>
    </div></div></div>`);
  $('#modal-root').appendChild(m);
  const close = () => m.remove();
  m.querySelector('.x').onclick = close;
  m.querySelector('.x2').onclick = close;
  m.onclick = ev => { if (ev.target === m) close(); };
  m.querySelector('#m_head').onchange = () => {
    const hid = m.querySelector('#m_head').value;
    m.querySelector('#m_type').innerHTML = opt(typesFor(hid), '');
  };
  if (m.querySelector('#m_del')) m.querySelector('#m_del').onclick = async () => {
    if (!confirm('এই এন্ট্রি ডিলিট করবেন?')) return;
    try { await api('/entries/' + id, 'DELETE'); close(); renderEntries(); } catch (er) { showErr('#eErr', er.message); }
  };
  m.querySelector('#m_save').onclick = async () => {
    const payload = {
      date_created: m.querySelector('#m_date').value,
      created_by: m.querySelector('#m_cb').value,
      head_id: m.querySelector('#m_head').value,
      type_id: m.querySelector('#m_type').value,
      title: m.querySelector('#m_title').value,
      prod_status: m.querySelector('#m_prod').value,
      publish_date: m.querySelector('#m_pdate').value,
      platform_id: m.querySelector('#m_plat').value,
      posted_by: m.querySelector('#m_pb').value,
      publish_status: m.querySelector('#m_pstatus').value,
      link: m.querySelector('#m_link').value,
    };
    try {
      if (id) await api('/entries/' + id, 'PUT', payload);
      else await api('/entries', 'POST', payload);
      close(); renderEntries();
    } catch (er) { showErr('#eErr', er.message); }
  };
}
function showErr(sel, msg) { const t = document.querySelector(sel); if (t) t.innerHTML = `<div class="err">${esc(msg)}</div>`; }

// ===================================================== ADMIN
let adminSub = 'requests';
async function renderAdmin() {
  const root = $('#view-admin');
  root.innerHTML = `<div class="adminsub">
    <button data-s="requests">🔔 রিকোয়েস্ট${ME.pending > 0 ? ` <span class="badge">${ME.pending}</span>` : ''}</button>
    <button data-s="users">👥 ইউজার ও অ্যাক্সেস</button>
    <button data-s="taxonomy">🗂️ হেড / টাইপ / প্ল্যাটফর্ম</button>
    <button data-s="settings">⚙️ সেটিংস</button>
  </div><div id="adminBody"></div>`;
  root.querySelectorAll('.adminsub button').forEach(b => {
    b.classList.toggle('active', b.dataset.s === adminSub);
    b.onclick = () => { adminSub = b.dataset.s; renderAdmin(); };
  });
  if (adminSub === 'requests') await adminRequests();
  if (adminSub === 'users') await adminUsers();
  if (adminSub === 'taxonomy') await adminTaxonomy();
  if (adminSub === 'settings') adminSettings();
}

async function adminRequests() {
  const body = $('#adminBody');
  body.innerHTML = '<p class="hint">লোড হচ্ছে…</p>';
  const reqs = await api('/requests');
  window.__reqs = reqs;
  ME.pending = reqs.filter(r => r.status === 'pending').length;
  updateAdminBadge(ME.pending);
  const pend = reqs.filter(r => r.status === 'pending');
  const done = reqs.filter(r => r.status !== 'pending');
  const card = r => `<div class="entry-card">
    <div class="top"><div>
      <div class="title">${esc(r.name)}</div>
      <div class="meta">${esc(r.email)}${r.note ? ' • ' + esc(r.note) : ''}</div>
    </div>
    ${r.status === 'pending'
      ? `<div style="display:flex;gap:6px"><button class="btn sm" onclick="approveReq(${r.id})">✅ অনুমোদন</button><button class="btn danger sm" onclick="rejectReq(${r.id})">✖ বাতিল</button></div>`
      : `<span class="chip ${r.status === 'approved' ? 'ok' : 'none'}">${r.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'}</span>`}
    </div></div>`;
  body.innerHTML = `
    <div class="section"><h2>🔔 অপেক্ষমাণ রিকোয়েস্ট ${pend.length ? `<span class="badge">${pend.length}</span>` : ''}</h2>
      <div class="body">${pend.length ? pend.map(card).join('') : '<p class="hint">নতুন কোনো রিকোয়েস্ট নেই।</p>'}</div></div>
    ${done.length ? `<div class="section"><h2>📜 আগের রিকোয়েস্ট</h2><div class="body">${done.map(card).join('')}</div></div>` : ''}`;
}
window.approveReq = id => {
  const r = window.__reqs.find(x => x.id === id);
  const m = el(`<div class="modal-bg"><div class="modal">
    <h3>রিকোয়েস্ট অনুমোদন <button class="x">&times;</button></h3>
    <div class="mbody"><div id="aErr"></div>
      <p class="hint">${esc(r.name)} — <b>${esc(r.email)}</b></p>
      <label>এই কর্মীকে কোন রোল দেবেন? (অনুমতি)</label>
      <div class="perm">
        <label><input type="checkbox" id="a_create" checked> কন্টেন্ট তৈরি</label>
        <label><input type="checkbox" id="a_publish"> পোস্ট / লিংক</label>
        <label><input type="checkbox" id="a_manage"> অ্যাডমিন</label>
      </div>
      <label>পাসওয়ার্ড <span class="hint">(খালি রাখলে অটো তৈরি হবে)</span></label>
      <input id="a_pass" type="text" placeholder="অটো">
      <label class="perm" style="margin-top:10px"><input type="checkbox" id="a_invite" ${ME.settings.smtp_configured ? 'checked' : ''}> 📧 অনুমোদনের পর লগইন তথ্য ইমেইলে পাঠাও</label>
      <p class="hint">${ME.settings.smtp_configured ? 'SMTP চালু — ইমেইল যাবে।' : '⚠️ SMTP সেট নেই — অনুমোদন হবে, পাসওয়ার্ডটি নিচে দেখানো হবে; আপনি নিজে জানিয়ে দেবেন।'}</p>
    </div>
    <div class="mfoot"><button class="btn ghost x2">বাতিল</button><button class="btn" id="a_ok">অনুমোদন করুন</button></div>
  </div></div>`);
  $('#modal-root').appendChild(m);
  const close = () => m.remove();
  m.querySelector('.x').onclick = close; m.querySelector('.x2').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  m.querySelector('#a_ok').onclick = async () => {
    const p = {
      can_create: m.querySelector('#a_create').checked,
      can_publish: m.querySelector('#a_publish').checked,
      can_manage: m.querySelector('#a_manage').checked,
      password: m.querySelector('#a_pass').value,
      send_invite: m.querySelector('#a_invite').checked,
    };
    try {
      const res = await api('/requests/' + id + '/approve', 'POST', p);
      close(); renderAdmin();
      let msg = `✅ অনুমোদিত! লগইন ইমেইল: ${res.user.email}\nপাসওয়ার্ড: ${res.password}`;
      if (p.send_invite) msg += res.invite && res.invite.sent ? '\n📧 ইমেইল পাঠানো হয়েছে।' : '\n⚠️ ইমেইল যায়নি: ' + (res.invite ? res.invite.reason : '');
      alert(msg);
    } catch (er) { showErr('#aErr', er.message); }
  };
};
window.rejectReq = async id => {
  if (!confirm('এই রিকোয়েস্ট বাতিল করবেন?')) return;
  await api('/requests/' + id + '/reject', 'POST'); renderAdmin();
};

async function adminUsers() {
  const users = await api('/users');
  const body = $('#adminBody');
  const rows = users.map(u => `<tr>
    <td><b>${esc(u.name)}</b><div class="hint">${esc(u.email || '@' + u.username)}</div></td>
    <td class="center">${u.can_create ? '✅' : '—'}</td>
    <td class="center">${u.can_publish ? '✅' : '—'}</td>
    <td class="center">${u.can_manage ? '✅' : '—'}</td>
    <td class="center">${u.active ? '<span class="chip ok">সক্রিয়</span>' : '<span class="chip none">বন্ধ</span>'}</td>
    <td class="center"><button class="btn ghost sm" onclick="editUser(${u.id})">এডিট</button></td></tr>`).join('');
  body.innerHTML = `<div class="section"><h2>👥 কর্মী ও অ্যাক্সেস <button class="btn sm" id="addUser">+ নতুন কর্মী</button></h2>
    <div class="tablewrap"><table>
      <thead><tr><th>নাম</th><th class="center">তৈরি</th><th class="center">পোস্ট</th><th class="center">অ্যাডমিন</th><th class="center">অবস্থা</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="body"><p class="hint">টিক চিহ্ন = অনুমতি আছে। <b>তৈরি</b> = কন্টেন্ট এন্ট্রি দিতে পারবে · <b>পোস্ট</b> = পোস্ট তথ্য/লিংক দিতে পারবে · <b>অ্যাডমিন</b> = সবকিছু নিয়ন্ত্রণ।</p></div></div>`;
  window.__users = users;
  $('#addUser').onclick = () => userModal(null);
}
window.editUser = id => userModal(window.__users.find(u => u.id === id));
function userModal(u) {
  const m = el(`<div class="modal-bg"><div class="modal">
    <h3>${u ? 'কর্মী এডিট' : 'নতুন কর্মী'} <button class="x">&times;</button></h3>
    <div class="mbody"><div id="uErr"></div>
      <label>পুরো নাম</label><input id="u_name" value="${u ? esc(u.name) : ''}">
      <label>ইমেইল <span class="hint">(এটাই লগইন আইডি)</span></label>
      <input id="u_email" type="email" autocapitalize="none" value="${u ? esc(u.email || '') : ''}" placeholder="name@example.com">
      <label>পাসওয়ার্ড ${u ? '<span class="hint">(বদলাতে চাইলে নতুন দিন, নাহলে খালি)</span>' : ''}</label>
      <input id="u_pass" type="text" placeholder="${u ? 'খালি রাখলে অপরিবর্তিত' : 'পাসওয়ার্ড দিন'}">
      <label>অ্যাক্সেস (অনুমতি)</label>
      <div class="perm">
        <label><input type="checkbox" id="u_create" ${!u || u.can_create ? 'checked' : ''}> কন্টেন্ট তৈরি</label>
        <label><input type="checkbox" id="u_publish" ${u && u.can_publish ? 'checked' : ''}> পোস্ট / লিংক</label>
        <label><input type="checkbox" id="u_manage" ${u && u.can_manage ? 'checked' : ''}> অ্যাডমিন</label>
        <label><input type="checkbox" id="u_active" ${!u || u.active ? 'checked' : ''}> সক্রিয়</label>
      </div>
      ${!u ? `<label class="perm" style="margin-top:12px"><input type="checkbox" id="u_invite" ${ME.settings.smtp_configured ? 'checked' : ''}> 📧 লগইন তথ্য এই ইমেইলে পাঠাও</label>
      <p class="hint">${ME.settings.smtp_configured ? 'SMTP চালু আছে — ইমেইল চলে যাবে।' : '⚠️ ইমেইল পাঠাতে আগে সেটিংস → ইমেইল (SMTP) সেট করতে হবে। নাহলে অ্যাকাউন্ট তৈরি হবে কিন্তু মেইল যাবে না।'}</p>` : ''}
      ${u ? `<div style="margin-top:12px"><button class="btn ghost sm" id="u_resend">📧 নতুন পাসওয়ার্ড দিয়ে লগইন মেইল পাঠাও</button>
      <p class="hint">উপরে পাসওয়ার্ড ঘরে নতুন পাসওয়ার্ড লিখে এই বোতাম চাপলে কর্মীর ইমেইলে চলে যাবে।</p></div>` : ''}
    </div>
    <div class="mfoot"><button class="btn ghost x2">বাতিল</button><button class="btn" id="u_save">সেভ</button></div>
  </div></div>`);
  $('#modal-root').appendChild(m);
  const close = () => m.remove();
  m.querySelector('.x').onclick = close; m.querySelector('.x2').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  if (m.querySelector('#u_resend')) m.querySelector('#u_resend').onclick = async () => {
    const pwd = m.querySelector('#u_pass').value;
    if (!pwd) { showErr('#uErr', 'আগে উপরে নতুন পাসওয়ার্ড লিখুন।'); return; }
    try { await api('/users/' + u.id + '/invite', 'POST', { password: pwd });
      m.querySelector('#uErr').innerHTML = '<div class="ok-msg">📧 ইমেইল পাঠানো হয়েছে ✓</div>';
    } catch (er) { showErr('#uErr', er.message); }
  };
  m.querySelector('#u_save').onclick = async () => {
    const p = {
      name: m.querySelector('#u_name').value,
      email: m.querySelector('#u_email').value,
      password: m.querySelector('#u_pass').value,
      can_create: m.querySelector('#u_create').checked,
      can_publish: m.querySelector('#u_publish').checked,
      can_manage: m.querySelector('#u_manage').checked,
      active: m.querySelector('#u_active').checked,
    };
    try {
      if (u) { await api('/users/' + u.id, 'PUT', p); close(); renderAdmin(); }
      else {
        p.send_invite = m.querySelector('#u_invite').checked;
        const r = await api('/users', 'POST', p);
        close(); renderAdmin();
        if (p.send_invite && r.invite && !r.invite.sent) alert('অ্যাকাউন্ট তৈরি হয়েছে, তবে ইমেইল যায়নি: ' + r.invite.reason);
      }
    } catch (er) { showErr('#uErr', er.message); }
  };
}

async function adminTaxonomy() {
  TAX = await api('/taxonomy');
  const heads = TAX.heads, types = TAX.types, plats = TAX.platforms;
  const body = $('#adminBody');
  const headList = heads.map(h => {
    const its = types.filter(t => t.head_id === h.id);
    const typeItems = its.map(t => `<span class="chip gray" style="margin:2px">${esc(t.name)}
        <button class="x" style="font-size:14px;padding:0 0 0 5px" onclick="delTax('types',${t.id})">×</button></span>`).join('') || '<span class="hint">কোনো টাইপ নেই</span>';
    return `<div class="entry-card">
      <div class="top"><div class="title">${esc(h.name)}</div>
        <div><button class="btn ghost sm" onclick="addType(${h.id})">+ টাইপ</button>
        <button class="btn danger sm" onclick="delTax('heads',${h.id})">হেড মুছুন</button></div></div>
      <div class="chips" style="margin-top:10px">${typeItems}</div></div>`;
  }).join('');
  const platItems = plats.map(p => `<span class="chip gray" style="margin:3px">${esc(p.name)}
      <button class="x" style="font-size:14px;padding:0 0 0 5px" onclick="delTax('platforms',${p.id})">×</button></span>`).join('');
  body.innerHTML = `
    <div class="section"><h2>🗂️ কন্টেন্ট হেড ও টাইপ <button class="btn sm" id="addHead">+ নতুন হেড</button></h2>
      <div class="body">${headList || '<p class="hint">কিছু নেই।</p>'}</div></div>
    <div class="section"><h2>📱 প্ল্যাটফর্ম <button class="btn sm" id="addPlat">+ প্ল্যাটফর্ম</button></h2>
      <div class="body"><div class="chips">${platItems}</div></div></div>`;
  $('#addHead').onclick = async () => { const n = prompt('নতুন কন্টেন্ট হেডের নাম:'); if (n) { await api('/heads', 'POST', { name: n }); renderAdmin(); } };
  $('#addPlat').onclick = async () => { const n = prompt('নতুন প্ল্যাটফর্মের নাম:'); if (n) { await api('/platforms', 'POST', { name: n }); renderAdmin(); } };
}
window.addType = async hid => { const n = prompt('নতুন টাইপের নাম:'); if (n) { await api('/types', 'POST', { name: n, head_id: hid }); renderAdmin(); } };
window.delTax = async (kind, id) => {
  const label = { heads: 'হেড', types: 'টাইপ', platforms: 'প্ল্যাটফর্ম' }[kind];
  if (!confirm(`এই ${label} মুছবেন? (পুরোনো এন্ট্রি ঠিক থাকবে)`)) return;
  await api('/' + kind + '/' + id, 'DELETE'); renderAdmin();
};

async function adminSettings() {
  const root = $('#adminBody');
  root.innerHTML = '<p class="hint">লোড হচ্ছে…</p>';
  const s = await api('/settings');
  const sm = s.smtp || {};
  root.innerHTML = `
  <div class="section"><h2>⚙️ সাইট সেটিংস</h2><div class="body">
    <div id="sErr"></div>
    <label>সাইটের নাম</label><input id="s_name" value="${esc(s.site_name)}">
    <label>সাইটের লিংক (URL) <span class="hint">— লাইভ করার পর, ইনভাইট ইমেইলে এই লিংক যাবে</span></label>
    <input id="s_url" value="${esc(s.site_url || '')}" placeholder="https://yourhub.onrender.com">
    <label>গ্যাপ অ্যালার্ট — কত দিন পোস্ট না হলে গ্যাপ ধরবে</label>
    <input id="s_thr" type="number" min="1" value="${s.gap_threshold}" style="max-width:160px">
    <div style="height:14px"></div>
    <button class="btn" id="s_save">সেভ করুন</button>
  </div></div>

  <div class="section"><h2>📧 ইমেইল (SMTP) — কর্মীদের ইমেইলে লগইন পাঠাতে
    ${s.smtp_configured ? '<span class="chip ok">চালু</span>' : '<span class="chip none">বন্ধ</span>'}</h2><div class="body">
    <div id="smErr"></div>
    <p class="hint">এখানে একটি ইমেইল অ্যাকাউন্টের তথ্য দিলে নতুন কর্মী তৈরির সময় তাদের ইমেইলে লগইন তথ্য চলে যাবে। (Gmail হলে App Password ব্যবহার করুন — সাধারণ পাসওয়ার্ড নয়।)</p>
    <div class="row">
      <div><label>SMTP হোস্ট</label><input id="sm_host" value="${esc(sm.host || '')}" placeholder="smtp.gmail.com"></div>
      <div><label>পোর্ট</label><input id="sm_port" type="number" value="${esc(sm.port || 587)}" placeholder="587"></div>
    </div>
    <div class="row">
      <div><label>ইউজার (ইমেইল)</label><input id="sm_user" autocapitalize="none" value="${esc(sm.user || '')}" placeholder="you@gmail.com"></div>
      <div><label>পাসওয়ার্ড / App Password</label><input id="sm_pass" type="password" placeholder="${sm.has_pass ? '•••••• (সেট করা আছে — বদলাতে নতুন দিন)' : 'পাসওয়ার্ড দিন'}"></div>
    </div>
    <div class="row">
      <div><label>From (প্রেরকের নাম/ইমেইল)</label><input id="sm_from" value="${esc(sm.from || '')}" placeholder="Content Hub <you@gmail.com>"></div>
      <div><label>সিকিউর (SSL)</label><select id="sm_secure"><option value="false" ${!sm.secure ? 'selected' : ''}>না (TLS/587)</option><option value="true" ${sm.secure ? 'selected' : ''}>হ্যাঁ (SSL/465)</option></select></div>
    </div>
    <div style="height:14px"></div>
    <button class="btn" id="sm_save">ইমেইল সেটিংস সেভ</button>
    <div style="height:18px"></div>
    <p class="hint">💡 নিজের অ্যাডমিন পাসওয়ার্ড বদলাতে <b>ইউজার ও অ্যাক্সেস</b> ট্যাবে নিজেকে এডিট করুন।</p>
  </div></div>`;

  $('#s_save').onclick = async () => {
    try {
      await api('/settings', 'PUT', { site_name: $('#s_name').value, site_url: $('#s_url').value, gap_threshold: $('#s_thr').value });
      const m = await api('/me'); ME.settings = m.settings; $('#brand').textContent = m.settings.site_name;
      $('#sErr').innerHTML = '<div class="ok-msg">সেভ হয়েছে ✓</div>';
    } catch (er) { showErr('#sErr', er.message); }
  };
  $('#sm_save').onclick = async () => {
    const smtp = {
      host: $('#sm_host').value, port: $('#sm_port').value,
      user: $('#sm_user').value, from: $('#sm_from').value,
      secure: $('#sm_secure').value === 'true',
    };
    const pass = $('#sm_pass').value; if (pass) smtp.pass = pass;
    try {
      const r = await api('/settings', 'PUT', { smtp });
      const m = await api('/me'); ME.settings = m.settings;
      $('#smErr').innerHTML = `<div class="ok-msg">সেভ হয়েছে ✓ ${r.smtp_configured ? '— ইমেইল এখন চালু' : ''}</div>`;
    } catch (er) { showErr('#smErr', er.message); }
  };
}

boot();
