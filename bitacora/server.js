#!/usr/bin/env node
/*
 * Bitácora — servidor local sin dependencias.
 * Sirve la app (carpeta public/) y guarda los datos en data/data.json.
 *
 *   node server.js           → http://localhost:4747
 *   node server.js --open    → además abre el navegador
 *   PORT=5000 node server.js → otro puerto
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 4747;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.BITACORA_DATA || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;
const MAX_BODY = 50 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Una copia de seguridad por día (antes del primer guardado del día). Guarda las últimas 30.
function backupOncePerDay() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const target = path.join(BACKUP_DIR, `data-${today()}.json`);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(DATA_FILE, target);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > MAX_BACKUPS) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  } catch (err) {
    console.warn('No se pudo crear la copia de seguridad:', err.message);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  if (req.method === 'GET') {
    if (!fs.existsSync(DATA_FILE)) return send(res, 200, '{}');
    return send(res, 200, fs.readFileSync(DATA_FILE, 'utf8'));
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const data = JSON.parse(await readBody(req));
      if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Formato inválido');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      backupOncePerDay();
      // Escritura atómica: primero a un archivo temporal y luego renombrar.
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
      fs.renameSync(tmp, DATA_FILE);
      return send(res, 200, JSON.stringify({ ok: true, savedAt: Date.now() }));
    } catch (err) {
      return send(res, 400, JSON.stringify({ ok: false, error: err.message }));
    }
  }
  return send(res, 405, JSON.stringify({ ok: false, error: 'Método no permitido' }));
}

function handleStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Prohibido', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/data') return handleApi(req, res);
  return handleStatic(req, res, pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. ¿Ya tienes Bitácora abierta? Prueba con PORT=4748 node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Bitácora lista en ${url}`);
  console.log(`  Datos: ${DATA_FILE}`);
  console.log('  Ctrl+C para detener.\n');
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }
});
