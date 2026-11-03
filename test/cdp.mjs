// Minimal Chrome DevTools Protocol client for driving an isolated Obsidian instance.
// Node 22+ (global WebSocket/fetch). No dependencies.
import { writeFileSync } from 'node:fs';

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.problems = [];
  }

  static async attach(port = 9333) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const pages = targets.filter((t) => t.type === 'page' && t.url.startsWith('app://obsidian.md'));
    const page = pages.find((t) => t.url.includes('index.html') && !t.title.startsWith('设置')) || pages[0];
    if (!page) throw new Error('no Obsidian page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const p = c.pending.get(m.id);
        c.pending.delete(m.id);
        if (m.error) p.reject(new Error(`${m.error.message} ${m.error.data || ''}`));
        else p.resolve(m.result);
      } else if (m.method) {
        for (const fn of c.handlers.get(m.method) || []) fn(m.params);
      }
    };
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    c.on('Runtime.exceptionThrown', (p) =>
      c.problems.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
    c.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') c.problems.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  /** Evaluate an expression (may be an async IIFE) in the Obsidian renderer and return its JSON value. */
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  /** Emulate a viewport (CSS px) at the given device scale factor. */
  /** Bring the star chart tab to the front (guards against focus/tab changes between steps). */
  async focusChart() {
    await this.eval(`(() => { const l = app.workspace.getLeavesOfType('clowder-atlas-star-chart')[0]; app.workspace.setActiveLeaf(l, { focus: true }); app.workspace.revealLeaf(l); })()`);
  }

  async viewport(width, height, dpr = 2) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: dpr, mobile: false,
    });
    await this.settle(400);
    await this.focusChart();
    await this.settle(200);
  }

  async settle(ms = 300) {
    await new Promise((r) => setTimeout(r, ms));
    const frames = this.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const ok = await Promise.race([frames, new Promise((r) => setTimeout(() => r(false), 5000))]);
    if (!ok) throw new Error('rAF blocked: page hidden/occluded');
  }

  async shot(path, clip) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = { ...clip, scale: 1 };
    const { data } = await this.send('Page.captureScreenshot', params);
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  /** Trusted mouse input at viewport CSS coordinates. */
  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  }

  async click(x, y) {
    await this.mouse('mouseMoved', x, y, { button: 'none' });
    await this.mouse('mousePressed', x, y);
    await this.mouse('mouseReleased', x, y);
  }

  async key(key, code = key, keyCode = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  close() { this.ws.close(); }
}

export async function run(fn) {
  const cdp = await CDP.attach();
  try {
    await fn(cdp);
  } finally {
    if (cdp.problems.length) console.log('RENDERER PROBLEMS:\n  ' + cdp.problems.join('\n  '));
    cdp.close();
  }
}
