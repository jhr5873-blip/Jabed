const fs = require('fs');
const path = require('path');

// DATA_DIR lets you point storage at a persistent disk (e.g. Render disk mounted at /var/data).
// Falls back to a local ./data folder for normal/local use.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let data = null;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  }
  return data;
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

function get() { return data; }
function setData(d) { data = d; save(); }
function nextId(coll) {
  data.seq[coll] = (data.seq[coll] || 0) + 1;
  return data.seq[coll];
}

module.exports = { load, save, get, setData, nextId };
