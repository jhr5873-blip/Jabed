const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');

// ---------------------------------------------------------------- seed
function seed() {
  const heads = [
    'Entertainment', 'Study Activities', 'Motivational Content', 'Emotional Content'
  ];
  const typesByHead = {
    'Entertainment': ['Expectation vs Reality', 'Funny Translation', 'Guess the Word'],
    'Study Activities': ['1 Minute Que Card Challenge', '1 Minute Vocab Game Challenge', 'Fill in the Sentence'],
    'Motivational Content': ['Quotation of Famous People', 'Viral Photocard', 'Motivational Quotation'],
    'Emotional Content': ['Emotional Story Build', 'Emotional Podcast Launch'],
  };
  const platforms = ['Facebook', 'Instagram', 'YouTube', 'YouTube Shorts', 'TikTok'];

  const data = {
    seq: { users: 0, heads: 0, types: 0, platforms: 0, entries: 0, requests: 0 },
    settings: {
      site_name: 'Content Production Hub',
      gap_threshold: 3,
      site_url: '',                       // e.g. https://yourhub.onrender.com  (used in invite emails)
      smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
      _secret: crypto.randomBytes(24).toString('hex'),
    },
    users: [], heads: [], types: [], platforms: [], entries: [], requests: [],
  };
  db.setData(data);

  // admin
  data.users.push({
    id: db.nextId('users'), name: 'Admin', username: 'admin', email: 'admin@example.com',
    password_hash: bcrypt.hashSync('admin123', 10),
    can_create: true, can_publish: true, can_manage: true, active: true,
    created_at: new Date().toISOString(),
  });
  // sample creator + executive
  data.users.push({
    id: db.nextId('users'), name: 'Rabbi (Creator)', username: 'rabbi', email: 'rabbi@example.com',
    password_hash: bcrypt.hashSync('1234', 10),
    can_create: true, can_publish: false, can_manage: false, active: true,
    created_at: new Date().toISOString(),
  });
  data.users.push({
    id: db.nextId('users'), name: 'Tanvir (Executive)', username: 'tanvir', email: 'tanvir@example.com',
    password_hash: bcrypt.hashSync('1234', 10),
    can_create: false, can_publish: true, can_manage: false, active: true,
    created_at: new Date().toISOString(),
  });

  heads.forEach((h, i) => {
    const head = { id: db.nextId('heads'), name: h, sort: i, active: true };
    data.heads.push(head);
    typesByHead[h].forEach(t => {
      data.types.push({ id: db.nextId('types'), head_id: head.id, name: t, active: true });
    });
  });
  platforms.forEach(p => data.platforms.push({ id: db.nextId('platforms'), name: p, active: true }));
  db.save();
}

if (!db.load()) seed();
const data = db.get();

// ---- migrate older data files (add new fields if missing) ----
if (!data.settings.smtp) data.settings.smtp = { host: '', port: 587, secure: false, user: '', pass: '', from: '' };
if (data.settings.site_url === undefined) data.settings.site_url = '';
if (!data.requests) data.requests = [];
if (data.seq.requests === undefined) data.seq.requests = 0;
data.users.forEach(u => { if (u.email === undefined) u.email = ''; });
db.save();

// ---------------------------------------------------------------- email
function smtpReady() {
  const s = data.settings.smtp || {};
  return !!(s.host && s.user && s.pass);
}
async function sendInviteEmail(user, plainPassword) {
  if (!smtpReady()) return { sent: false, reason: 'SMTP সেট করা নেই' };
  if (!user.email) return { sent: false, reason: 'ইমেইল নেই' };
  const s = data.settings.smtp;
  const transporter = nodemailer.createTransport({
    host: s.host, port: +s.port || 587, secure: !!s.secure,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  const url = data.settings.site_url || '(সাইট লিংক)';
  const from = s.from || s.user;
  const text =
`আসসালামু আলাইকুম ${user.name},

${data.settings.site_name}-এ আপনার অ্যাকাউন্ট তৈরি হয়েছে।

লগইন লিংক: ${url}
ইমেইল: ${user.email}
পাসওয়ার্ড: ${plainPassword}

প্রথমবার ঢুকে পাসওয়ার্ড বদলে নিতে পারেন।`;
  await transporter.sendMail({
    from, to: user.email,
    subject: `${data.settings.site_name} — আপনার লগইন তথ্য`,
    text,
  });
  return { sent: true };
}
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

// ---------------------------------------------------------------- app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: data.settings._secret,
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 14, sameSite: 'lax' },
}));

const pub = path.join(__dirname, 'public');

// ---------------------------------------------------------------- helpers
function currentUser(req) {
  if (!req.session.uid) return null;
  return data.users.find(u => u.id === req.session.uid && u.active) || null;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'অনুমোদিত নয় (login করুন)' });
  req.user = u; next();
}
function requireManage(req, res, next) {
  if (!req.user.can_manage) return res.status(403).json({ error: 'এই কাজের অনুমতি নেই' });
  next();
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, email: u.email || '',
    can_create: u.can_create, can_publish: u.can_publish, can_manage: u.can_manage,
    active: u.active,
  };
}
const todayISO = () => new Date().toISOString().slice(0, 10);
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ---------------------------------------------------------------- auth routes
app.post('/api/login', (req, res) => {
  const { username, email, password } = req.body;
  const id = (email || username || '').trim().toLowerCase();
  const u = data.users.find(x => x.active &&
    ((x.email || '').toLowerCase() === id || x.username === id));
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'ইমেইল বা পাসওয়ার্ড ভুল' });
  req.session.uid = u.id;
  res.json({ ok: true, user: publicUser(u) });
});
app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.user),
    pending_requests: req.user.can_manage ? data.requests.filter(r => r.status === 'pending').length : 0,
    settings: {
      site_name: data.settings.site_name,
      gap_threshold: data.settings.gap_threshold,
      site_url: data.settings.site_url || '',
      smtp_configured: smtpReady(),
    },
  });
});

// ---------------------------------------------------------------- access requests
// PUBLIC: an employee asks the admin for access (no login required)
app.post('/api/requests', (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'নাম ও ইমেইল দিতে হবে' });
  if (!isEmail(email)) return res.status(400).json({ error: 'সঠিক ইমেইল দিন' });
  if (data.users.some(u => (u.email || '').toLowerCase() === email))
    return res.status(400).json({ error: 'এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে — লগইন করুন।' });
  if (data.requests.some(r => r.status === 'pending' && r.email.toLowerCase() === email))
    return res.status(400).json({ error: 'আপনার রিকোয়েস্ট আগেই পাঠানো হয়েছে — Admin অনুমোদনের অপেক্ষায়।' });
  const r = {
    id: db.nextId('requests'), name, email,
    note: (b.note || '').trim(), requested_role: (b.requested_role || '').trim(),
    status: 'pending', created_at: new Date().toISOString(),
  };
  data.requests.push(r); db.save();
  res.json({ ok: true });
});
app.get('/api/requests', requireAuth, requireManage, (req, res) => {
  const order = { pending: 0, approved: 1, rejected: 2 };
  const list = data.requests.slice().sort((a, b) =>
    (order[a.status] - order[b.status]) || b.id - a.id);
  res.json(list);
});
app.post('/api/requests/:id/approve', requireAuth, requireManage, async (req, res) => {
  const r = data.requests.find(x => x.id === +req.params.id);
  if (!r) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'এই রিকোয়েস্ট আগেই প্রসেস হয়েছে' });
  const b = req.body || {};
  const email = r.email.toLowerCase();
  if (data.users.some(u => (u.email || '').toLowerCase() === email))
    return res.status(400).json({ error: 'এই ইমেইলে অ্যাকাউন্ট আছে' });
  const password = (b.password || '').trim() || Math.random().toString(36).slice(2, 10);
  let username = email.split('@')[0], base = username, n = 1;
  while (data.users.some(u => u.username === username)) username = base + (++n);
  const u = {
    id: db.nextId('users'), name: r.name, username, email,
    password_hash: bcrypt.hashSync(password, 10),
    can_create: b.can_create !== undefined ? !!b.can_create : true,
    can_publish: !!b.can_publish, can_manage: !!b.can_manage,
    active: true, created_at: new Date().toISOString(),
  };
  data.users.push(u);
  r.status = 'approved'; r.approved_at = new Date().toISOString();
  db.save();
  let invite = { sent: false, reason: 'পাঠানো হয়নি' };
  if (b.send_invite) {
    try { invite = await sendInviteEmail(u, password); }
    catch (e) { invite = { sent: false, reason: 'ইমেইল পাঠাতে ব্যর্থ: ' + e.message }; }
  }
  res.json({ ok: true, user: publicUser(u), password, invite });
});
app.post('/api/requests/:id/reject', requireAuth, requireManage, (req, res) => {
  const r = data.requests.find(x => x.id === +req.params.id);
  if (!r) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  r.status = 'rejected'; r.rejected_at = new Date().toISOString();
  db.save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- taxonomy (for dropdowns)
app.get('/api/taxonomy', requireAuth, (req, res) => {
  res.json({
    heads: data.heads.filter(h => h.active).sort((a, b) => a.sort - b.sort),
    types: data.types.filter(t => t.active),
    platforms: data.platforms.filter(p => p.active),
    users: data.users.filter(u => u.active).map(publicUser),
    prod_status: ['Idea', 'In Progress', 'Ready'],
    publish_status: ['Pending', 'Hold', 'Published', 'Cancelled'],
  });
});

// ---------------------------------------------------------------- entries
function entryView(e) {
  const head = data.heads.find(h => h.id === e.head_id);
  const type = data.types.find(t => t.id === e.type_id);
  const plat = data.platforms.find(p => p.id === e.platform_id);
  const cb = data.users.find(u => u.id === e.created_by);
  const pb = data.users.find(u => u.id === e.posted_by);
  return {
    ...e,
    head_name: head ? head.name : '',
    type_name: type ? type.name : '',
    platform_name: plat ? plat.name : '',
    created_by_name: cb ? cb.name : '',
    posted_by_name: pb ? pb.name : '',
  };
}
app.get('/api/entries', requireAuth, (req, res) => {
  let list = data.entries.slice();
  list.sort((a, b) => (b.date_created || '').localeCompare(a.date_created || '') || b.id - a.id);
  res.json(list.map(entryView));
});
app.post('/api/entries', requireAuth, (req, res) => {
  if (!req.user.can_create && !req.user.can_manage)
    return res.status(403).json({ error: 'কন্টেন্ট তৈরির অনুমতি নেই' });
  const b = req.body;
  const e = {
    id: db.nextId('entries'),
    date_created: b.date_created || todayISO(),
    head_id: +b.head_id || null,
    type_id: +b.type_id || null,
    title: (b.title || '').trim(),
    created_by: +b.created_by || req.user.id,
    prod_status: b.prod_status || 'Idea',
    publish_date: b.publish_date || '',
    platform_id: +b.platform_id || null,
    posted_by: +b.posted_by || null,
    link: (b.link || '').trim(),
    publish_status: b.publish_status || 'Pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!e.head_id || !e.title) return res.status(400).json({ error: 'হেড ও টপিক দিতে হবে' });
  data.entries.push(e); db.save();
  res.json(entryView(e));
});
app.put('/api/entries/:id', requireAuth, (req, res) => {
  const e = data.entries.find(x => x.id === +req.params.id);
  if (!e) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  const b = req.body, u = req.user;
  const canEditCore = u.can_manage || (u.can_create && e.created_by === u.id);
  const canPublish = u.can_manage || u.can_publish;
  if (canEditCore) {
    if (b.date_created !== undefined) e.date_created = b.date_created;
    if (b.head_id !== undefined) e.head_id = +b.head_id || null;
    if (b.type_id !== undefined) e.type_id = +b.type_id || null;
    if (b.title !== undefined) e.title = (b.title || '').trim();
    if (b.created_by !== undefined) e.created_by = +b.created_by || e.created_by;
    if (b.prod_status !== undefined) e.prod_status = b.prod_status;
  }
  if (canPublish) {
    if (b.publish_date !== undefined) e.publish_date = b.publish_date;
    if (b.platform_id !== undefined) e.platform_id = +b.platform_id || null;
    if (b.posted_by !== undefined) e.posted_by = +b.posted_by || null;
    if (b.link !== undefined) e.link = (b.link || '').trim();
    if (b.publish_status !== undefined) e.publish_status = b.publish_status;
  }
  if (!canEditCore && !canPublish) return res.status(403).json({ error: 'এডিট অনুমতি নেই' });
  e.updated_at = new Date().toISOString();
  db.save();
  res.json(entryView(e));
});
app.delete('/api/entries/:id', requireAuth, (req, res) => {
  const i = data.entries.findIndex(x => x.id === +req.params.id);
  if (i < 0) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  const e = data.entries[i];
  if (!req.user.can_manage && !(req.user.can_create && e.created_by === req.user.id))
    return res.status(403).json({ error: 'ডিলিট অনুমতি নেই' });
  data.entries.splice(i, 1); db.save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- dashboard
app.get('/api/dashboard', requireAuth, (req, res) => {
  const thr = +data.settings.gap_threshold || 3;
  const today = todayISO();
  const es = data.entries;
  const isPub = e => e.publish_status === 'Published';

  function block(items, idKey, nameFor) {
    return items.map(it => {
      const rows = es.filter(e => e[idKey] === it.id);
      const created = rows.length;
      const pubRows = rows.filter(isPub);
      const published = pubRows.length;
      const pending = created - published;
      const dates = pubRows.map(e => e.publish_date).filter(Boolean).sort();
      const last = dates.length ? dates[dates.length - 1] : null;
      const since = last ? daysBetween(last, today) : null;
      let status;
      if (created === 0) status = 'none';
      else if (!last) status = 'unpublished';
      else if (since > thr) status = 'gap';
      else status = 'ok';
      return { id: it.id, name: nameFor(it), created, published, pending, last, since, status };
    });
  }

  const heads = data.heads.filter(h => h.active).sort((a, b) => a.sort - b.sort);
  const types = data.types.filter(t => t.active);
  const headRows = block(heads, 'head_id', h => h.name);
  const typeRows = block(types, 'type_id', t => {
    const h = data.heads.find(x => x.id === t.head_id);
    return t.name;
  }).map(r => {
    const t = types.find(x => x.id === r.id);
    const h = data.heads.find(x => x.id === t.head_id);
    return { ...r, head_name: h ? h.name : '' };
  });

  const platforms = data.platforms.filter(p => p.active).map(p => ({
    name: p.name,
    published: es.filter(e => e.platform_id === p.id && isPub(e)).length,
  }));

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    last7.push({ date: iso, published: es.filter(e => isPub(e) && e.publish_date === iso).length });
  }

  const totalCreated = es.length;
  const totalPublished = es.filter(isPub).length;
  const totalPending = es.filter(e => e.publish_status !== 'Published').length;
  const last7Published = es.filter(e => isPub(e) && e.publish_date >= last7[0].date).length;

  res.json({
    kpi: { totalCreated, totalPublished, totalPending, last7Published },
    threshold: thr, headRows, typeRows, platforms, last7,
  });
});

// ---------------------------------------------------------------- admin: users
app.get('/api/users', requireAuth, requireManage, (req, res) => {
  res.json(data.users.map(publicUser));
});
app.post('/api/users', requireAuth, requireManage, async (req, res) => {
  const b = req.body;
  const email = (b.email || '').trim().toLowerCase();
  if (!b.name || !email || !b.password) return res.status(400).json({ error: 'নাম, ইমেইল ও পাসওয়ার্ড দিতে হবে' });
  if (!isEmail(email)) return res.status(400).json({ error: 'সঠিক ইমেইল দিন' });
  if (data.users.some(u => (u.email || '').toLowerCase() === email)) return res.status(400).json({ error: 'এই ইমেইল আগে থেকেই আছে' });
  // username defaults to the part before @ (kept for backward compatibility)
  let username = (b.username || email.split('@')[0]).trim().toLowerCase();
  let base = username, n = 1;
  while (data.users.some(u => u.username === username)) username = base + (++n);
  const u = {
    id: db.nextId('users'), name: b.name.trim(), username, email,
    password_hash: bcrypt.hashSync(b.password, 10),
    can_create: !!b.can_create, can_publish: !!b.can_publish, can_manage: !!b.can_manage,
    active: true, created_at: new Date().toISOString(),
  };
  data.users.push(u); db.save();
  let invite = { sent: false, reason: 'পাঠানো হয়নি' };
  if (b.send_invite) {
    try { invite = await sendInviteEmail(u, b.password); }
    catch (e) { invite = { sent: false, reason: 'ইমেইল পাঠাতে ব্যর্থ: ' + e.message }; }
  }
  res.json({ ...publicUser(u), invite });
});
app.put('/api/users/:id', requireAuth, requireManage, (req, res) => {
  const u = data.users.find(x => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  const b = req.body;
  if (b.name !== undefined) u.name = b.name.trim();
  if (b.email !== undefined) {
    const email = (b.email || '').trim().toLowerCase();
    if (email && !isEmail(email)) return res.status(400).json({ error: 'সঠিক ইমেইল দিন' });
    if (email && data.users.some(x => x.id !== u.id && (x.email || '').toLowerCase() === email))
      return res.status(400).json({ error: 'এই ইমেইল অন্য কর্মীর আছে' });
    u.email = email;
  }
  if (b.can_create !== undefined) u.can_create = !!b.can_create;
  if (b.can_publish !== undefined) u.can_publish = !!b.can_publish;
  if (b.can_manage !== undefined) u.can_manage = !!b.can_manage;
  if (b.active !== undefined) u.active = !!b.active;
  if (b.password) u.password_hash = bcrypt.hashSync(b.password, 10);
  // never lock out the last admin
  if (!data.users.some(x => x.can_manage && x.active))
    return res.status(400).json({ error: 'অন্তত একজন অ্যাডমিন সক্রিয় রাখতে হবে' });
  db.save();
  res.json(publicUser(u));
});
// (re)send login email to a user
app.post('/api/users/:id/invite', requireAuth, requireManage, async (req, res) => {
  const u = data.users.find(x => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: 'পাওয়া যায়নি' });
  const pwd = (req.body && req.body.password) || '';
  if (!pwd) return res.status(400).json({ error: 'ইমেইলে পাঠানোর জন্য একটি (নতুন) পাসওয়ার্ড দিন' });
  u.password_hash = bcrypt.hashSync(pwd, 10); db.save();
  try {
    const r = await sendInviteEmail(u, pwd);
    if (!r.sent) return res.status(400).json({ error: r.reason });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'ইমেইল পাঠাতে ব্যর্থ: ' + e.message }); }
});

// ---------------------------------------------------------------- admin: taxonomy
function crudList(name, coll, extraFields) {
  app.post(`/api/${name}`, requireAuth, requireManage, (req, res) => {
    const b = req.body;
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'নাম দিন' });
    const item = { id: db.nextId(coll), name: b.name.trim(), active: true };
    if (extraFields) extraFields(item, b);
    data[coll].push(item); db.save();
    res.json(item);
  });
  app.put(`/api/${name}/:id`, requireAuth, requireManage, (req, res) => {
    const it = data[coll].find(x => x.id === +req.params.id);
    if (!it) return res.status(404).json({ error: 'পাওয়া যায়নি' });
    const b = req.body;
    if (b.name !== undefined) it.name = b.name.trim();
    if (b.active !== undefined) it.active = !!b.active;
    if (extraFields) extraFields(it, b, true);
    db.save();
    res.json(it);
  });
  app.delete(`/api/${name}/:id`, requireAuth, requireManage, (req, res) => {
    const it = data[coll].find(x => x.id === +req.params.id);
    if (!it) return res.status(404).json({ error: 'পাওয়া যায়নি' });
    it.active = false; db.save(); // soft delete keeps history intact
    res.json({ ok: true });
  });
}
crudList('heads', 'heads', (item, b) => { if (b.sort !== undefined) item.sort = +b.sort; else if (item.sort === undefined) item.sort = data.heads.length; });
crudList('types', 'types', (item, b) => { if (b.head_id !== undefined) item.head_id = +b.head_id; });
crudList('platforms', 'platforms');

// ---------------------------------------------------------------- admin: settings
app.get('/api/settings', requireAuth, requireManage, (req, res) => {
  const s = data.settings;
  res.json({
    site_name: s.site_name, gap_threshold: s.gap_threshold, site_url: s.site_url || '',
    smtp: { host: s.smtp.host, port: s.smtp.port, secure: s.smtp.secure, user: s.smtp.user, from: s.smtp.from, has_pass: !!s.smtp.pass },
    smtp_configured: smtpReady(),
  });
});
app.put('/api/settings', requireAuth, requireManage, (req, res) => {
  const b = req.body;
  if (b.site_name !== undefined) data.settings.site_name = b.site_name.trim() || 'Content Production Hub';
  if (b.gap_threshold !== undefined) data.settings.gap_threshold = Math.max(1, +b.gap_threshold || 3);
  if (b.site_url !== undefined) data.settings.site_url = (b.site_url || '').trim();
  if (b.smtp) {
    const s = data.settings.smtp;
    if (b.smtp.host !== undefined) s.host = (b.smtp.host || '').trim();
    if (b.smtp.port !== undefined) s.port = +b.smtp.port || 587;
    if (b.smtp.secure !== undefined) s.secure = !!b.smtp.secure;
    if (b.smtp.user !== undefined) s.user = (b.smtp.user || '').trim();
    if (b.smtp.from !== undefined) s.from = (b.smtp.from || '').trim();
    if (b.smtp.pass) s.pass = b.smtp.pass; // only overwrite when provided
  }
  db.save();
  res.json({ ok: true, smtp_configured: smtpReady() });
});

// ---------------------------------------------------------------- pages
app.use(express.static(pub));
app.get('/login', (req, res) => res.sendFile(path.join(pub, 'login.html')));
app.get(['/', '/app'], (req, res) => {
  if (!currentUser(req)) return res.redirect('/login');
  res.sendFile(path.join(pub, 'app.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Content Hub running on http://localhost:${PORT}`));
