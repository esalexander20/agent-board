'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLUMNS = ['backlog', 'in_progress', 'pending_review', 'done'];

function boardPath(dashboardDir) {
  return path.join(dashboardDir, 'board.json');
}

function pidPath(dashboardDir) {
  return path.join(dashboardDir, 'server.pid');
}

function portPath(dashboardDir) {
  return path.join(dashboardDir, 'server.port');
}

function defaultBoard(projectName) {
  return {
    schemaVersion: 1,
    projectName,
    columns: COLUMNS,
    cards: [],
    plans: [],
  };
}

function loadBoard(dashboardDir, projectName) {
  const p = boardPath(dashboardDir);
  if (!fs.existsSync(p)) {
    const board = defaultBoard(projectName);
    saveBoard(dashboardDir, board);
    return board;
  }
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`board.json is corrupt: ${e.message}`);
  }
}

// Atomic write: write to a temp file in the same directory, then rename.
// This avoids fs.watch observing a half-written file, and avoids the
// server and a Claude-side file-tool write racing on a partial write.
function saveBoard(dashboardDir, board) {
  fs.mkdirSync(dashboardDir, { recursive: true });
  const p = boardPath(dashboardDir);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2));
  fs.renameSync(tmp, p);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(3).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  COLUMNS,
  boardPath,
  pidPath,
  portPath,
  defaultBoard,
  loadBoard,
  saveBoard,
  newId,
  nowIso,
};
