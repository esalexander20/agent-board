'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const store = require('./board-store');

const PROJECT_ROOT = process.cwd();
const DASHBOARD_DIR = path.join(PROJECT_ROOT, '.claude', 'dashboard');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const PROJECT_NAME = path.basename(PROJECT_ROOT);

const PID_FILE = store.pidPath(DASHBOARD_DIR);
const PORT_FILE = store.portPath(DASHBOARD_DIR);
const BOARD_FILE = store.boardPath(DASHBOARD_DIR);

const START_PORT = Number(process.env.KANBAN_PORT) || 4848;
const MAX_PORT_TRIES = 20;

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const SSE_HEARTBEAT_MS = 25000;
const WATCH_DEBOUNCE_MS = 80;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists but owned by someone else
  }
}

function checkExistingInstance() {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  if (pid && isProcessAlive(pid)) {
    const port = fs.existsSync(PORT_FILE)
      ? fs.readFileSync(PORT_FILE, 'utf8').trim()
      : null;
    return { pid, port };
  }
  // stale
  try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(PORT_FILE); } catch (e) { /* ignore */ }
  return null;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType) {
  res.writeHead(status, { 'Content-Type': contentType || 'text/plain' });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('malformed JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html' },
  '/index.html': { file: 'index.html', type: 'text/html' },
  '/app.js': { file: 'app.js', type: 'application/javascript' },
  '/style.css': { file: 'style.css', type: 'text/css' },
};

function serveStatic(res, pathname) {
  const entry = STATIC_FILES[pathname];
  if (!entry) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  const filePath = path.join(ASSETS_DIR, entry.file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 500, { error: `failed to read asset: ${err.message}` });
      return;
    }
    sendText(res, 200, data, entry.type);
  });
}

// --- SSE broadcast ---

const sseClients = new Set();

function broadcastBoard() {
  let board;
  try {
    board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
  } catch (e) {
    return; // transient read during a concurrent write; next watch tick will retry
  }
  const payload = `event: board\ndata: ${JSON.stringify(board)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

let watchDebounce = null;
function scheduleBroadcast() {
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(broadcastBoard, WATCH_DEBOUNCE_MS);
}

function setupWatcher() {
  // Watch the directory, not the bare file: board-store.js writes via a
  // temp-file-then-rename, which some fs.watch implementations report as
  // the watched file disappearing rather than "change". Watching the
  // directory and filtering by filename is robust to that pattern.
  try {
    fs.watch(DASHBOARD_DIR, { persistent: true }, (eventType, filename) => {
      if (!filename || filename === 'board.json' || filename.startsWith('board.json.tmp-')) {
        scheduleBroadcast();
      }
    });
  } catch (e) {
    console.error(`warning: could not watch ${DASHBOARD_DIR}: ${e.message}`);
  }
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':ok\n\n');
  let board;
  try {
    board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
    res.write(`event: board\ndata: ${JSON.stringify(board)}\n\n`);
  } catch (e) {
    // board.json is corrupt; the client will get the next broadcast once fixed
  }
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(':hb\n\n'); } catch (e) { /* client gone */ }
  }, SSE_HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

// --- API handlers ---

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'GET' && pathname === '/api/board') {
    sendJson(res, 200, store.loadBoard(DASHBOARD_DIR, PROJECT_NAME));
    return;
  }

  if (method === 'GET' && pathname === '/api/events') {
    handleEvents(req, res);
    return;
  }

  if (method === 'POST' && pathname === '/api/cards') {
    const body = await readJsonBody(req);
    if (!body.title || typeof body.title !== 'string') {
      sendJson(res, 400, { error: 'title is required' });
      return;
    }
    const board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
    const column = store.COLUMNS.includes(body.column) ? body.column : 'backlog';
    const now = store.nowIso();
    const card = {
      id: store.newId('card'),
      title: body.title,
      description: typeof body.description === 'string' ? body.description : '',
      column,
      parentPlanId: null,
      createdAt: now,
      updatedAt: now,
      comments: [],
    };
    board.cards.push(card);
    store.saveBoard(DASHBOARD_DIR, board);
    sendJson(res, 201, card);
    return;
  }

  const cardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
  if (method === 'PATCH' && cardMatch) {
    const body = await readJsonBody(req);
    const board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
    const card = board.cards.find((c) => c.id === cardMatch[1]);
    if (!card) {
      sendJson(res, 404, { error: 'card not found' });
      return;
    }
    if (body.column !== undefined) {
      if (!store.COLUMNS.includes(body.column)) {
        sendJson(res, 400, { error: `invalid column: ${body.column}` });
        return;
      }
      card.column = body.column;
    }
    if (typeof body.title === 'string') card.title = body.title;
    if (typeof body.description === 'string') card.description = body.description;
    card.updatedAt = store.nowIso();
    store.saveBoard(DASHBOARD_DIR, board);
    sendJson(res, 200, card);
    return;
  }

  const commentMatch = pathname.match(/^\/api\/cards\/([^/]+)\/comments$/);
  if (method === 'POST' && commentMatch) {
    const body = await readJsonBody(req);
    if (!body.text || typeof body.text !== 'string') {
      sendJson(res, 400, { error: 'text is required' });
      return;
    }
    const board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
    const card = board.cards.find((c) => c.id === commentMatch[1]);
    if (!card) {
      sendJson(res, 404, { error: 'card not found' });
      return;
    }
    const comment = {
      id: store.newId('cmt'),
      text: body.text,
      author: 'user', // the UI never lets a human set this to "claude"
      createdAt: store.nowIso(),
      status: 'unprocessed',
    };
    card.comments.push(comment);
    card.updatedAt = comment.createdAt;
    store.saveBoard(DASHBOARD_DIR, board);
    sendJson(res, 201, comment);
    return;
  }

  if (method === 'POST' && pathname === '/api/plans') {
    const body = await readJsonBody(req);
    if (!body.goal || typeof body.goal !== 'string') {
      sendJson(res, 400, { error: 'goal is required' });
      return;
    }
    const board = store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);
    const plan = {
      id: store.newId('plan'),
      goal: body.goal,
      status: 'pending_breakdown',
      createdAt: store.nowIso(),
    };
    board.plans.push(plan);
    store.saveBoard(DASHBOARD_DIR, board);
    sendJson(res, 201, plan);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

function startServer() {
  fs.mkdirSync(DASHBOARD_DIR, { recursive: true });

  const existing = checkExistingInstance();
  if (existing) {
    console.log(`kanban-planner server already running (pid ${existing.pid}) on port ${existing.port}`);
    process.exit(0);
  }

  // Make sure board.json exists before the watcher / first requests arrive.
  store.loadBoard(DASHBOARD_DIR, PROJECT_NAME);

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (e) {
      sendJson(res, 400, { error: 'bad request' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname).catch((err) => {
        sendJson(res, err.statusCode || 500, { error: err.message });
      });
      return;
    }

    serveStatic(res, pathname);
  });

  let attempt = 0;
  function tryListen() {
    const port = START_PORT + attempt;
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES) {
        attempt += 1;
        tryListen();
      } else {
        console.error(`failed to bind: ${err.message}`);
        process.exit(1);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      fs.writeFileSync(PID_FILE, String(process.pid));
      fs.writeFileSync(PORT_FILE, String(port));
      setupWatcher();
      console.log(`kanban-planner dashboard running at http://127.0.0.1:${port}/`);
    });
  }
  tryListen();

  function shutdown() {
    server.close();
    for (const client of sseClients) {
      try { client.end(); } catch (e) { /* ignore */ }
    }
    try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(PORT_FILE); } catch (e) { /* ignore */ }
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
