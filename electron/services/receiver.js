import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import { AppError, ConflictError } from '../errors.js';

const MAX_FAILED_ATTEMPTS = 12;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 12_000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function getLanAddresses() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      result.push(entry.address);
    }
  }
  return [...new Set(result)];
}

export class ReceiverServer {
  constructor({ repository, logger, onStatusChange = () => {} }) {
    this.repo = repository;
    this.logger = logger;
    this.onStatusChange = onStatusChange;
    this.server = null;
    this.wss = null;
    this.running = false;
    this.port = null;
    this.error = null;
    this.startedAt = null;
    this.heartbeatTimer = null;
    this.connections = new Map();
    this.failedAttempts = new Map();
  }

  get localBaseUrl() {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  getLanBaseUrls() {
    if (!this.port) return [];
    return getLanAddresses().map((address) => `http://${address}:${this.port}`);
  }

  getStatus() {
    return {
      running: this.running,
      port: this.port,
      error: this.error,
      startedAt: this.startedAt,
      localBaseUrl: this.localBaseUrl,
      lanBaseUrls: this.getLanBaseUrls(),
      connections: [...this.connections.values()].map((connection) => ({
        displayId: connection.displayId,
        displayName: connection.displayName,
        remoteAddress: connection.remoteAddress,
        connectedAt: connection.connectedAt,
        lastSeen: connection.lastSeen,
        lastAcknowledged: connection.lastAcknowledged,
      })),
      securityNote:
        'Receivers are on your local network and protected by a per-display pairing code. Anyone with a receiver link can view that display’s cue information. Do not share links outside the production network.',
    };
  }

  emitStatus() {
    try {
      this.onStatusChange(this.getStatus());
    } catch (error) {
      this.logger.error('Receiver status callback failed', error);
    }
  }

  async start(port) {
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1024 || numericPort > 65535) {
      throw new AppError('Receiver port must be between 1024 and 65535.', 'INVALID_PORT');
    }
    if (this.running) await this.stop();
    this.error = null;

    const server = http.createServer((request, response) => this.handleHttp(request, response));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
    this.server = server;
    this.wss = wss;

    server.on('upgrade', (request, socket, head) => this.handleUpgrade(request, socket, head));
    server.on('clientError', (error, socket) => {
      this.logger.warn('Receiver HTTP client error', error);
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } catch {
        /* ignore */
      }
    });

    await new Promise((resolve, reject) => {
      const handleError = (error) => {
        server.removeListener('listening', handleListening);
        this.error =
          error.code === 'EADDRINUSE'
            ? `Port ${numericPort} is already in use. Choose another receiver port in Settings.`
            : error.message;
        reject(new AppError(this.error, 'RECEIVER_START_FAILED'));
      };
      const handleListening = () => {
        server.removeListener('error', handleError);
        resolve();
      };
      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(numericPort, '0.0.0.0');
    }).catch((error) => {
      this.error = error.message;
      this.running = false;
      this.server = null;
      this.wss = null;
      this.emitStatus();
      throw error;
    });

    server.on('error', (error) => {
      this.error = error.message;
      this.logger.error('Receiver HTTP server error', error);
      this.emitStatus();
    });

    this.running = true;
    this.port = numericPort;
    this.startedAt = new Date().toISOString();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    this.repo.logActivity({
      kind: 'display',
      message: `ScreenPilot receiver server started on port ${numericPort}`,
      detail: { lanAddresses: getLanAddresses() },
    });
    this.emitStatus();
    return this.getStatus();
  }

  async stop({ silent = false } = {}) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const connection of this.connections.values()) {
      try {
        connection.ws.close(1001, 'ShowFlow receiver server stopped');
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
    if (this.wss) {
      try {
        this.wss.close();
      } catch {
        /* ignore */
      }
    }
    const server = this.server;
    this.server = null;
    this.wss = null;
    this.running = false;
    this.port = null;
    this.startedAt = null;
    if (server) {
      await new Promise((resolve) => {
        try {
          server.close(() => resolve());
        } catch {
          resolve();
        }
        setTimeout(resolve, 1500).unref?.();
      });
    }
    if (!silent) this.emitStatus();
  }

  heartbeat() {
    for (const [displayId, connection] of this.connections) {
      if (!connection.ws.isAlive) {
        try {
          connection.ws.terminate();
        } catch {
          /* ignore */
        }
        this.connections.delete(displayId);
        continue;
      }
      connection.ws.isAlive = false;
      try {
        connection.ws.ping();
        connection.ws.send(JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() }));
      } catch {
        this.connections.delete(displayId);
      }
    }
  }

  recordFailure(ip) {
    const now = Date.now();
    const current = this.failedAttempts.get(ip);
    if (!current || now > current.resetAt) {
      this.failedAttempts.set(ip, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
      return true;
    }
    current.count += 1;
    if (current.count > MAX_FAILED_ATTEMPTS) return false;
    return true;
  }

  resolveDisplay(displayId, code) {
    if (!displayId || typeof displayId !== 'string' || !code) return null;
    const display = this.repo.findByPairing(displayId, String(code));
    if (!display || !display.enabled) return null;
    return display;
  }

  handleHttp(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const commonHeaders = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    };

    if (url.pathname === '/health') {
      response.writeHead(200, { ...commonHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ app: 'ShowFlow ScreenPilot', ok: true, running: this.running }));
      return;
    }

    if (url.pathname === '/') {
      response.writeHead(200, { ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ShowFlow ScreenPilot</title>
      <style>body{background:#060708;color:#edf1f6;font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:560px;padding:32px}h1{font-size:22px;letter-spacing:-.02em}code{background:#11151a;border:1px solid #2a333e;border-radius:6px;padding:2px 6px;color:#7cecf7}p{color:#9aa5b4;line-height:1.6}</style></head>
      <body><main><h1>ShowFlow ScreenPilot receiver server</h1>
      <p>The local receiver server is running. Open a receiver link generated in <strong>ScreenPilot</strong> on the control computer.</p>
      <p>Direct access without a per-display pairing code is refused. This service is intended for the production local network only.</p></main></body></html>`);
      return;
    }

    const receiverMatch = /^\/r\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (receiverMatch) {
      const displayId = receiverMatch[1];
      const code = url.searchParams.get('code') || '';
      const ip = request.socket.remoteAddress || 'unknown';
      const display = this.resolveDisplay(displayId, code);
      if (!display) {
        const within = this.recordFailure(ip);
        response.writeHead(within ? 403 : 429, { ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8' });
        response.end(this.invalidPairingHtml(!within));
        return;
      }
      response.writeHead(200, { ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      response.end(this.receiverHtml(display, code));
      return;
    }

    response.writeHead(404, { ...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }

  invalidPairingHtml(rateLimited) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShowFlow receiver — pairing failed</title>
    <style>body{background:#060708;color:#edf1f6;font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:620px;padding:40px;border:1px solid #2a333e;background:#0d1014;border-radius:12px}h1{font-size:24px;margin:0 0 8px}p{color:#9aa5b4;line-height:1.6}.dot{width:8px;height:8px;border-radius:50%;background:#fb7185;display:inline-block;margin-right:8px}</style></head>
    <body><main><div><span class="dot"></span><strong>PAIRING FAILED</strong></div>
    <h1>${rateLimited ? 'Too many attempts' : 'This receiver link is not valid'}</h1>
    <p>${rateLimited ? 'Wait a few minutes and try again, or regenerate the pairing code in ShowFlow ScreenPilot.' : 'The pairing code may have been regenerated, or the link may be incomplete. Open ScreenPilot on the control computer and copy a fresh receiver link.'}</p>
    <p>Receiver access is limited to the production local network. No show content is shown without a valid pairing code.</p></main></body></html>`;
  }

  receiverHtml(display, code) {
    const config = safeJson({
      displayId: display.id,
      displayName: display.name,
      code,
      purpose: display.purpose,
      layout: display.layout,
      width: display.width,
      height: display.height,
    });
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowFlow Receiver · ${escapeHtml(display.name)}</title>
<style>
  :root { color-scheme: dark; --cyan:#2dd4e6; --amber:#fbbf24; --red:#fb7185; --muted:#8b97a6; }
  * { box-sizing: border-box; }
  html, body { margin:0; min-height:100%; background:#050607; color:#eef2f6; font-family:"Segoe UI",system-ui,-apple-system,sans-serif; overflow:hidden; }
  body { cursor:default; }
  .stage { min-height:100vh; display:flex; flex-direction:column; padding:4.5vw 5vw; position:relative; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
  .brandline { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:12px; letter-spacing:.16em; text-transform:uppercase; }
  .mark { width:22px; height:22px; border:1px solid rgba(45,212,230,.6); border-radius:5px; display:grid; place-items:center; color:var(--cyan); font-size:11px; font-weight:700; }
  .event { font-size:clamp(16px,2.1vw,30px); font-weight:600; letter-spacing:-.02em; margin-top:8px; }
  .venue { color:var(--muted); font-size:clamp(11px,1.1vw,15px); margin-top:4px; }
  .clock { font-variant-numeric:tabular-nums; font-family:"Cascadia Mono","JetBrains Mono",Consolas,monospace; font-size:clamp(20px,2.2vw,34px); letter-spacing:.04em; text-align:right; }
  .statusline { display:flex; align-items:center; justify-content:flex-end; gap:8px; color:var(--muted); font-size:11px; margin-top:8px; letter-spacing:.06em; text-transform:uppercase; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--muted); }
  .dot.ok { background:#4ade80; box-shadow:0 0 12px rgba(74,222,128,.45); }
  .dot.bad { background:var(--red); }
  .main { flex:1; display:flex; flex-direction:column; justify-content:center; padding:3vh 0; min-height:0; }
  .eyebrow { display:flex; align-items:center; gap:10px; color:var(--cyan); font-size:clamp(10px,1vw,14px); letter-spacing:.2em; text-transform:uppercase; font-weight:650; }
  .cue-number { color:var(--muted); }
  .cue-title { font-size:clamp(34px,7.2vw,118px); line-height:1.02; letter-spacing:-.045em; font-weight:650; margin:1.5vh 0 2vh; max-width:18ch; text-wrap:balance; }
  .cue-meta { display:flex; gap:24px; flex-wrap:wrap; color:var(--muted); font-size:clamp(12px,1.2vw,18px); }
  .next { border-top:1px solid rgba(255,255,255,.1); padding-top:2.2vh; display:flex; align-items:baseline; gap:18px; flex-wrap:wrap; }
  .next-label { color:var(--muted); letter-spacing:.16em; font-size:clamp(9px,.9vw,12px); text-transform:uppercase; white-space:nowrap; }
  .next-title { font-size:clamp(17px,2.2vw,32px); font-weight:520; color:#d9e0e8; }
  .idle { text-align:center; }
  .idle-title { font-size:clamp(42px,8vw,132px); font-weight:650; letter-spacing:-.05em; color:#e8edf3; }
  .idle-sub { color:var(--muted); font-size:clamp(12px,1.2vw,17px); margin-top:2vh; line-height:1.7; }
  .rehearsal { position:fixed; top:0; left:0; right:0; background:var(--amber); color:#1a1200; text-align:center; padding:7px 16px; font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; z-index:20; }
  .footer { display:flex; justify-content:space-between; gap:20px; color:#697483; font-size:10px; line-height:1.6; letter-spacing:.02em; border-top:1px solid rgba(255,255,255,.05); padding-top:12px; }
  .overlay { position:fixed; inset:0; background:rgba(5,6,7,.97); display:grid; place-items:center; z-index:40; text-align:center; padding:40px; }
  .overlay h1 { font-size:clamp(24px,4vw,48px); margin:0 0 12px; letter-spacing:-.03em; }
  .overlay p { color:var(--muted); max-width:560px; line-height:1.7; font-size:14px; margin:0 auto; }
  .overlay .dot { display:inline-block; margin-right:8px; }
  .hidden { display:none !important; }
  .receiver-controls { position:fixed; right:18px; bottom:16px; z-index:30; display:flex; gap:8px; opacity:.2; transition:opacity .2s; }
  .receiver-controls:hover, .receiver-controls:focus-within { opacity:1; }
  .receiver-controls button { background:#11151a; border:1px solid #2a333e; color:#c6ced8; border-radius:6px; padding:7px 10px; font-size:11px; cursor:pointer; }
  .receiver-controls button:focus-visible { outline:2px solid var(--cyan); outline-offset:2px; }
  .test { position:fixed; inset:0; z-index:15; display:grid; place-items:center; }
  .test-label { position:fixed; left:24px; bottom:20px; z-index:18; color:#0a0a0a; background:rgba(255,255,255,.8); padding:6px 10px; border-radius:4px; font-size:11px; font-weight:700; letter-spacing:.12em; }
  .test-bars { width:100%; height:100%; background:linear-gradient(to right,#c0c0c0 0 14.28%,#c0c000 14.28% 28.56%,#00c0c0 28.56% 42.84%,#00c000 42.84% 57.12%,#c000c0 57.12% 71.4%,#c00000 71.4% 85.68%,#0000c0 85.68% 100%); }
  .test-grid { width:100%; height:100%; background-color:#0a0b0d; background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.18) 1px,transparent 1px); background-size:48px 48px; }
  .test-white { width:100%; height:100%; background:#f5f7f8; }
  .test-black { width:100%; height:100%; background:#000; }
  .test-label-card { color:#eef2f6; text-align:center; font-size:clamp(20px,4vw,56px); font-weight:650; letter-spacing:-.03em; }
  .blackout { position:fixed; inset:0; background:#000; z-index:50; }
  .blackout span { position:fixed; right:16px; bottom:14px; color:rgba(255,255,255,.12); font-size:10px; letter-spacing:.2em; }
  .lower .main { justify-content:flex-end; }
  .lower .cue-title { font-size:clamp(30px,5.4vw,84px); }
  .minimal .top .event, .minimal .top .venue, .minimal .next, .minimal .footer { display:none; }
  .minimal .main { align-items:center; text-align:center; }
  .minimal .cue-title { text-align:center; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; animation:none !important; } }
</style>
</head>
<body>
<div class="rehearsal hidden" id="rehearsal">Rehearsal mode · not live</div>
<div class="stage" id="stage">
  <div class="top">
    <div>
      <div class="brandline"><span class="mark">SF</span><span>ShowFlow Receiver · <span id="display-name"></span></span></div>
      <div class="event" id="event-title">Awaiting ShowFlow</div>
      <div class="venue" id="event-venue"></div>
    </div>
    <div style="text-align:right">
      <div class="clock" id="clock">--:--:--</div>
      <div class="statusline"><span class="dot" id="status-dot"></span><span id="status-text">Connecting</span></div>
    </div>
  </div>
  <div class="main" id="content"></div>
  <div class="footer">
    <div id="delivery">No content received yet. This receiver only shows content sent from ScreenPilot.</div>
    <div style="text-align:right;max-width:40%">Receiver connection is verified. Projector output must be checked visually.<br><span id="resolution"></span></div>
  </div>
</div>
<div class="receiver-controls" id="controls">
  <button type="button" id="fullscreen">Enter fullscreen</button>
</div>
<div class="overlay hidden" id="overlay">
  <div>
    <h1><span class="dot bad"></span><span id="overlay-title">Receiver disconnected</span></h1>
    <p id="overlay-message">Check that ShowFlow is running on the control computer. This receiver will reconnect automatically.</p>
  </div>
</div>
<div id="test-root"></div>
<div class="blackout hidden" id="blackout"><span>BLACKOUT</span></div>
<script>
(() => {
  'use strict';
  const CONFIG = ${config};
  const els = {
    displayName: document.getElementById('display-name'),
    eventTitle: document.getElementById('event-title'),
    eventVenue: document.getElementById('event-venue'),
    clock: document.getElementById('clock'),
    content: document.getElementById('content'),
    delivery: document.getElementById('delivery'),
    resolution: document.getElementById('resolution'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    reel: document.getElementById('rehearsal'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayMessage: document.getElementById('overlay-message'),
    testRoot: document.getElementById('test-root'),
    blackout: document.getElementById('blackout'),
    fullscreen: document.getElementById('fullscreen'),
    stage: document.getElementById('stage'),
  };
  let socket = null;
  let reconnectDelay = 1500;
  let reconnectTimer = null;
  let lastMessageAt = 0;
  let mode = 'idle';
  let currentTest = null;
  let lastDelivery = null;

  els.displayName.textContent = CONFIG.displayName;
  els.resolution.textContent = CONFIG.width + ' × ' + CONFIG.height + ' · ' + CONFIG.layout.replaceAll('_',' ');
  document.body.classList.add(CONFIG.layout === 'lower_third' ? 'lower' : CONFIG.layout === 'minimal' ? 'minimal' : 'full');

  function setStatus(text, state) {
    els.statusText.textContent = text;
    els.statusDot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : '');
  }
  function showOverlay(title, message) {
    els.overlayTitle.textContent = title;
    els.overlayMessage.textContent = message;
    els.overlay.classList.remove('hidden');
  }
  function hideOverlay() { els.overlay.classList.add('hidden'); }
  function tickClock() {
    const now = new Date();
    els.clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()].map(v => String(v).padStart(2,'0')).join(':');
    if (socket && socket.readyState === WebSocket.OPEN && lastMessageAt && Date.now() - lastMessageAt > 32000) {
      setStatus('Connection stale', 'bad');
      showOverlay('Receiver connection stale', 'No message has arrived from ShowFlow for 32 seconds. The receiver will keep trying. Verify the control computer and network.');
    }
  }
  setInterval(tickClock, 1000); tickClock();

  function createIdle() {
    els.content.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'idle';
    const title = document.createElement('div');
    title.className = 'idle-title';
    title.textContent = 'STANDBY';
    const sub = document.createElement('div');
    sub.className = 'idle-sub';
    sub.textContent = 'Receiver connected. Awaiting cue content from the ShowFlow control room.';
    wrapper.append(title, sub);
    els.content.append(wrapper);
    els.delivery.textContent = 'No show content received in this session.';
  }

  function renderContent(payload) {
    els.content.innerHTML = '';
    els.testRoot.innerHTML = '';
    els.blackout.classList.add('hidden');
    currentTest = null;
    const modeLabel = payload.rehearsal ? 'REHEARSAL MODE · NOT LIVE' : 'CUE STANDBY';
    els.reel.classList.toggle('hidden', !payload.rehearsal);
    els.eventTitle.textContent = payload.eventTitle || CONFIG.displayName;
    els.eventVenue.textContent = payload.venue || '';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    const reuse = document.createElement('span');
    reuse.textContent = modeLabel;
    const number = document.createElement('span');
    number.className = 'cue-number';
    number.textContent = payload.currentCue ? 'CUE ' + String(payload.currentCue.number).padStart(2,'0') : '';
    eyebrow.append(reuse, number);
    if (payload.currentCue) {
      const title = document.createElement('div');
      title.className = 'cue-title';
      title.textContent = payload.currentCue.title;
      const meta = document.createElement('div');
      meta.className = 'cue-meta';
      const type = document.createElement('span');
      type.textContent = payload.currentCue.typeLabel || '';
      const operator = document.createElement('span');
      operator.textContent = payload.currentCue.operator ? 'Operator: ' + payload.currentCue.operator : '';
      const duration = document.createElement('span');
      duration.textContent = payload.currentCue.durationSeconds ? 'Duration: ' + formatDuration(payload.currentCue.durationSeconds) : '';
      meta.append(type, operator, duration);
      els.content.append(eyebrow, title, meta);
    } else {
      const title = document.createElement('div');
      title.className = 'cue-title';
      title.textContent = 'STANDBY';
      const sub = document.createElement('div');
      sub.className = 'idle-sub';
      sub.textContent = payload.nextCue ? 'Next: ' + payload.nextCue.title : 'Awaiting the next cue.';
      els.content.append(eyebrow, title, sub);
    }
    if (payload.nextCue) {
      const next = document.createElement('div');
      next.className = 'next';
      const label = document.createElement('span');
      label.className = 'next-label';
      label.textContent = 'Up next';
      const title = document.createElement('span');
      title.className = 'next-title';
      title.textContent = payload.nextCue.number + ' · ' + payload.nextCue.title;
      next.append(label, title);
      els.content.append(next);
    }
    const when = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
    lastDelivery = when;
    els.delivery.textContent = 'Content received ' + formatTime(when) + ' · receiver acknowledged · verify the projector output visually.';
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(value / 60);
    const s = value % 60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  function formatTime(date) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(v => String(v).padStart(2,'0')).join(':');
  }

  function renderTest(payload) {
    els.content.innerHTML = '';
    els.blackout.classList.add('hidden');
    els.reel.classList.add('hidden');
    currentTest = payload.pattern || 'bars';
    els.testRoot.innerHTML = '';
    if (currentTest === 'blackout') {
      els.blackout.classList.remove('hidden');
      return;
    }
    const test = document.createElement('div');
    test.className = 'test';
    if (currentTest === 'bars') {
      const bars = document.createElement('div');
      bars.className = 'test-bars';
      test.append(bars);
    } else if (currentTest === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'test-grid';
      test.append(grid);
    } else if (currentTest === 'white') {
      const white = document.createElement('div');
      white.className = 'test-white';
      test.append(white);
    } else {
      const label = document.createElement('div');
      label.className = 'test-label-card';
      label.textContent = CONFIG.displayName + ' · ' + CONFIG.width + ' × ' + CONFIG.height;
      test.append(label);
    }
    const badge = document.createElement('div');
    badge.className = 'test-label';
    badge.textContent = 'TEST PATTERN · ' + (payload.pattern || 'bars').toUpperCase() + ' · NOT SHOW CONTENT';
    els.testRoot.append(test, badge);
    els.delivery.textContent = 'Test pattern received ' + formatTime(new Date()) + '. This is not show content.';
  }

  function handleMessage(message) {
    lastMessageAt = Date.now();
    hideOverlay();
    setStatus('Connected', 'ok');
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'heartbeat') {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
      return;
    }
    if (message.type === 'welcome') return;
    if (message.type === 'content') {
      renderContent(message.payload || message);
      if (message.messageId && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'content-ack', messageId: message.messageId, receivedAt: new Date().toISOString() }));
      }
      return;
    }
    if (message.type === 'test') { renderTest(message.payload || message); return; }
    if (message.type === 'blackout') {
      els.content.innerHTML = '';
      els.testRoot.innerHTML = '';
      els.reel.classList.add('hidden');
      els.blackout.classList.remove('hidden');
      els.delivery.textContent = 'Blackout received ' + formatTime(new Date()) + '. Receiver output requested black.';
      return;
    }
    if (message.type === 'clear') {
      els.blackout.classList.add('hidden');
      renderContent({ eventTitle: CONFIG.displayName, currentCue: null, nextCue: null });
    }
  }

  function connect() {
    clearTimeout(reconnectTimer);
    setStatus('Connecting', '');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = protocol + '//' + location.host + '/ws?displayId=' + encodeURIComponent(CONFIG.displayId) + '&code=' + encodeURIComponent(CONFIG.code);
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      reconnectDelay = 1500;
      lastMessageAt = Date.now();
      hideOverlay();
      setStatus('Connected · awaiting content', 'ok');
      if (els.content.childElementCount === 0) createIdle();
    });
    socket.addEventListener('message', (event) => {
      try { handleMessage(JSON.parse(event.data)); } catch (error) { console.error('Invalid receiver message', error); }
    });
    socket.addEventListener('close', () => {
      setStatus('Disconnected', 'bad');
      showOverlay('Receiver disconnected', 'Check that ShowFlow is running on the control computer. Reconnecting automatically…');
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 12000);
    });
    socket.addEventListener('error', () => {
      setStatus('Connection error', 'bad');
    });
  }

  els.fullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.warn('Fullscreen unavailable', error);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    els.fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
  });

  createIdle();
  connect();
})();
</script>
</body>
</html>`;
  }

  handleUpgrade(request, socket, head) {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }
    const ip = request.socket.remoteAddress || 'unknown';
    const displayId = url.searchParams.get('displayId');
    const code = url.searchParams.get('code');
    const display = this.resolveDisplay(displayId, code);
    if (!display) {
      if (!this.recordFailure(ip)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      } else {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      }
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (wsSocket) => {
      this.registerConnection(wsSocket, display, request);
    });
  }

  registerConnection(wsSocket, display, request) {
    const existing = this.connections.get(display.id);
    if (existing) {
      try {
        existing.ws.close(4001, 'Receiver reconnected from another window');
      } catch {
        /* ignore */
      }
      this.connections.delete(display.id);
    }
    wsSocket.isAlive = true;
    const now = new Date().toISOString();
    const connection = {
      ws: wsSocket,
      displayId: display.id,
      displayName: display.name,
      remoteAddress: request.socket.remoteAddress || 'unknown',
      connectedAt: now,
      lastSeen: now,
      lastAcknowledged: null,
    };
    this.connections.set(display.id, connection);
    wsSocket.on('pong', () => {
      connection.lastSeen = new Date().toISOString();
      wsSocket.isAlive = true;
    });
    wsSocket.on('message', (data) => {
      connection.lastSeen = new Date().toISOString();
      wsSocket.isAlive = true;
      try {
        const message = JSON.parse(data.toString('utf8'));
        if (message?.type === 'content-ack' && typeof message.messageId === 'string') {
          connection.lastAcknowledged = {
            messageId: message.messageId,
            receivedAt: message.receivedAt || new Date().toISOString(),
          };
          this.emitStatus();
        }
      } catch {
        /* ignore malformed messages */
      }
    });
    wsSocket.on('close', () => {
      if (this.connections.get(display.id) === connection) this.connections.delete(display.id);
      this.repo.updateDisplayLastSeen(display.id, new Date().toISOString());
      this.repo.logActivity({
        kind: 'display',
        message: `Receiver disconnected: ${display.name}`,
        detail: { remoteAddress: connection.remoteAddress },
      });
      this.emitStatus();
    });
    wsSocket.on('error', (error) => {
      this.logger.warn(`Receiver socket error for ${display.name}`, error);
    });
    try {
      wsSocket.send(
        JSON.stringify({
          type: 'welcome',
          display: { id: display.id, name: display.name, width: display.width, height: display.height },
          serverTime: new Date().toISOString(),
          note: 'Connected. Awaiting content from ScreenPilot.',
        }),
      );
    } catch (error) {
      this.logger.warn('Could not send receiver welcome', error);
    }
    this.repo.updateDisplayLastSeen(display.id, now);
    this.repo.logActivity({
      kind: 'display',
      message: `Receiver connected: ${display.name}`,
      detail: { remoteAddress: connection.remoteAddress, purpose: display.purpose },
    });
    this.emitStatus();
  }

  disconnectDisplay(displayId, reason = 'Pairing code regenerated') {
    const connection = this.connections.get(displayId);
    if (!connection) return false;
    try {
      connection.ws.close(4002, reason);
    } catch {
      /* ignore */
    }
    this.connections.delete(displayId);
    this.emitStatus();
    return true;
  }

  targetDisplays(target) {
    const all = this.repo.listDisplays().filter((display) => display.enabled);
    if (target?.displayId) {
      const display = all.find((item) => item.id === target.displayId);
      if (!display) throw new ConflictError('That display could not be found or is disabled.');
      return [display];
    }
    if (target?.purpose) {
      return all.filter((display) => display.purpose === target.purpose);
    }
    return all;
  }

  push(target, payload) {
    if (!this.running) throw new ConflictError('The receiver server is not running. Start it in ScreenPilot.');
    const displays = this.targetDisplays(target);
    const messageId = crypto.randomUUID();
    const sentAt = new Date().toISOString();
    const delivered = [];
    const offline = [];
    for (const display of displays) {
      const connection = this.connections.get(display.id);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(
            JSON.stringify({
              type: 'content',
              messageId,
              sentAt,
              payload: { ...payload, receivedAt: sentAt },
            }),
          );
          delivered.push(display.id);
        } catch {
          offline.push(display.id);
        }
      } else {
        offline.push(display.id);
      }
    }
    this.emitStatus();
    return {
      messageId,
      sentAt,
      delivered,
      offline,
      targets: displays.length,
      note:
        delivered.length > 0
          ? 'Content sent to connected receiver(s). A receiver acknowledgement confirms browser delivery only — verify the projector output visually.'
          : 'No connected receivers accepted the content. Check each receiver link and network connection.',
    };
  }

  sendTest(target, pattern = 'bars') {
    if (!this.running) throw new ConflictError('The receiver server is not running. Start it in ScreenPilot.');
    const displays = this.targetDisplays(target);
    const sentAt = new Date().toISOString();
    const delivered = [];
    const offline = [];
    for (const display of displays) {
      const connection = this.connections.get(display.id);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify({ type: 'test', sentAt, payload: { pattern } }));
          delivered.push(display.id);
        } catch {
          offline.push(display.id);
        }
      } else {
        offline.push(display.id);
      }
    }
    this.emitStatus();
    return { sentAt, delivered, offline, targets: displays.length, pattern };
  }

  blackout(target) {
    if (!this.running) throw new ConflictError('The receiver server is not running. Start it in ScreenPilot.');
    const displays = this.targetDisplays(target);
    const sentAt = new Date().toISOString();
    const delivered = [];
    const offline = [];
    for (const display of displays) {
      const connection = this.connections.get(display.id);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify({ type: 'blackout', sentAt }));
          delivered.push(display.id);
        } catch {
          offline.push(display.id);
        }
      } else {
        offline.push(display.id);
      }
    }
    this.emitStatus();
    return { sentAt, delivered, offline, targets: displays.length };
  }

  getLinks(displayId = null) {
    const bases = [
      { label: 'This computer', url: this.localBaseUrl },
      ...this.getLanBaseUrls().map((url) => ({ label: 'Local network', url })),
    ].filter((entry) => entry.url);
    let display = null;
    if (displayId) {
      display = this.repo.getDisplay(displayId);
      if (!display) throw new ConflictError('That display could not be found.');
    }
    const links = bases.map((entry) => ({
      ...entry,
      healthUrl: `${entry.url}/health`,
      receiverUrl: display
        ? `${entry.url}/r/${display.id}?code=${encodeURIComponent(display.pairingCode)}`
        : null,
    }));
    return {
      links,
      display: display
        ? { id: display.id, name: display.name, pairingCode: display.pairingCode, purpose: display.purpose }
        : null,
      note:
        'Use a local-network link on the receiver device. Windows Firewall may ask you to allow ShowFlow on private networks; allow private networks only if you intend to use receivers on the LAN.',
    };
  }
}
