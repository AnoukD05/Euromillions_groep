const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const port = Number(process.env.PORT || 5500);
const root = __dirname;
const database = new DatabaseSync(path.join(root, 'euromillions.db'));

database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS draws (
    date TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

database.prepare('INSERT OR IGNORE INTO config (id, data) VALUES (1, ?)').run(JSON.stringify({ members: [], inleg: 2.5, roosters: [] }));

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Ongeldige JSON')); }
    });
    request.on('error', reject);
  });
}

function loadState() {
  const config = JSON.parse(database.prepare('SELECT data FROM config WHERE id = 1').get().data);
  const payments = database.prepare('SELECT data FROM payments ORDER BY id').all().map(row => JSON.parse(row.data));
  const draws = {};
  database.prepare('SELECT date, data FROM draws ORDER BY date').all().forEach(row => { draws[row.date] = JSON.parse(row.data); });
  return { config, payments, draws };
}

function serveFile(request, response) {
  const requested = request.url === '/' ? '/euromillions.html' : request.url;
  const filePath = path.normalize(path.join(root, requested.split('?')[0]));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404); response.end('Niet gevonden'); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/api/state' && request.method === 'GET') return json(response, 200, loadState());

    if (url.pathname === '/api/config' && request.method === 'PUT') {
      const data = await readBody(request);
      database.prepare('UPDATE config SET data = ? WHERE id = 1').run(JSON.stringify(data));
      return json(response, 200, { ok: true });
    }

    const drawMatch = url.pathname.match(/^\/api\/draws\/([^/]+)$/);
    if (drawMatch && request.method === 'PUT') {
      const date = decodeURIComponent(drawMatch[1]);
      const data = await readBody(request);
      database.prepare('INSERT INTO draws (date, data) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET data = excluded.data').run(date, JSON.stringify(data));
      return json(response, 200, { ok: true });
    }
    if (drawMatch && request.method === 'DELETE') {
      database.prepare('DELETE FROM draws WHERE date = ?').run(decodeURIComponent(drawMatch[1]));
      return json(response, 200, { ok: true });
    }

    const paymentMatch = url.pathname.match(/^\/api\/payments\/([^/]+)$/);
    if (paymentMatch && request.method === 'PUT') {
      const id = decodeURIComponent(paymentMatch[1]);
      const data = await readBody(request);
      database.prepare('INSERT INTO payments (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(id, JSON.stringify({ ...data, id }));
      return json(response, 200, { ok: true });
    }
    if (paymentMatch && request.method === 'DELETE') {
      database.prepare('DELETE FROM payments WHERE id = ?').run(decodeURIComponent(paymentMatch[1]));
      return json(response, 200, { ok: true });
    }

    if (request.method === 'GET') return serveFile(request, response);
    json(response, 404, { error: 'Niet gevonden' });
  } catch (error) {
    json(response, 400, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`EuroMillions draait op http://localhost:${port}`);
  console.log(`Database: ${path.join(root, 'euromillions.db')}`);
});

process.on('SIGINT', () => { database.close(); process.exit(0); });
process.on('SIGTERM', () => { database.close(); process.exit(0); });
