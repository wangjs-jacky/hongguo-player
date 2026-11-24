// SPDX-License-Identifier: GPL-3.0-only
// Long-lived bridge to the hg-resolve sidecar (official 7.4.3.32 playback model).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BIN = process.env.HONGGUO_RESOLVE_BIN || path.join(__dirname, 'native', 'hg-resolve');
const MATERIALS = process.env.HONGGUO_METASEC_DIR || path.join(__dirname, 'native', 'metasec');
const DEVICE = process.env.HONGGUO_RESOLVE_DEVICE || path.join(__dirname, '..', '.web-runtime', 'hg-resolve-device.json');
const TIMEOUT = Number(process.env.HONGGUO_RESOLVE_TIMEOUT) || 25000;
const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map();
let child = null;
let buffered = '';
let nextId = 1;
const pending = new Map();

function available() {
  return process.platform === 'darwin' && process.arch === 'arm64'
    && fs.existsSync(BIN) && fs.existsSync(path.join(MATERIALS, 'image.elf'))
    && fs.existsSync(path.join(MATERIALS, 'license.txt'));
}

function failAll(error) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}

function ensureChild() {
  if (child && child.exitCode === null && child.signalCode === null) return child;
  fs.mkdirSync(path.dirname(DEVICE), { recursive: true });
  child = spawn(BIN, ['--serve', '--device', DEVICE], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HONGGUO_METASEC_DIR: MATERIALS },
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffered += chunk;
    for (;;) {
      const at = buffered.indexOf('\n');
      if (at < 0) break;
      const line = buffered.slice(0, at).trim();
      buffered = buffered.slice(at + 1);
      if (!line) continue;
      let value;
      try { value = JSON.parse(line); } catch { continue; }
      const entry = pending.get(value.id);
      if (!entry) continue;
      pending.delete(value.id);
      clearTimeout(entry.timer);
      entry.resolve(value);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    for (const line of chunk.split('\n')) if (line.trim()) console.log('[hg-resolve]', line.trim());
  });
  const failed = (error) => {
    if (child) { child = null; }
    buffered = '';
    failAll(error);
  };
  child.on('error', (error) => failed(Object.assign(new Error(`取流进程启动失败: ${error.message}`), { code: 'RESOLVER_FAILED' })));
  child.on('exit', (code, signal) => failed(Object.assign(new Error(`取流进程已退出 (${code ?? signal})`), { code: 'RESOLVER_FAILED' })));
  return child;
}

function request({ seriesId, vid, definition, signal }) {
  if (!available()) {
    return Promise.reject(Object.assign(new Error('当前平台不支持内置取流器'), { code: 'RESOLVER_UNAVAILABLE' }));
  }
  const proc = ensureChild();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('取流超时'), { code: 'RESOLVER_TIMEOUT' }));
    }, TIMEOUT);
    timer.unref?.();
    const entry = { resolve, reject, timer };
    pending.set(id, entry);
    const abort = () => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      reject(Object.assign(new Error('已取消'), { code: 'ABORT_ERR' }));
    };
    if (signal) {
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      const settle = (fn) => (value) => { signal.removeEventListener('abort', abort); fn(value); };
      entry.resolve = settle(resolve);
      entry.reject = settle(reject);
    }
    proc.stdin.write(`${JSON.stringify({
      id, seriesId: String(seriesId), vid: String(vid),
      ...(definition ? { definition: Number(definition) } : {}),
    })}\n`, (error) => {
      if (!error) return;
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      reject(Object.assign(new Error(`取流请求发送失败: ${error.message}`), { code: 'RESOLVER_FAILED' }));
    });
  });
}

async function resolvePlay({ seriesId, vid, definition, signal }) {
  const key = `${seriesId}:${vid}:${definition || 0}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await request({ seriesId, vid, definition, signal });
  if (value.ok) {
    cache.set(key, { value, expires: Date.now() + CACHE_TTL });
    while (cache.size > 64) cache.delete(cache.keys().next().value);
  }
  return value;
}

function stop() {
  if (!child) return;
  const current = child;
  child = null;
  current.stdin.end();
  current.kill('SIGTERM');
}

module.exports = { resolvePlay, available, stop, BIN, MATERIALS };
