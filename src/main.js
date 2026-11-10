'use strict';

var obsidian = require('obsidian');

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════
const VIEW_TYPE_PROVENANCE_LENS = 'clowder-atlas-provenance-lens';
const VIEW_TYPE_STAR_CHART = 'clowder-atlas-star-chart';
const VIEW_TYPE_CAFE_CHAT = 'clowder-atlas-cafe-chat';
const ATLAS_DIR_DEFAULT = '_atlas';
// For people who don't have Clowder AI yet — the official README's Quick Start (desktop installer, or from source).
const CLOWDER_RELEASES_URL = 'https://github.com/zts212653/clowder-ai/releases/latest';
const CLOWDER_INSTALL_URL = 'https://github.com/zts212653/clowder-ai#quick-start';
// Local ports where a Cat Cafe API usually listens (3004 is the Clowder AI default).
const CAFE_SCAN_PORTS = [3004, 3000, 3001, 3005, 4000, 8080];
const CAT_COLORS = {
  opus:    { name: '布偶猫/宪宪', breed: '布偶猫', nickname: '宪宪', mention: '@opus',    color: '#6C8EBF', label: '布偶蓝', specialty: '深度思考 · 系统架构' },
  astra:   { name: '缅因猫/砚砚', breed: '缅因猫', nickname: '砚砚', mention: '@砚砚',    color: '#D4A574', label: '缅因琥珀', specialty: '代码审计 · 质量守护' },
  argon:   { name: '金渐层/小多子', breed: '金渐层', nickname: '小多子', mention: '@小多子', color: '#E8B84B', label: '暖金',   specialty: '视觉设计 · 体验打磨' },
  kimi:    { name: '月野兔/水兵月', breed: '月野兔', nickname: '水兵月', mention: '@水兵月', color: '#B8C4D4', label: '月光银', specialty: '快速原型 · 实用路线' },
  fish:    { name: '鱼儿',         breed: '深海鱼', nickname: '鱼儿',   mention: '@鱼儿',   color: '#5B9EA6', label: '深海青', specialty: '知识连接 · 发散思维' },
  tabby:   { name: '狸花猫/小狸花', breed: '狸花猫', nickname: '小狸花', mention: '@小狸花', color: '#8C9E6E', label: '松针绿', specialty: '敏捷巡检 · 灵感捕手' },
};
const LUMINANCE_STATES = {
  active:  { label: '恒星', icon: '★', cssClass: 'atlas-luminance-active',  hex: '#FFD700' },
  warm:    { label: '温星', icon: '◆', cssClass: 'atlas-luminance-warm',    hex: '#DEB887' },
  cool:    { label: '冷星', icon: '◇', cssClass: 'atlas-luminance-cool',    hex: '#A9B7C6' },
  dormant: { label: '暗尘', icon: '·', cssClass: 'atlas-luminance-dormant', hex: '#5C6370' },
};
const MEMORY_TYPE_COLORS = {
  semantic:   { label: '语义', hex: '#6C8EBF', icon: '🧠' },
  episodic:   { label: '情景', hex: '#D4A574', icon: '🕐' },
  procedural: { label: '程序', hex: '#6AAF6A', icon: '⚙️' },
};
const STATUS_LABELS = {
  draft:        { label: '草稿', icon: '📝' },
  pending:      { label: '待结晶', icon: '💎' },
  crystallized: { label: '已结晶', icon: '✨' },
  dormant:      { label: '休眠', icon: '💤' },
};
const CAT_SPECIALTIES = {
  opus:  '深度思考 · 系统架构',
  astra: '代码审计 · 质量守护',
  argon: '视觉设计 · 体验打磨',
  kimi:  '快速原型 · 实用路线',
  fish:  '知识连接 · 发散思维',
  tabby: '敏捷巡检 · 灵感捕手',
};

// ═══════════════════════════════════════════════
// Default Settings
// ═══════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  atlasDir: ATLAS_DIR_DEFAULT,
  canvasDir: '_atlas/canvases',
  enableGraphColors: true,
  catCafeEnabled: false,
  catCafeAddress: 'http://localhost:3004',
  defaultMemoryType: 'semantic',
  syncFrequency: 'manual',
  debugLog: false,
  summonedCats: [],
  failedSends: [],  // sends that did not land, kept until resent, put back or deleted (see recordFailedSend)
  revisionTargets: {},  // per cafe and thread: the passage that conversation is revising (see setRevisionTarget)
  chatPassages: [],  // unsent selections; kept until sent or explicitly removed
  passageRequests: {},  // multi-source request snapshots; never legacy single-passage replacement targets
};

// ═══════════════════════════════════════════════
// Passages — one selected part of a note, sent to the cats to discuss or revise
// ═══════════════════════════════════════════════
// The cafe takes up to 100,000 characters per message (clowder-ai messages.schema.ts); room is left for the request.
const PASSAGE_MAX_CHARS = 90000;
const CHAT_PLACEHOLDER = '和伴读猫猫聊笔记（默认唤醒在场猫猫，Enter 发送）…';

function normalizePassages(input) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(p => p && typeof p.text === 'string');
}

function samePassage(a, b) {
  return a.path === b.path && a.text === b.text
    && a.from.line === b.from.line && a.from.ch === b.from.ch && a.to.line === b.to.line && a.to.ch === b.to.ch;
}

function passagesUniqueNotes(input) {
  return [...new Map(normalizePassages(input).map(p => [p.path, { path: p.path, basename: p.basename }])).values()];
}

function passagesLabel(input) {
  const list = normalizePassages(input), notes = passagesUniqueNotes(list);
  return `${list.length} 段选段（跨 ${notes.length} 篇笔记 · 共 ${list.reduce((n, p) => n + p.text.length, 0)} 字）`;
}

function passagesMessage(input, request = '') {
  const list = normalizePassages(input), notes = passagesUniqueNotes(list);
  const fence = passageFence(list.map(p => p.text).join('\n'));
  return `[跨文件选段交叉引用 · 共 ${list.length} 段 · 来自 ${notes.length} 篇笔记]\n\n`
    + list.map((p, i) => `[#${i + 1} · 笔记「${p.basename}」${passageLines(p)} · 路径：${p.path}]\n\n${fence}\n${p.text}\n${fence}`).join('\n\n')
    + `\n\n${request || '请交叉对比以上选段的核心关联、共识、分歧与待验证问题。'}\n\n`
    + '（引用源文时请标明 [#序号] 与源笔记路径；同名笔记请用完整路径双链。多段综合稿只供复制，不自动替换源文。）';
}

/** 「第 3–5 行」 for a passage; a selection that ends at the start of a line does not count that line. */
function passageLines(p) {
  const last = p.to.ch === 0 && p.to.line > p.from.line ? p.to.line - 1 : p.to.line;
  return last === p.from.line ? `第 ${p.from.line + 1} 行` : `第 ${p.from.line + 1}–${last + 1} 行`;
}

/** A fence longer than any run of backticks inside `text`, so the passage (and its revision) can be quoted whole. */
function passageFence(text) {
  const longest = Math.max(0, ...(String(text).match(/`+/g) || []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The last 修改稿 block in a cat's reply (fenced with 3+ backticks or tildes), without its fences; null if none. */
function extractRevision(content) {
  const re = /(^|\n)(`{3,}|~{3,})[ \t]*修改稿[^\n]*\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
  let match, last = null;
  while ((match = re.exec(String(content || '')))) last = match[3];
  return last;
}

/** Offset of {line, ch} in `text`, or -1 when that line is not there. */
function offsetOfPos(text, pos) {
  let offset = 0;
  for (let line = 0; line < pos.line; line++) {
    const nl = text.indexOf('\n', offset);
    if (nl < 0) return -1;
    offset = nl + 1;
  }
  return offset + pos.ch;
}

/** {line, ch} of `offset` in `text`. */
function posOfOffset(text, offset) {
  const before = text.slice(0, offset);
  return { line: (before.match(/\n/g) || []).length, ch: offset - (before.lastIndexOf('\n') + 1) };
}

/** Where the passage to revise is in `content` now: still at its place, or the only place its text occurs. */
function locatePassage(content, target) {
  const expected = offsetOfPos(content, target.from);
  if (expected >= 0 && content.startsWith(target.original, expected)) return { offset: expected };
  const first = content.indexOf(target.original);
  if (first < 0) return { offset: -1, reason: '原段落已经改动过，找不到原文' };
  if (content.indexOf(target.original, first + 1) >= 0) return { offset: -1, reason: '原段落挪了位置，文中又有不止一处相同的文字，无法确定替换哪一处' };
  return { offset: first };
}

/**
 * The message that sends a passage: quoted whole, then what the user asks. Whether the cats discuss it or revise it is
 * up to those words; a revised version goes in a 修改稿 block, so it can be put back in its place.
 */
function passageMessage(p, request) {
  if (Array.isArray(p)) return p.length === 1 ? passageMessage(p[0], request) : passagesMessage(p, request);
  const fence = passageFence(p.text);
  return `[选段 · 笔记「${p.basename}」${passageLines(p)}]\n\n${fence}\n${p.text}\n${fence}\n\n`
    + `${request || '请看看这段，说说你的看法；觉得需要修改的话，也给出修改稿。'}\n\n`
    + `（如果是要修改这段，请把改好的完整段落放进一个 ${fence}修改稿 代码块，说明写在代码块外；只是讨论的话，正常回答就好。）`;
}

/** How a passage message reads in the panel before the cafe has it, and when it failed: the passage named, then the words. */
function passageShown(p, request) {
  if (Array.isArray(p)) {
    if (p.length === 1) return passageShown(p[0], request);
    const head = `📌 交叉引用 · ${passagesLabel(p)} · ${p.map((s, i) => `#${i + 1}《${s.basename}》${passageLines(s)}`).join(' · ')}`;
    return request ? `${head}\n${request}` : head;
  }
  const head = `📌 选段 · 《${p.basename}》${passageLines(p)}`;
  return request ? `${head}\n${request}` : head;
}

/**
 * What the chat shows of its messages. A cat's reply is admitted empty as soon as the cat starts (lifecycle status
 * processing); its words then grow in place (isDraft) and it settles as completed, failed, canceled or interrupted —
 * keeping its id. So a change of any message's words or state, not only a new message, is a change to show.
 */
function messagesKey(messages) {
  return JSON.stringify((messages || []).map((m) => [m.id, m.content || '', m.lifecycle?.status ?? null, Boolean(m.isDraft)]));
}

/**
 * The name a conversation the plugin opens starts with: its kind (`label`), then what it is about — the passage or the
 * note at hand, else the start of its topic. It is the cafe's temporary title, so the first cat to answer names the
 * conversation after the talk.
 */
function threadTitle(label, { passage = null, noteName = '', topic = '' } = {}) {
  const clip = (s, n) => { const chars = Array.from(s); return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : s; };
  if (Array.isArray(passage)) {
    if (passage.length < 2) return threadTitle(label, { passage: passage[0] || null, noteName, topic });
    const notes = passagesUniqueNotes(passage);
    return `${label} · 《${clip(notes[0].basename, 20)}》${notes.length > 1 ? `等 ${notes.length} 篇（${passage.length} 段）` : `（${passage.length} 段选段）`}`;
  }
  const about = passage ? `《${clip(passage.basename, 40)}》${passageLines(passage)}`
    : noteName ? `《${clip(noteName, 40)}》`
    : clip(String(topic).replace(/\s+/g, ' ').trim(), 30);
  return about ? `${label} · ${about}` : label;
}

/** A seminar's own conversation: 🎓 研讨会 · … (see threadTitle). */
function seminarThreadTitle(about) {
  return threadTitle('🎓 研讨会', about);
}

// ═══════════════════════════════════════════════
// Cat Cafe Client — connects to local Cat Cafe Hub API
// ═══════════════════════════════════════════════
class CatCafeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connected = false;
    this.cats = [];
    this.threads = [];
    this.lastError = null;
    this._pollTimer = null;
    this._reading = null;  // the read in flight (see connect)
    this._queued = null;   // the one read waiting behind it
    this.destroyed = false;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    // Use Obsidian's requestUrl (goes through Node.js, bypasses CORS)
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      'X-Cat-Cafe-User': 'default-user',
      ...(options.headers || {}),
    };
    const reqOpts = { url, method, headers, throw: false };
    if (options.body) {
      reqOpts.body = options.body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      reqOpts.contentType = headers['Content-Type'];
    }
    try {
      const resp = await obsidian.requestUrl(reqOpts);
      if (resp.status >= 400) {
        let reason = '';
        try { reason = typeof resp.json?.error === 'string' ? resp.json.error : ''; } catch {}
        throw new Error(reason ? `${reason}（HTTP ${resp.status}）` : `HTTP ${resp.status}`);
      }
      return resp.json;
    } catch (err) {
      throw err;
    }
  }

  /** True when `baseUrl` answers like a Cat Cafe: /api/health is ok and /api/cats lists cats (not just any "ok"). */
  static async isCafe(baseUrl) {
    const client = new CatCafeClient(baseUrl);
    if (!(await client.checkHealth())) return false;
    try {
      const data = await client._fetch('/api/cats');
      return Array.isArray(data?.cats);
    } catch {
      return false;
    }
  }

  async checkHealth() {
    try {
      const data = await this._fetch('/api/health');
      this.connected = data && data.status === 'ok';
      this.lastError = null;
      return this.connected;
    } catch (err) {
      this.connected = false;
      this.lastError = err.message || 'Connection failed';
      return false;
    }
  }

  // fetchCats / fetchThreads only read; connect() stores what they return (see _read).
  async fetchCats() {
    try {
      const data = await this._fetch('/api/cats');
      const raw = (data && data.cats) || [];
      // Deduplicate: API may return multiple model instances for the same cat personality
      // Group by nickname (or name), keep the first occurrence per unique personality
      const seen = new Map();
      for (const cat of raw) {
        const key = cat.nickname || cat.name || cat.id;
        if (!seen.has(key)) {
          seen.set(key, cat);
        }
      }
      return [...seen.values()];
    } catch (err) {
      console.warn('Clowder Atlas: Failed to fetch cats:', err.message);
      return this.cats;  // keep the last good list
    }
  }

  async fetchThreads(projectPath) {
    try {
      const data = await this._fetch('/api/threads');
      const allThreads = (data && data.threads) || [];
      // Filter to threads for this project/vault
      return projectPath
        ? allThreads.filter(t => t.projectPath === projectPath)
        : allThreads;
    } catch (err) {
      console.warn('Clowder Atlas: Failed to fetch threads:', err.message);
      return this.threads;  // keep the last good list
    }
  }

  async fetchThreadDetail(threadId) {
    try {
      return await this._fetch(`/api/threads/${threadId}`);
    } catch (err) {
      console.warn('Clowder Atlas: Failed to fetch thread detail:', err.message);
      return null;
    }
  }

  /**
   * Open a new conversation in the cafe, under this vault's path so it is listed with the vault's other threads. The
   * title is temporary (see seminarThreadTitle). As in the cafe's own new-conversation form, `idempotencyKey` makes a
   * repeat answer with the same conversation: a request sent again because its answer was lost opens nothing more.
   * The cafe accepts only the fields it knows, so nothing else is sent.
   */
  async createThread({ temporaryTitle, projectPath, idempotencyKey }) {
    const body = { temporaryTitle, idempotencyKey };
    if (projectPath) body.projectPath = projectPath;
    const thread = await this._fetch('/api/threads', { method: 'POST', body: JSON.stringify(body) });
    if (!thread?.id) throw new Error('猫咖没有返回新对话');
    return thread;
  }

  /**
   * Re-read health, cats and threads. One read runs at a time per client: a call made while one is running (the poll
   * and「↻ 刷新」share this path) gets a fresh read right after it, shared by all calls made in between, so an older
   * answer can never land on top of a newer one.
   */
  connect(projectPath) {
    if (this._queued) return this._queued;
    if (!this._reading) {
      this._reading = this._read(projectPath).finally(() => { this._reading = null; });
      return this._reading;
    }
    this._queued = this._reading.catch(() => {}).then(() => {
      this._queued = null;
      return this.connect(projectPath);
    });
    return this._queued;
  }

  /** One read, stored all at once; a client destroyed meanwhile (disconnected or replaced) keeps none of it. */
  async _read(projectPath) {
    if (this.destroyed) return false;  // a read queued behind one that outlived the client never goes out
    let ok = false, error = null;
    try {
      const data = await this._fetch('/api/health');
      ok = !!data && data.status === 'ok';
    } catch (err) {
      error = err.message || 'Connection failed';
    }
    const [cats, threads] = ok && !this.destroyed
      ? await Promise.all([this.fetchCats(), this.fetchThreads(projectPath)])
      : [this.cats, this.threads];
    if (this.destroyed) return false;
    this.connected = ok;
    this.lastError = error;
    this.cats = cats;
    this.threads = threads;
    return ok;
  }

  /** What the panels show from the cafe: connection, cats and threads. Polling reports when this changes. */
  rosterKey() {
    return JSON.stringify([this.connected, this.cats.map((c) => [c.id, c.nickname || c.name]), this.threads.map((t) => [t.id, t.title])]);
  }

  startPolling(projectPath, intervalMs = 30000, onChange = null) {
    this.stopPolling();
    this._pollTimer = setInterval(async () => {
      const before = this.rosterKey();
      await this.connect(projectPath);
      if (!this.destroyed && onChange && this.rosterKey() !== before) onChange();
    }, intervalMs);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  getHubUrl() {
    // Web UI runs on port 3003 (one below the API default of 3004)
    const apiPort = parseInt(new URL(this.baseUrl).port, 10) || 3004;
    const webPort = apiPort - 1;
    const origin = new URL(this.baseUrl);
    origin.port = String(webPort);
    return origin.origin;
  }

  /** Get full avatar image URL for a cat */
  getAvatarUrl(cat) {
    if (!cat || !cat.avatar) return null;
    return `${this.getHubUrl()}${cat.avatar}`;
  }

  /** Find a cat by id and return its info */
  findCat(catId) {
    return this.cats.find(c => c.id === catId) || null;
  }

  destroy() {
    this.destroyed = true;  // reads still in flight finish without touching this client (see _read)
    this.stopPolling();
    this.connected = false;
    this.cats = [];
    this.threads = [];
  }
}

// ═══════════════════════════════════════════════
// 3D Avatar Renderer — shared between all views
// ═══════════════════════════════════════════════
/**
 * Renders a 3D-style interactive cat avatar with glow ring, depth, and status.
 * @param {HTMLElement} parent - container to append to
 * @param {Object} cat - cat data from API
 * @param {CatCafeClient|null} client - for resolving avatar URL
 * @param {string} size - 'cafe' (42px), 'chat' (28px), 'author' (34px), 'mini' (20px)
 */
function renderCatAvatar3D(parent, cat, client, size) {
  const color = (cat?.color?.primary) || cat?.color || '#C87D55';
  const sizeClass = `atlas-avatar-3d-${size || 'cafe'}`;
  const wrap = parent.createDiv(`atlas-avatar-3d ${sizeClass}`);
  wrap.style.setProperty('--avatar-accent', color);

  // Outer glow ring (animated gradient border)
  const ring = wrap.createDiv('atlas-avatar-ring');

  // Inner photo container with depth
  const inner = wrap.createDiv('atlas-avatar-inner');

  const avatarUrl = client?.getAvatarUrl?.(cat);
  if (avatarUrl) {
    const img = inner.createEl('img', {
      cls: 'atlas-avatar-photo',
      attr: { src: avatarUrl, alt: cat?.nickname || cat?.name || '', draggable: 'false' }
    });
    img.addEventListener('error', () => {
      img.remove();
      inner.createEl('span', { text: '🐾', cls: 'atlas-avatar-emoji' });
    });
  } else {
    inner.createEl('span', { text: '🐾', cls: 'atlas-avatar-emoji' });
  }

  // Online status dot (green pulse)
  wrap.createDiv('atlas-avatar-status-dot');
  return wrap;
}

// ═══════════════════════════════════════════════
// Spec Parser — reads Atlas fields from frontmatter
// ═══════════════════════════════════════════════
class SpecParser {
  /**
   * Parse a file's frontmatter into a structured Atlas note object.
   * Returns null if the file has no Atlas-relevant fields.
   */
  static parse(frontmatter) {
    if (!frontmatter) return null;

    // Detect Atlas level
    const hasVersion = !!frontmatter.atlas_version;
    const hasId = !!frontmatter.atlas_id;
    const hasL1 = !!(frontmatter.atlas_authors || frontmatter.atlas_source);
    const hasL1Plus = !!(frontmatter.atlas_author_details || frontmatter.atlas_evidence);
    const hasLuminance = !!frontmatter.luminance;

    // Legacy compat: old notes with only authors/type/status are also relevant
    const hasLegacy = !!(frontmatter.authors || frontmatter.status);
    const hasPaper = !!(frontmatter.paper_arxiv || (frontmatter.type === 'paper'));

    // At minimum we need memory_type or atlas_version or L1 fields or legacy fields
    if (!frontmatter.memory_type && !hasVersion && !hasL1 && !hasLegacy && !hasPaper) return null;

    let level = 'L0';
    if (hasL1Plus) level = 'L1+';
    else if (hasL1) level = 'L1';
    if (hasLuminance) level = 'L2';

    // Diagnostics for unsupported versions
    const diagnostics = [];
    if (frontmatter.atlas_version && frontmatter.atlas_version !== 'v1') {
      diagnostics.push(`未知 Spec 版本: ${frontmatter.atlas_version}（仅支持 v1）`);
    }

    // Validate luminance value
    const validLuminance = ['active', 'warm', 'cool', 'dormant'];
    const luminance = validLuminance.includes(frontmatter.luminance) ? frontmatter.luminance : null;
    if (frontmatter.luminance && !luminance) {
      diagnostics.push(`未知 luminance 值: ${frontmatter.luminance}`);
    }

    return {
      level,
      diagnostics,
      atlas_version: frontmatter.atlas_version || null,
      atlas_id: frontmatter.atlas_id || null,
      memory_type: frontmatter.memory_type || 'unknown',
      memory_status: frontmatter.memory_status || 'draft',
      title: frontmatter.title || null,
      // L1 flat fields
      atlas_authors: SpecParser._toArray(frontmatter.atlas_authors),
      atlas_source: frontmatter.atlas_source || null,
      atlas_source_ref: frontmatter.atlas_source_ref || null,
      atlas_source_cafe: frontmatter.atlas_source_cafe || null,
      // L1+ structured — filter nulls
      atlas_author_details: SpecParser._cleanObjectArray(frontmatter.atlas_author_details),
      atlas_evidence: SpecParser._cleanObjectArray(frontmatter.atlas_evidence),
      // L2
      luminance: luminance,
      luminance_pinned: !!frontmatter.luminance_pinned,
      // Related — parse wikilinks
      related: SpecParser._toArray(frontmatter.related),
      tags: SpecParser._toArray(frontmatter.tags),
      // Legacy compat — read old format for display
      legacy_authors: SpecParser._cleanObjectArray(frontmatter.authors),
      legacy_status: frontmatter.status || null,
      // Paper-specific (both new and legacy)
      paper_authors: SpecParser._toArray(frontmatter.paper_authors || frontmatter.paper_authors),
      paper_arxiv: frontmatter.paper_arxiv || frontmatter.arxiv || null,
      paper_venue: frontmatter.paper_venue || frontmatter.venue || null,
      paper_date: frontmatter.paper_date || null,
      type: frontmatter.type || null,
    };
  }

  static _toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(v => v != null);
    if (typeof val === 'string') return [val];
    return [];
  }

  /** Filter null/undefined from object arrays, keeping only valid objects */
  static _cleanObjectArray(val) {
    if (!val) return [];
    if (!Array.isArray(val)) {
      // Could be a single object (legacy authors format)
      if (typeof val === 'object') return [val];
      return [];
    }
    return val.filter(item => item != null && typeof item === 'object');
  }

  /**
   * Parse a wikilink string like "[[target]]" or "[[target|alias]]" or bare "target"
   * Returns { target, display }
   */
  static parseWikilink(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/);
    if (match) {
      return { target: match[1].trim(), display: (match[2] || match[1]).trim() };
    }
    // Bare string — treat as target
    return { target: raw.trim(), display: raw.trim() };
  }

  /**
   * Resolve a full cat profile (color, breed, specialty, @mention) from a cat object or string.
   */
  static resolveCatProfile(catOrName) {
    if (!catOrName) return null;
    const rawStr = typeof catOrName === 'string'
      ? catOrName
      : [catOrName.id, catOrName.nickname, catOrName.displayName, catOrName.name, catOrName.breedId].filter(Boolean).join(' ');
    const lower = rawStr.toLowerCase();

    // Direct Cat Cafe ID mapping
    if (lower.includes('cat-xooblf7l') || lower.includes('缅因') || lower.includes('砚砚') || lower.includes('astra')) {
      return CAT_COLORS.astra;
    }
    if (lower.includes('cat-gpy5qnmg') || lower.includes('金渐层') || lower.includes('小多子') || lower.includes('argon')) {
      return CAT_COLORS.argon;
    }
    if (lower.includes('cat-0gs0urog') || lower.includes('月野兔') || lower.includes('水兵月') || lower.includes('kimi')) {
      return CAT_COLORS.kimi;
    }
    if (lower.includes('布偶') || lower.includes('宪宪') || lower.includes('opus')) {
      return CAT_COLORS.opus;
    }
    if (lower.includes('鱼儿') || lower.includes('深海') || lower.includes('fish')) {
      return CAT_COLORS.fish;
    }
    if (lower.includes('狸花') || lower.includes('小狸花') || lower.includes('tabby')) {
      return CAT_COLORS.tabby;
    }
    for (const [key, info] of Object.entries(CAT_COLORS)) {
      if (lower.includes(key) || lower.includes(info.name.toLowerCase())) {
        return info;
      }
    }
    return null;
  }

  /**
   * Resolve a cat color from author name or id.
   */
  static resolveCatColor(nameOrId) {
    return SpecParser.resolveCatProfile(nameOrId);
  }
}

// ═══════════════════════════════════════════════
// Provenance Lens View
// ═══════════════════════════════════════════════
// Exact source paragraphs: previewing a card and collecting it use the same text and positions.
function lensExcerpt(file, content, line = null) {
  const lines = content.split('\n');
  let body = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((text, i) => i > 0 && /^---\s*$/.test(text));
    if (end < 0) return null;
    body = end + 1;
  }
  let first = line;
  if (first == null) {
    let fenced = false;
    first = lines.findIndex((text, i) => {
      if (i < body) return false;
      if (/^\s*(`{3,}|~{3,})/.test(text)) { fenced = !fenced; return false; }
      return !fenced && !!text.trim() && !/^\s*(#|<!--|\|[- :]+\|)/.test(text);
    });
  }
  if (first < body || first < 0 || first >= lines.length || !lines[first].trim()) return null;
  let last = first;
  const structured = /^\s*(?:[-*+]\s|\d+[.)]\s|\|)/.test(lines[first]);
  // Keep headings, tables and callouts at their actual lines; prose includes its paragraph, never the whole note.
  const boundary = text => !text.trim() || /^\s*(#{1,6}\s|`{3,}|~{3,}|---\s*$)/.test(text);
  if (!structured) {
    while (first > body && !boundary(lines[first - 1])) first--;
    while (last + 1 < lines.length && !boundary(lines[last + 1])) last++;
  }
  const text = lines.slice(first, last + 1).join('\n');
  return { path: file.path, basename: file.basename, text, from: { line: first, ch: 0 }, to: { line: last, ch: lines[last].length } };
}

async function lensNetwork(app, file) {
  const cache = app.metadataCache;
  const resolve = (raw, from) => {
    const link = SpecParser.parseWikilink(raw);
    const target = link ? link.target : String(raw || '');
    return cache.getFirstLinkpathDest(target.split('#')[0], from.path);
  };
  const related = from => {
    const raw = cache.getFileCache(from)?.frontmatter?.related;
    return Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  };
  const incoming = [], outgoing = [], derived = [];
  for (const [path, targets] of Object.entries(cache.resolvedLinks || {})) {
    if (path === file.path || !targets[file.path]) continue;
    const source = app.vault.getAbstractFileByPath(path);
    if (!source || source.extension !== 'md') continue;
    const link = (cache.getFileCache(source)?.links || []).find(l => resolve(l.link, source)?.path === file.path);
    incoming.push({ path, file: source, kind: link ? '正文引用' : '属性关联', line: link?.position?.start?.line ?? null });
  }
  const seen = new Set();
  const add = (raw, kind) => {
    const dest = resolve(raw, file), path = dest?.path || String(raw);
    if (seen.has(path) || path === file.path) return;
    seen.add(path);
    outgoing.push({ path, file: dest || null, kind });
  };
  for (const raw of related(file)) add(raw, '研讨源笔记');
  for (const link of cache.getFileCache(file)?.links || []) add(link.link, '正文引用');
  for (const candidate of app.vault.getMarkdownFiles()) {
    if (candidate.path === file.path) continue;
    const fm = cache.getFileCache(candidate)?.frontmatter;
    if (!['pending', 'crystallized'].includes(fm?.memory_status)) continue;
    if (related(candidate).some(raw => resolve(raw, candidate)?.path === file.path)) {
      derived.push({ path: candidate.path, file: candidate, status: fm.memory_status, authors: fm.atlas_authors || [] });
    }
  }
  // Reads are lazy, when a card is displayed. Opening a popular note never reads its entire backlink corpus.
  return { incoming, outgoing, derived };
}

function lensThreads(plugin, file) {
  const client = plugin.cafeClient;
  if (!client) return [];
  const ids = new Set();
  for (const request of [...Object.values(plugin.settings.revisionTargets || {}), ...Object.values(plugin.settings.passageRequests || {})]) {
    if (request?.cafe !== client.baseUrl || !request.messageIds?.length) continue;
    if (request.path === file.path || request.passages?.some(p => p.path === file.path)) ids.add(request.threadId);
  }
  const fm = plugin.app?.metadataCache.getFileCache(file)?.frontmatter;
  if (fm?.atlas_source === 'clowder_ai' && fm.atlas_source_cafe === client.baseUrl) ids.add(fm.atlas_source_ref);
  return (client.threads || []).filter(thread => ids.has(thread.id));
}

class ProvenanceLensView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentFile = null;
    this._generation = 0;
    this._dirtyPaths = new Set();
  }
  getViewType() { return VIEW_TYPE_PROVENANCE_LENS; }
  getDisplayText() { return 'Provenance Lens'; }
  getIcon() { return 'eye'; }
  async onOpen() {
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateForActiveFile(false)));
    this.registerEvent(this.app.metadataCache.on('changed', file => this._scheduleMetadataRefresh(file)));
    this.registerEvent(this.app.metadataCache.on('resolved', () => this._scheduleMetadataRefresh()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file === this.currentFile || oldPath === this.currentFile?.path) this.refresh();
      else this._scheduleMetadataRefresh(file);
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file === this.currentFile || file.path === this.currentFile?.path) this.refresh();
      else this._scheduleMetadataRefresh(file);
    }));
    await this.updateForActiveFile();
  }
  async onClose() { this._generation++; clearTimeout(this._refreshTimer); }
  onResize() { if (this._needsRefresh) this.updateForActiveFile(false); }
  refresh() { this._needsRefresh = true; return this.updateForActiveFile(); }
  _networkSignature(network) {
    return JSON.stringify([
      network.incoming.map(e => [e.path, e.kind, e.line]),
      network.outgoing.map(e => [e.path, e.kind, e.file?.extension]),
      network.derived.map(e => [e.path, e.status, e.authors])
    ]);
  }
  _scheduleMetadataRefresh(file) {
    if (file) this._dirtyPaths.add(file.path);
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(async () => {
      const current = this.currentFile, generation = this._generation;
      const dirty = [...this._dirtyPaths];
      this._dirtyPaths.clear();
      if (!current) return;
      const network = await lensNetwork(this.app, current);
      if (generation !== this._generation) return;
      const paths = new Set([current.path, ...network.incoming.map(e => e.path), ...network.outgoing.map(e => e.path), ...network.derived.map(e => e.path)]);
      if (dirty.some(path => paths.has(path)) || this._networkSignature(network) !== this._networkKey) await this.refresh();
    }, 100);
  }
  async updateForActiveFile(force = true) {
    let file = this.app.workspace.getActiveFile();
    const viewType = this.app.workspace.activeLeaf?.view?.getViewType?.();
    if (!file && [VIEW_TYPE_PROVENANCE_LENS, VIEW_TYPE_CAFE_CHAT, VIEW_TYPE_STAR_CHART].includes(viewType)) file = this.currentFile;
    if (file && !this.app.vault.getAbstractFileByPath(file.path)) file = null;
    const root = this.containerEl.children[1];
    const nextFile = file?.extension === 'md' ? file : null;
    // Sidebar focus is not a new document. Leave its live buttons and reading position in place.
    if (!force && !this._needsRefresh && (nextFile?.path === this.currentFile?.path || (!file && this.currentFile))) return;
    // A hidden tab reports scrollTop=0. Keep its DOM until it is visible, then consume all queued state changes.
    if (this.currentFile && !root.getClientRects().length) { this._needsRefresh = true; return; }
    const sameFile = nextFile && nextFile.path === this.currentFile?.path;
    if (sameFile) this._readingState.scrollTop = root.scrollTop;
    else this._readingState = { shown: { incoming: 6, outgoing: 6 }, scrollTop: 0, footerOpen: false };
    const scrollTop = this._readingState.scrollTop;
    this._needsRefresh = false;
    const generation = ++this._generation;
    root.empty(); root.addClass('atlas-provenance-lens'); root.addClass('atlas-lens-v2');
    this.plugin.renderUnifiedNavBar(root, 'lens');
    this.currentFile = nextFile;
    if (!this.currentFile) {
      const welcome = root.createDiv('atlas-lens-welcome');
      welcome.createEl('h3', { text: '从一篇笔记开始' });
      welcome.createEl('p', { text: '打开笔记，查看引用原句、收集研究材料，或回到相关研讨。' });
      this._button(welcome, '✦ 打开记忆星图', () => this.plugin.openStarChart());
      return;
    }
    const note = this.currentNote = SpecParser.parse(this.app.metadataCache.getFileCache(file)?.frontmatter);
    const hero = root.createDiv('atlas-lens-hero');
    hero.createEl('div', { text: '笔记脉络', cls: 'atlas-lens-eyebrow' });
    hero.createEl('h3', { text: note?.title || file.basename });
    hero.createDiv({ text: file.path, cls: 'atlas-header-path' });
    const state = note?.memory_status;
    hero.createEl('span', { text: state === 'pending' ? '待审阅结晶' : state === 'crystallized' ? '已结晶' : '研究笔记', cls: 'atlas-lens-state' });
    const actions = hero.createDiv('atlas-lens-action-bar');
    this._button(actions, '💬 问猫猫', () => this.plugin.openCafeChat({ attachFile: file }));
    this._button(actions, '🎓 本篇研讨', () => this.plugin.openSeminarModal({ file, attachNote: true }));
    this._button(actions, '✦ 星图定位', () => this.plugin.openStarChart({ focusPath: file.path }));
    if (state === 'pending') {
      const review = root.createDiv('atlas-lens-review');
      review.createEl('strong', { text: '待审阅结晶卡' });
      review.createEl('p', { text: note.atlas_authors.length ? `由 ${note.atlas_authors.join('、')} 提炼；先核对下方源笔记，再确认保留。` : '先核对源笔记与内容，再确认保留。' });
      this._button(review, '✨ 确认点亮结晶', () => this._quickUpdateStatus(file, 'crystallized'), 'mod-cta');
    }
    const material = root.createDiv('atlas-lens-materials');
    const trayCount = this.plugin.chatPassages.length;
    material.createEl('span', { text: trayCount ? `引用篮 · ${trayCount} 段待讨论` : '把关联原句收进引用篮，再一起讨论' });
    this._button(material, '打开引用篮 →', () => this.plugin.openCafeChat({ passage: true }));
    const networkEl = root.createDiv('atlas-lens-network');
    networkEl.createEl('p', { text: '正在读取笔记脉络…', cls: 'atlas-empty-hint' });
    const discussions = root.createDiv('atlas-lens-discussions');
    this._renderThreads(discussions, file, note);
    this._renderFooter(root, file, note);
    try {
      const network = await lensNetwork(this.app, file);
      if (generation !== this._generation) return;
      this._networkKey = this._networkSignature(network);
      networkEl.empty();
      this._renderDerived(discussions, network.derived);
      if (note?.paper_arxiv && /^\d{4}\.\d{4,5}(v\d+)?$/.test(note.paper_arxiv)) {
        const section = networkEl.createDiv('atlas-lens-section');
        section.createEl('a', { text: `↗ 论文 · arXiv ${note.paper_arxiv}`, href: `https://arxiv.org/abs/${note.paper_arxiv}`, cls: 'external-link' });
      }
      await Promise.all([
        this._renderCards(networkEl, '引用此篇的笔记', network.incoming, generation, true),
        this._renderCards(networkEl, '此篇引用的笔记', network.outgoing, generation, false)
      ]);
      if (generation === this._generation) root.scrollTop = scrollTop;
    } catch (error) {
      if (generation !== this._generation) return;
      networkEl.empty(); networkEl.createEl('p', { text: '脉络暂未读完，请切回此页重试。', cls: 'atlas-empty-hint' });
      console.warn('Clowder Atlas: lens links could not be read', error);
    }
  }
  _button(parent, text, run, cls = '') {
    const button = parent.createEl('button', { text, cls });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try { await run(); } catch (error) { new obsidian.Notice(`⚠️ 操作未完成：${error.message}`); }
      finally { button.disabled = false; }
    });
    return button;
  }
  async _renderCards(parent, title, entries, generation, inbound) {
    const section = parent.createDiv('atlas-lens-section');
    const heading = section.createDiv('atlas-lens-section-heading');
    heading.createEl('h5', { text: title });
    heading.createEl('span', { text: String(entries.length), cls: 'atlas-lens-count' });
    if (!entries.length) { section.createEl('p', { text: inbound ? '还没有笔记引用此篇。' : '还没有源笔记链接。', cls: 'atlas-empty-hint' }); return; }
    const state = this._readingState, key = inbound ? 'incoming' : 'outgoing';
    let shown = Math.min(state.shown[key], entries.length);
    const list = section.createDiv('atlas-lens-card-list');
    const more = this._button(section, '显示更多', async () => {
      const root = this.containerEl.children[1], scrollTop = root.scrollTop;
      const next = entries.slice(shown, shown + 6); shown += next.length;
      state.shown[key] = shown;
      await Promise.all(next.map(entry => this._renderCard(list, entry, generation, inbound)));
      more.hidden = shown >= entries.length;
      if (generation === this._generation) root.scrollTop = scrollTop;
    });
    more.hidden = shown >= entries.length;
    await Promise.all(entries.slice(0, shown).map(entry => this._renderCard(list, entry, generation, inbound)));
  }
  async _renderCard(parent, entry, generation, inbound) {
    const card = parent.createDiv('atlas-lens-link-card');
    card.dataset.path = entry.path;
    const top = card.createDiv('atlas-lens-card-top');
    const open = this._button(top, `${inbound ? '←' : '↗'} ${entry.file?.basename || entry.path}`, () => {
      return entry.passage ? this.plugin.jumpToPassage(entry.passage) : this.app.workspace.openLinkText(entry.file.path, this.currentFile.path);
    }, 'atlas-lens-card-title');
    open.disabled = !entry.file;
    card.createDiv({ text: entry.path, cls: 'atlas-lens-card-path' });
    const kind = card.createDiv({ text: entry.kind, cls: 'atlas-lens-card-kind' });
    if (!entry.file) { card.createEl('p', { text: '源笔记尚未创建', cls: 'atlas-empty-hint' }); return; }
    if (entry.file.extension !== 'md') { card.createEl('p', { text: '附件 · 可打开查看，不摘取原句。', cls: 'atlas-empty-hint' }); return; }
    try {
      const content = await this.app.vault.cachedRead(entry.file);
      if (generation !== this._generation) return;
      entry.passage = inbound && entry.line == null ? null : lensExcerpt(entry.file, content, inbound ? entry.line : null);
      if (!entry.passage) { card.createEl('p', { text: '暂无可摘取的正文；打开笔记查看。', cls: 'atlas-empty-hint' }); return; }
      const passage = entry.passage;
      kind.setText(`${entry.kind} · ${passageLines(passage)}`);
      card.createEl('p', { text: passage.text, cls: 'atlas-lens-snippet', attr: { title: passage.text } });
      const index = this.plugin.chatPassages.findIndex(p => samePassage(p, passage));
      const collect = this._button(top, index < 0 ? '＋ 引用篮' : `✓ #${index + 1}`, async () => {
        const fresh = await this.app.vault.read(entry.file);
        const located = locatePassage(fresh, { original: passage.text, from: passage.from });
        if (located.offset < 0) { new obsidian.Notice('原句已变动，请刷新透镜后重新选择'); await this.refresh(); return; }
        const updated = { ...passage, from: posOfOffset(fresh, located.offset), to: posOfOffset(fresh, located.offset + passage.text.length) };
        if (await this.plugin.addChatPassage(updated, false)) await this.refresh();
      }, 'atlas-lens-collect');
      collect.disabled = index >= 0;
    } catch (error) {
      if (generation === this._generation) card.createEl('p', { text: '无法读取源笔记，请打开检查。', cls: 'atlas-empty-hint' });
    }
  }
  _renderThreads(parent, file, note) {
    const section = parent.createDiv('atlas-lens-section');
    section.createEl('h5', { text: '相关研讨' });
    const client = this.plugin.cafeClient;
    const threads = lensThreads(this.plugin, file);
    if (!threads.length) section.createEl('p', { text: this.plugin.isCafeConnected ? '本地尚无与此篇绑定的研讨记录。' : '连接猫咖后，可返回与此篇关联的研讨。', cls: 'atlas-empty-hint' });
    for (const thread of threads) {
      const button = this._button(section, `${thread.id === note?.atlas_source_ref ? '💬 原研讨 · ' : '💬 '}${thread.title || thread.id}`, () => {
        if (this.plugin.cafeClient !== client) { new obsidian.Notice('猫咖连接已变，请刷新透镜'); return; }
        return this.plugin.openCafeChat({ threadId: thread.id, client });
      }, 'atlas-lens-discussion');
      button.disabled = !this.plugin.isCafeConnected;
    }
    if (note?.atlas_source_ref && !threads.some(t => t.id === note.atlas_source_ref)) {
      section.createEl('p', { text: note.atlas_source_cafe ? '原研讨未在当前连接的对话列表中。' : '旧笔记未记录来源猫咖地址，暂不推断原研讨入口。', cls: 'atlas-empty-hint' });
    }
  }
  _renderDerived(parent, entries) {
    const section = parent.createDiv('atlas-lens-section');
    section.createEl('h5', { text: `由此篇提炼 · ${entries.length}` });
    if (!entries.length) section.createEl('p', { text: '研讨中的回复可存为待结晶笔记，并在这里回看。', cls: 'atlas-empty-hint' });
    for (const item of entries) {
      const card = section.createDiv('atlas-lens-derived');
      this._button(card, `${item.status === 'pending' ? '⏳' : '💎'} ${item.file.basename}`, () => this.app.workspace.openLinkText(item.path, this.currentFile.path));
      card.createEl('span', { text: Array.isArray(item.authors) ? item.authors.join('、') : String(item.authors), cls: 'atlas-lens-card-path' });
    }
  }
  _renderFooter(root, file, note) {
    const footer = root.createEl('details', { cls: 'atlas-lens-footer-bar' });
    const state = this._readingState;
    footer.open = state.footerOpen;
    footer.addEventListener('toggle', () => { state.footerOpen = footer.open; });
    footer.createEl('summary', { text: `记忆类型${note ? ` · ${MEMORY_TYPE_COLORS[note.memory_type]?.label || '未分类'}` : ' · 尚未设置'}` });
    const actions = footer.createDiv('atlas-lens-action-bar');
    for (const [key, type] of Object.entries(MEMORY_TYPE_COLORS)) {
      const button = this._button(actions, `${type.icon} ${type.label}`, () => this._quickEnrollFile(file, key));
      button.setAttribute('aria-pressed', String(note?.memory_type === key));
    }
    this._button(actions, note?.luminance_pinned ? '📌 已锁定恒星' : '📌 锁定恒星', () => this._togglePinLuminance(file, Boolean(note?.luminance_pinned)));
    if (note?.diagnostics?.length) footer.createEl('p', { text: note.diagnostics.join('；'), cls: 'atlas-diagnostic-warning' });
    if (note?.atlas_evidence?.length) {
      const sources = footer.createEl('details'); sources.createEl('summary', { text: '来源记录' });
      for (const evidence of note.atlas_evidence) sources.createEl('p', { text: [evidence.label, evidence.ref].filter(Boolean).join(' · ') });
    }
  }
  async _quickEnrollFile(file, memoryType) {
    await this.app.fileManager.processFrontMatter(file, fm => {
      if (!fm.atlas_version) fm.atlas_version = 'v1';
      if (!fm.atlas_id) fm.atlas_id = this.plugin._generateUUID();
      fm.memory_type = memoryType;
      if (!fm.memory_status) fm.memory_status = 'draft';
      if (!fm.atlas_source) fm.atlas_source = 'manual';
      if (!fm.created) fm.created = this.plugin._localDate();
      fm.updated = this.plugin._localDate();
    });
    this.plugin.updateStatusBar(); await this.refresh();
  }
  async _quickUpdateStatus(file, newStatus) {
    await this.app.fileManager.processFrontMatter(file, fm => {
      fm.memory_status = newStatus; fm.updated = this.plugin._localDate();
      if (newStatus === 'crystallized' && !fm.luminance) fm.luminance = 'warm';
    });
    const dest = newStatus === 'crystallized' ? await this.plugin.movePendingToCrystals(file) : null;
    this.plugin.updateStatusBar(); await this.refresh();
    new obsidian.Notice(dest ? `✨ 已点亮结晶，并移入 ${dest}` : '✨ 已点亮结晶');
  }
  async _togglePinLuminance(file, pinned) {
    await this.app.fileManager.processFrontMatter(file, fm => {
      fm.luminance_pinned = !pinned;
      if (!pinned) fm.luminance = 'active';
    });
    await this.refresh();
  }
}

// ═══════════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════════
class ClowderAtlasSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Clowder Atlas Settings' });

    // ── Basic ──
    containerEl.createEl('h3', { text: '基础' });

    new obsidian.Setting(containerEl)
      .setName('记忆笔记目录')
      .setDesc('猫产出的记忆笔记存放位置：待结晶的在 pending，点亮结晶后移入 crystals（Obsidian 正常索引）')
      .addText(text => text
        .setPlaceholder('_atlas')
        .setValue(this.plugin.settings.atlasDir)
        .onChange(async (value) => {
          this.plugin.settings.atlasDir = value || ATLAS_DIR_DEFAULT;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(containerEl)
      .setName('Canvas 输出目录')
      .setDesc('Atlas Canvas 自动生成的存放路径')
      .addText(text => text
        .setPlaceholder('_atlas/canvases')
        .setValue(this.plugin.settings.canvasDir)
        .onChange(async (value) => {
          this.plugin.settings.canvasDir = value || '_atlas/canvases';
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(containerEl)
      .setName('默认记忆类型')
      .addDropdown(drop => drop
        .addOption('semantic', '语义 (semantic)')
        .addOption('episodic', '情景 (episodic)')
        .addOption('procedural', '程序 (procedural)')
        .setValue(this.plugin.settings.defaultMemoryType)
        .onChange(async (value) => {
          this.plugin.settings.defaultMemoryType = value;
          await this.plugin.saveSettings();
        }));

    // ── Clowder AI Connection ──
    containerEl.createEl('h3', { text: 'Clowder AI 连接（可选）' });

    new obsidian.Setting(containerEl)
      .setName('启用 Clowder AI 连接')
      .setDesc('连接本地 Cat Cafe Hub，解锁猫咖实况、对话跟踪和满血模式')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.catCafeEnabled)
        .onChange(async (value) => {
          this.plugin.settings.catCafeEnabled = value;
          await this.plugin.saveSettings();
          if (value) {
            await this.plugin._initCafeConnection();
          } else {
            await this.plugin._disconnectCafe();
            new obsidian.Notice('🐾 已断开猫咖连接');
          }
        }));

    const connStatus = containerEl.createDiv('atlas-settings-conn-status');
    const _refreshConnStatus = () => {
      connStatus.empty();
      if (this.plugin.isCafeConnected) {
        const client = this.plugin.cafeClient;
        connStatus.createEl('span', {
          text: `✅ 已连接 · ${client.cats.length} 只猫 · ${client.threads.length} 条对话`,
          cls: 'atlas-conn-ok'
        });
      } else if (this.plugin.settings.catCafeEnabled) {
        const errMsg = this.plugin.cafeClient?.lastError || '无法连接';
        connStatus.createEl('span', {
          text: `❌ ${errMsg}`,
          cls: 'atlas-conn-err'
        });
        // Diagnostic & auto-fix button
        const fixRow = connStatus.createDiv('atlas-conn-fix-row');
        const diagBtn = fixRow.createEl('button', {
          text: '🔍 检测并修复',
          cls: 'atlas-conn-fix-btn'
        });
        diagBtn.addEventListener('click', async () => {
          diagBtn.textContent = '检测中…';
          diagBtn.disabled = true;
          const result = await this.plugin._diagnoseConnection();
          diagBtn.textContent = '🔍 检测并修复';
          diagBtn.disabled = false;
          _refreshConnStatus();
        });
        // Show hint based on error type
        const hint = connStatus.createDiv('atlas-conn-hint');
        if (errMsg.includes('abort') || errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED') || errMsg.includes('Failed')) {
          hint.textContent = '💡 请确认 Cat Cafe Hub 正在运行 (pnpm start)';
        }
      }
    };
    _refreshConnStatus();

    new obsidian.Setting(containerEl)
      .setName('Cat Cafe 地址')
      .setDesc('API 地址（通常是 http://localhost:3004）')
      .addText(text => text
        .setPlaceholder('http://localhost:3004')
        .setValue(this.plugin.settings.catCafeAddress)
        .onChange(async (value) => {
          this.plugin.settings.catCafeAddress = value;
          await this.plugin.saveSettings();
          if (this.plugin.settings.catCafeEnabled) {
            await this.plugin._initCafeConnection();
            _refreshConnStatus();
          }
        }));

    // One-click connect (same search as the chat panel) + where to get Clowder AI
    new obsidian.Setting(containerEl)
      .setName('一键连接猫咖')
      .setDesc('自动查找本机正在运行的猫咖，填好地址并打开连接。还没安装猫咖的话，先下载安装。')
      .addButton(btn => btn
        .setButtonText('🔌 一键连接')
        .setCta()
        .onClick(async () => {
          btn.setButtonText('查找中…');
          btn.setDisabled(true);
          const outcome = await this.plugin.oneClickConnect();
          if (outcome.status === 'connected') {
            new obsidian.Notice(`✅ 已连接猫咖：${outcome.address}`);
            this.display(); // refresh the whole page: toggle, status and address
            return;
          }
          new obsidian.Notice(outcome.status === 'failed'
            ? `❌ 找到了猫咖（${outcome.address}），但没能连上：${outcome.error}`
            : '❌ 本机没有找到运行中的猫咖 — 已安装的话先打开它；还没安装可以点「下载猫咖」');
          btn.setButtonText('🔌 一键连接');
          btn.setDisabled(false);
        }))
      .addButton(btn => btn
        .setButtonText('⬇️ 下载猫咖')
        .onClick(() => window.open(CLOWDER_RELEASES_URL)));

    // ── Visual ──
    containerEl.createEl('h3', { text: '视觉' });

    const themeNote = containerEl.createEl('p', { cls: 'setting-item-description' });
    themeNote.textContent = '深色/浅色主题 100% 跟随 Obsidian，无需手动开关';

    // ── Advanced ──
    containerEl.createEl('h3', { text: '高级' });

    new obsidian.Setting(containerEl)
      .setName('调试日志')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugLog)
        .onChange(async (value) => {
          this.plugin.settings.debugLog = value;
          await this.plugin.saveSettings();
        }));
  }
}

// ═══════════════════════════════════════════════
// Star Chart View — constellation-style memory atlas
// ═══════════════════════════════════════════════
class StarChartView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._animId = null;
    this._rotX = 0.32;
    this._rotY = 0;
    this._autoRotSpeed = 0.0011;
    this._paused = false;
    this._filter = 'all';
    this._isDragging = false;
    this._lastMouse = { x: 0, y: 0 };
    this._hoveredIdx = -1;
    this._zoom = 1.0;
    this._stars = [];
    this._edges = [];
    this._dust = [];
    this._time = 0;
    this._teardown = [];     // cleanup for whatever a build attached outside its own DOM
    this._openPanel = null;  // 'legend' | 'help' | null
  }

  getViewType() { return VIEW_TYPE_STAR_CHART; }
  getDisplayText() { return 'Atlas Star Chart'; }
  getIcon() { return 'star'; }

  async onOpen() {
    const container = this.containerEl.children[1];
    this._disposeChart();
    container.empty();
    container.addClass('atlas-star-chart-container');
    this._buildChart(container);
  }

  async onClose() {
    this._disposeChart();
  }

  /** Stop the render loop and detach window/document listeners and observers from the last build. */
  _disposeChart() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
    const fns = this._teardown;
    this._teardown = [];
    for (const fn of fns) fn();
    this._openPanel = null;
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._teardown.push(() => target.removeEventListener(type, handler, options));
  }

  /** setIcon with fallbacks: Lucide ids differ across Obsidian versions (circle-help vs help-circle). */
  _setIcon(el, ids) {
    for (const id of ids) {
      el.empty();
      obsidian.setIcon(el, id);
      if (el.querySelector('svg')) return;
    }
  }

  // ── Data gathering (same logic: all files, backlink scoring) ──
  _gatherData() {
    const allFiles = this.plugin.app.vault.getMarkdownFiles();
    const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks;

    const backlinkCounts = {};
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      for (const targetPath of Object.keys(targets)) {
        backlinkCounts[targetPath] = (backlinkCounts[targetPath] || 0) + 1;
      }
    }

    const scored = allFiles.map(file => {
      const outlinks = Object.keys(resolvedLinks[file.path] || {}).length;
      const backlinks = backlinkCounts[file.path] || 0;
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const note = SpecParser.parse(cache?.frontmatter);
      return { file, note, cache, backlinks, outlinks, score: backlinks * 2 + outlinks };
    });

    scored.sort((a, b) => b.score - a.score);
    const focused = scored.find(s => s.file.path === this._focusPath);
    const mainStars = scored.filter(s => s.score > 0 && s !== focused).slice(0, focused ? 79 : 80);
    if (focused) mainStars.unshift(focused);

    // Build connection graph
    const nodeMap = {};
    mainStars.forEach((item, i) => { nodeMap[item.file.path] = i; });

    const connections = [];
    const connSet = new Set();
    for (const { file } of mainStars) {
      const srcIdx = nodeMap[file.path];
      const targets = resolvedLinks[file.path] || {};
      for (const targetPath of Object.keys(targets)) {
        const tgtIdx = nodeMap[targetPath];
        if (tgtIdx !== undefined && tgtIdx !== srcIdx) {
          const key = srcIdx < tgtIdx ? `${srcIdx}-${tgtIdx}` : `${tgtIdx}-${srcIdx}`;
          if (!connSet.has(key)) {
            connSet.add(key);
            connections.push([srcIdx, tgtIdx]);
          }
        }
      }
    }

    return { mainStars, connections };
  }

  // ── 3D force-directed layout ──
  _layout3D(stars, connections) {
    const n = stars.length;
    const SPHERE_R = 280;

    // Fibonacci sphere — even distribution on a sphere surface
    const positions = stars.map((_, i) => {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (i / (n - 1 || 1)) * 2;        // -1..1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = golden * i;
      return {
        x: Math.cos(theta) * radiusAtY * SPHERE_R,
        y: y * SPHERE_R,
        z: Math.sin(theta) * radiusAtY * SPHERE_R
      };
    });

    // 3D force simulation
    const velocities = positions.map(() => ({ vx: 0, vy: 0, vz: 0 }));
    const iterations = 100;
    const repulsion = 8000;
    const attraction = 0.008;
    const gravity = 0.015;
    const damping = 0.88;

    for (let iter = 0; iter < iterations; iter++) {
      const temp = 1 - iter / iterations;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = positions[i].x - positions[j].x;
          let dy = positions[i].y - positions[j].y;
          let dz = positions[i].z - positions[j].z;
          let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          let force = repulsion / (dist * dist) * temp;
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          let fz = (dz / dist) * force;
          velocities[i].vx += fx; velocities[i].vy += fy; velocities[i].vz += fz;
          velocities[j].vx -= fx; velocities[j].vy -= fy; velocities[j].vz -= fz;
        }
      }

      for (const [a, b] of connections) {
        let dx = positions[b].x - positions[a].x;
        let dy = positions[b].y - positions[a].y;
        let dz = positions[b].z - positions[a].z;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        let force = dist * attraction * temp;
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        let fz = (dz / dist) * force;
        velocities[a].vx += fx; velocities[a].vy += fy; velocities[a].vz += fz;
        velocities[b].vx -= fx; velocities[b].vy -= fy; velocities[b].vz -= fz;
      }

      for (let i = 0; i < n; i++) {
        velocities[i].vx -= positions[i].x * gravity * temp;
        velocities[i].vy -= positions[i].y * gravity * temp;
        velocities[i].vz -= positions[i].z * gravity * temp;
      }

      for (let i = 0; i < n; i++) {
        velocities[i].vx *= damping; velocities[i].vy *= damping; velocities[i].vz *= damping;
        positions[i].x += velocities[i].vx;
        positions[i].y += velocities[i].vy;
        positions[i].z += velocities[i].vz;
      }
    }

    return positions;
  }

  _rotatePoint(x, y, z, rx, ry) {
    let x1 = x * Math.cos(ry) - z * Math.sin(ry);
    let z1 = x * Math.sin(ry) + z * Math.cos(ry);
    let y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
    let z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
    return { x: x1, y: y1, z: z2 };
  }

  _project(x, y, z, W, H) {
    const fov = 500 * this._zoom;
    const scale = fov / (z + fov + 400);
    return {
      sx: W / 2 + x * scale,
      sy: H / 2 + y * scale,
      scale: scale,
      depth: z
    };
  }

  _generateDust(count) {
    const dust = [];
    for (let i = 0; i < count; i++) {
      dust.push({
        x: (Math.random() - 0.5) * 900,
        y: (Math.random() - 0.5) * 900,
        z: (Math.random() - 0.5) * 900,
        brightness: Math.random() * 0.45 + 0.1,
        size: Math.random() * 1.2 + 0.3,
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.02 + 0.005
      });
    }
    return dust;
  }

  _starColor(backlinks, note) {
    if (backlinks >= 5) return '#F5C85C';
    if (note?.memory_type === 'semantic' && backlinks >= 2) return '#8AB4F8';
    if (note?.memory_type === 'procedural' && backlinks >= 2) return '#73DACA';
    if (backlinks >= 2) return '#E0AF68';
    if (backlinks >= 1) return '#A9B7C6';
    return '#6E6A66';
  }

  _starBaseRadius(backlinks) {
    if (backlinks >= 5) return 6.5;
    if (backlinks >= 2) return 4.2;
    if (backlinks >= 1) return 2.6;
    return 1.6;
  }

  _matchesFilter(star) {
    if (this._filter === 'all') return true;
    if (this._filter === 'star') return star.backlinks >= 5;
    if (this._filter === 'atlas') return !!star.note;
    return star.note?.memory_type === this._filter;
  }

  // ── Main build ──
  // Layout v2 (spec: research/agent-memory/internal/clowder-atlas/star-chart-layout-v2.md):
  // root grid = top bar (title + filters) · stage (canvas + overlays) · bottom bar (totals + actions)
  _buildChart(root) {
    const { mainStars, connections } = this._gatherData();
    root.classList.remove('is-empty', 'is-compact', 'is-narrow');

    // ── Top bar ──
    const topbar = root.createDiv('atlas-star-topbar');
    const title = topbar.createDiv('atlas-star-title');
    this._setIcon(title.createSpan({ cls: 'atlas-star-title-icon', attr: { 'aria-hidden': 'true' } }), ['sparkle', 'sparkles', 'star']);
    title.createSpan({ text: '记忆星图' });

    if (mainStars.length === 0) {
      root.addClass('is-empty');
      root.createDiv('atlas-star-stage').createDiv({
        cls: 'atlas-star-empty',
        text: '你的 Vault 还没有互相链接的笔记。开始用 [[双链]] 连接你的想法，星空就会亮起来 ✨'
      });
      return;
    }

    const positions3D = this._layout3D(mainStars, connections);

    this._stars = mainStars.map((star, i) => ({
      ...star,
      x: positions3D[i].x,
      y: positions3D[i].y,
      z: positions3D[i].z,
      twinkleOffset: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.015 + 0.005
    }));
    const focused = this._stars.find(s => s.file.path === this._focusPath);
    if (focused) {
      this._rotY = Math.atan2(focused.x, focused.z);
      const z = focused.x * Math.sin(this._rotY) + focused.z * Math.cos(this._rotY);
      this._rotX = Math.atan2(focused.y, z);
      this._paused = true;
      this._filter = 'all';
    }
    this._edges = connections;
    this._dust = this._generateDust(520);

    // ── Filters: six text buttons (wide pane) + one select (compact pane), one shared state ──
    const FILTERS = [
      { id: 'all',        short: '全部',  full: '全部星群' },
      { id: 'star',       short: '恒星',  full: '恒星' },
      { id: 'atlas',      short: 'Atlas', full: 'Atlas 记忆' },
      { id: 'semantic',   short: '语义',  full: '语义记忆' },
      { id: 'episodic',   short: '情景',  full: '情景记忆' },
      { id: 'procedural', short: '程序',  full: '程序记忆' },
    ];
    const filterGroup = topbar.createDiv({ cls: 'atlas-star-filters', attr: { role: 'group', 'aria-label': '星群筛选（单选）' } });
    const filterButtons = FILTERS.map((f) => {
      const btn = filterGroup.createEl('button', {
        text: f.short,
        cls: 'atlas-star-btn atlas-star-filter',
        attr: { type: 'button', 'data-filter': f.id, 'aria-pressed': 'false' },
      });
      btn.addEventListener('click', () => setFilter(f.id));
      return btn;
    });
    const filterSelectWrap = topbar.createEl('label', { cls: 'atlas-star-filter-select' });
    filterSelectWrap.createSpan({ cls: 'atlas-star-sr-only', text: '星群筛选' });
    const filterSelect = filterSelectWrap.createEl('select', { cls: 'atlas-star-select' });
    for (const f of FILTERS) filterSelect.createEl('option', { text: f.full, attr: { value: f.id } });
    this._setIcon(filterSelectWrap.createSpan({ cls: 'atlas-star-select-chevron', attr: { 'aria-hidden': 'true' } }), ['chevron-down']);
    filterSelect.addEventListener('change', () => setFilter(filterSelect.value));

    // ── Stage: canvas plus every in-canvas overlay, all positioned against the stage ──
    // Accessible names below avoid aria-label on large/hover surfaces: Obsidian turns every
    // aria-label into a hover tooltip, which would fight the star tooltip on the canvas.
    const uid = Math.random().toString(36).slice(2, 8);
    const stage = root.createDiv('atlas-star-stage');
    stage.createSpan({
      cls: 'atlas-star-sr-only',
      text: '记忆星图：拖拽旋转，滚轮或双指缩放，点击星体打开笔记',
      attr: { id: `atlas-star-canvas-label-${uid}` },
    });
    const canvas = stage.createEl('canvas', {
      cls: 'atlas-star-canvas',
      attr: { role: 'img', 'aria-labelledby': `atlas-star-canvas-label-${uid}` },
    });
    const sceneHint = stage.createDiv({ cls: 'atlas-star-scene-hint', attr: { 'aria-live': 'polite' } });
    const tooltip = stage.createDiv('atlas-star-tooltip');
    tooltip.style.display = 'none';

    // Filtering highlights/dims stars; it never changes the totals in the bottom bar.
    const setFilter = (value) => {
      const f = FILTERS.find((x) => x.id === value) || FILTERS[0];
      this._filter = f.id;
      for (const btn of filterButtons) btn.setAttribute('aria-pressed', String(btn.dataset.filter === f.id));
      if (filterSelect.value !== f.id) filterSelect.value = f.id;
      sceneHint.hidden = f.id === 'all';
      if (f.id !== 'all') {
        const n = this._stars.filter((s) => this._matchesFilter(s)).length;
        sceneHint.textContent = n > 0 ? `${f.full} · ${n} 颗星高亮` : `${f.full} · 暂无匹配的星`;
      }
    };
    setFilter(this._filter);

    // Retina support — use canvas's OWN rect (not parent, which includes footer)
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas._dpr = dpr;
      canvas._W = rect.width;
      canvas._H = rect.height;
    };

    // Store last frame's screen positions for pixel-perfect hit testing
    this._screenPos = [];

    // ── Mouse interaction ──
    let dragDistance = 0;  // a drag that ends over a star is a rotation, not a click
    canvas.addEventListener('mousedown', (e) => {
      this._isDragging = true;
      dragDistance = 0;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    });

    const onMouseUp = () => {
      this._isDragging = false;
      canvas.style.cursor = 'grab';
    };
    this._listen(window, 'mouseup', onMouseUp);

    const onMouseMove = (e) => {
      if (this._isDragging) {
        const dx = e.clientX - this._lastMouse.x;
        const dy = e.clientY - this._lastMouse.y;
        dragDistance += Math.abs(dx) + Math.abs(dy);
        this._rotY += dx * 0.005;
        this._rotX += dy * 0.005;
        this._rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this._rotX));
        this._lastMouse = { x: e.clientX, y: e.clientY };
      }

      // Hit test using LAST RENDERED frame positions (pixel-perfect match).
      // Only the canvas itself hovers stars — never the legend/help panels or the bars.
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (e.target !== canvas || mx < 0 || my < 0 || mx > rect.width || my > rect.height) {
        this._hoveredIdx = -1;
        tooltip.style.display = 'none';
        return;
      }

      let closest = -1;
      let closestDist = 25;

      for (const sp of this._screenPos) {
        if (!sp.match) continue;
        const dx = mx - sp.sx, dy = my - sp.sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < closestDist) {
          closestDist = d;
          closest = sp.i;
        }
      }

      this._hoveredIdx = closest;
      if (closest >= 0) {
        const s = this._stars[closest];
        const name = s.note?.title || s.file.basename;
        const lumLabel = s.backlinks >= 5 ? '恒星' : s.backlinks >= 2 ? '温星' : s.backlinks >= 1 ? '冷星' : '暗尘';
        const typeTag = s.note ? ` · ${MEMORY_TYPE_COLORS[s.note.memory_type]?.label || 'Atlas'}` : '';
        tooltip.textContent = `${name} · 被 ${s.backlinks} 篇笔记链接 · ${lumLabel}${typeTag}`;
        tooltip.style.display = 'block';
        // Canvas fills the stage, so canvas coordinates are stage coordinates; clamp on every side.
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;
        tooltip.style.left = Math.max(12, Math.min(mx + 14, rect.width - tw - 12)) + 'px';
        tooltip.style.top = Math.max(12, Math.min(my - 12, rect.height - th - 12)) + 'px';
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.style.display = 'none';
        if (!this._isDragging) canvas.style.cursor = 'grab';
      }
    };
    this._listen(window, 'mousemove', onMouseMove);

    // Click to open note
    canvas.addEventListener('click', () => {
      if (dragDistance > 4) return;
      if (this._hoveredIdx >= 0) {
        const s = this._stars[this._hoveredIdx];
        this.plugin.app.workspace.getLeaf(false).openFile(s.file);
      }
    });

    // ── Zoom: mouse wheel + trackpad pinch + touch pinch ──
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey) {
        this._zoom = Math.max(0.2, Math.min(8.0, this._zoom * (1 - e.deltaY * 0.008)));
      } else {
        this._zoom = Math.max(0.2, Math.min(8.0, this._zoom * (1 - e.deltaY * 0.002)));
      }
    }, { passive: false });

    let gestureStartZoom = 1;
    canvas.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureStartZoom = this._zoom;
    });
    canvas.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      this._zoom = Math.max(0.2, Math.min(8.0, gestureStartZoom * e.scale));
    });
    canvas.addEventListener('gestureend', (e) => {
      e.preventDefault();
    });

    let touchStartDist = 0;
    let touchStartZoom = 1;

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        this._isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.sqrt(dx * dx + dy * dy);
        touchStartZoom = this._zoom;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._lastMouse.x;
        const dy = e.touches[0].clientY - this._lastMouse.y;
        this._rotY += dx * 0.005;
        this._rotX += dy * 0.005;
        this._rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this._rotX));
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / (touchStartDist || 1);
        this._zoom = Math.max(0.2, Math.min(8.0, touchStartZoom * scale));
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        this._isDragging = false;
      } else if (e.touches.length === 1) {
        this._isDragging = true;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    // ── Bottom bar: load totals (left) + actions (right). No cafe/seminar entry here. ──
    const bottombar = root.createDiv('atlas-star-bottombar');
    const atlasCount = this._stars.filter(s => s.note).length;
    const totals = `星图总量：${this._stars.length} 颗星 · ${this._edges.length} 条关联 · ${atlasCount} 篇 Atlas 记忆`;
    // aria-label doubles as Obsidian's hover tooltip (shown above the bar), so collapsed totals stay reachable
    const stats = bottombar.createDiv({ cls: 'atlas-star-stats', attr: { role: 'group', 'aria-label': totals, 'data-tooltip-position': 'top' } });
    const addStat = (extraCls, value, label) => {
      const item = stats.createSpan({ cls: `atlas-star-stat ${extraCls}`.trim() });
      item.createEl('b', { text: String(value) });
      item.createSpan({ text: label });
    };
    addStat('', this._stars.length, '颗星');
    addStat('is-edge-count', this._edges.length, '关联');
    addStat('is-atlas-count', atlasCount, 'Atlas');

    const actions = bottombar.createDiv({ cls: 'atlas-star-actions', attr: { role: 'group', 'aria-label': '星图操作' } });
    const addAction = ({ label, icons, text }) => {
      const btn = actions.createEl('button', {
        cls: `atlas-star-btn atlas-star-action${text ? '' : ' is-icon-only'}`,
        attr: { type: 'button', 'aria-label': label, 'data-tooltip-position': 'top' },  // Obsidian tooltip, no native title
      });
      const icon = btn.createSpan({ cls: 'atlas-star-icon', attr: { 'aria-hidden': 'true' } });
      this._setIcon(icon, icons);
      if (text) btn.createSpan({ cls: 'atlas-star-action-label', text });
      return { btn, icon };
    };

    const pause = addAction({ label: '暂停旋转', icons: ['pause'] });
    const syncPause = () => {
      const label = this._paused ? '开始旋转' : '暂停旋转';  // names the action the next click performs
      pause.btn.setAttribute('aria-label', label);
      this._setIcon(pause.icon, [this._paused ? 'play' : 'pause']);
    };
    syncPause();
    pause.btn.addEventListener('click', () => {
      this._paused = !this._paused;
      syncPause();
    });

    const reset = addAction({ label: '复位视角', icons: ['focus', 'scan', 'locate-fixed', 'crosshair'] });
    reset.btn.addEventListener('click', () => {
      this._rotX = 0.32;
      this._rotY = 0;
      this._zoom = 1.0;
    });

    actions.createSpan({ cls: 'atlas-star-divider', attr: { 'aria-hidden': 'true' } });

    const exportCanvas = addAction({ label: '导出 Canvas', icons: ['download'], text: '导出 Canvas' });
    exportCanvas.btn.addEventListener('click', () => this.plugin.generateCanvas());

    const legend = addAction({ label: '图例', icons: ['list'], text: '图例' });
    const help = addAction({ label: '操作说明', icons: ['circle-help', 'help-circle'] });

    // ── Legend / help: closed by default, open inside the stage, mutually exclusive ──
    const makePanel = (key, heading) => {
      const id = `atlas-star-${key}-${uid}`;
      const panel = stage.createEl('section', {
        cls: 'atlas-star-popover',
        attr: { id, tabindex: '-1', 'aria-labelledby': `${id}-title` },
      });
      panel.hidden = true;
      panel.createEl('h2', { text: heading, attr: { id: `${id}-title` } });
      return panel;
    };

    // Mirrors _starColor / _starBaseRadius: brightness = number of notes linking here.
    const legendPanel = makePanel('legend', '读懂这片星空');
    const addLegendRow = (label, { color, note, ring } = {}) => {
      const row = legendPanel.createDiv('atlas-star-legend-row');
      const dot = row.createSpan({ cls: ring ? 'atlas-star-dot is-ring' : 'atlas-star-dot' });
      if (color) dot.style.setProperty('--dot', color);
      row.createSpan({ text: label });
      if (note) row.createEl('small', { text: note });
    };
    legendPanel.createEl('h3', { text: '亮度 · 本库被链接数' });
    addLegendRow('恒星', { color: '#F5C85C', note: '≥ 5' });
    addLegendRow('温星', { color: '#E0AF68', note: '2–4' });
    addLegendRow('冷星', { color: '#A9B7C6', note: '1' });
    addLegendRow('暗尘', { color: '#6E6A66', note: '0' });
    legendPanel.createEl('h3', { text: '温星颜色 · 记忆类型' });
    addLegendRow('语义记忆', { color: '#8AB4F8' });
    addLegendRow('程序记忆', { color: '#73DACA' });
    addLegendRow('细金环', { ring: true, note: 'Atlas 记忆' });
    legendPanel.createEl('p', { text: '达到恒星亮度后统一显示金色。亮度是链接到这篇笔记的源笔记数，不代表猫猫调用次数。' });

    const helpPanel = makePanel('help', '漫游星图');
    for (const [what, how] of [['旋转视角', '拖拽'], ['缩放星群', '滚轮 / 双指'], ['打开笔记', '点击星体']]) {
      const row = helpPanel.createDiv('atlas-star-help-row');
      row.createSpan({ text: what });
      row.createSpan({ text: how });
    }
    helpPanel.createEl('p', { text: '视角迷路时，点击底栏的「复位视角」。' });

    const panels = {
      legend: { btn: legend.btn, panel: legendPanel },
      help: { btn: help.btn, panel: helpPanel },
    };
    const closePanel = (returnFocus) => {
      const open = this._openPanel && panels[this._openPanel];
      if (!open) return;
      open.panel.hidden = true;
      open.btn.setAttribute('aria-expanded', 'false');
      this._openPanel = null;
      if (returnFocus) open.btn.focus();
    };
    const togglePanel = (key) => {
      const wasOpen = this._openPanel === key;
      closePanel(false);
      if (wasOpen) return;
      const { btn, panel } = panels[key];
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      this._openPanel = key;
      panel.focus({ preventScroll: true });
    };
    for (const [key, { btn, panel }] of Object.entries(panels)) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', panel.id);
      btn.addEventListener('click', () => togglePanel(key));
    }
    // Escape only while focus is inside this view, so other panes keep their own Escape.
    this._listen(root, 'keydown', (e) => {
      if (e.key !== 'Escape' || !this._openPanel) return;
      e.preventDefault();
      e.stopPropagation();
      closePanel(true);
    });
    this._listen(document, 'pointerdown', (e) => {
      if (!this._openPanel) return;
      const t = e.target;
      const inside = t instanceof Node &&
        Object.values(panels).some(({ btn, panel }) => btn.contains(t) || panel.contains(t));
      if (!inside) closePanel(false);
    }, true);

    // ── Layout follows the pane's own width (not the app window) ──
    const applyWidth = (width) => {
      if (!width) return;  // hidden/background leaf: keep classes until it is measured again
      root.classList.toggle('is-compact', width < 680);
      root.classList.toggle('is-narrow', width < 440);
    };

    // Obsidian floats its status bar over the window's bottom-right corner. When this pane sits
    // under it: slide the actions left of it if they fit, otherwise lift the bar's content above it.
    const statusBar = root.ownerDocument.querySelector('.status-bar');
    const avoidStatusBar = () => {
      let reserve = 0;
      let lift = 0;
      if (statusBar) {
        const s = statusBar.getBoundingClientRect();
        const b = bottombar.getBoundingClientRect();
        if (s.width > 0 && s.height > 0 && s.left < b.right && s.right > b.left && s.top < b.bottom && s.bottom > b.top) {
          const overlap = Math.ceil(b.right - s.left);
          const leftPad = parseFloat(getComputedStyle(bottombar).paddingLeft) || 0;
          if (b.width - leftPad - (overlap + 12) >= actions.offsetWidth) reserve = overlap;
          else lift = Math.ceil(b.bottom - s.top);
        }
      }
      bottombar.style.setProperty('--atlas-star-statusbar', `${reserve}px`);
      bottombar.style.setProperty('--atlas-star-statusbar-lift', `${lift}px`);
    };

    applyWidth(root.getBoundingClientRect().width);
    avoidStatusBar();
    const widthObs = new ResizeObserver((entries) => {
      applyWidth(entries[0].contentRect.width);
      avoidStatusBar();
    });
    widthObs.observe(root);
    this._teardown.push(() => widthObs.disconnect());
    if (statusBar) {
      const statusObs = new ResizeObserver(() => avoidStatusBar());  // items change with the active view
      statusObs.observe(statusBar);
      this._teardown.push(() => statusObs.disconnect());
      // Neither observer fires when a move keeps both sizes: reordering equal panes, dragging the tab into
      // another split, or a window resize sliding the status bar past a fixed-width pane. Obsidian reports
      // these as workspace events that are already debounced until the DOM settles, so re-measure directly.
      const { workspace } = this.plugin.app;
      for (const name of ['layout-change', 'resize']) {
        const ref = workspace.on(name, avoidStatusBar);
        this._teardown.push(() => workspace.offref(ref));
      }
    }

    // Size the canvas backing store now, then follow the canvas' own box
    resize();
    const resizeObs = new ResizeObserver(() => resize());
    resizeObs.observe(canvas);
    this._teardown.push(() => resizeObs.disconnect());

    // ── Animation loop ──
    const ctx = canvas.getContext('2d');
    const render = () => {
      this._animId = requestAnimationFrame(render);
      this._time++;

      const dpr = canvas._dpr || 1;
      const W = canvas._W || 800;
      const H = canvas._H || 600;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Auto-rotate when not dragging and not paused
      if (!this._isDragging && !this._paused) {
        this._rotY += this._autoRotSpeed;
      }

      // ── Warm Midnight Cat Cafe Nebula Background ──
      const bgGrad = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, W * 0.78);
      bgGrad.addColorStop(0, '#241C27');
      bgGrad.addColorStop(0.52, '#171219');
      bgGrad.addColorStop(1, '#0E0B10');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Warm Cat Cafe Nebula Clouds (Caramel, Amber Gold, Ragdoll Blue)
      ctx.globalCompositeOperation = 'screen';
      const nebulaColors = [
        { x: W * 0.32, y: H * 0.38, r: W * 0.28, color: 'rgba(200, 125, 85, 0.045)' },
        { x: W * 0.68, y: H * 0.58, r: W * 0.24, color: 'rgba(108, 142, 191, 0.04)' },
        { x: W * 0.50, y: H * 0.28, r: W * 0.18, color: 'rgba(232, 184, 75, 0.03)' },
      ];
      for (const nb of nebulaColors) {
        const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        g.addColorStop(0, nb.color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';

      // ── Draw warm stardust particles ──
      for (const d of this._dust) {
        const rot = this._rotatePoint(d.x, d.y, d.z, this._rotX, this._rotY);
        const p = this._project(rot.x, rot.y, rot.z, W, H);
        if (p.scale <= 0) continue;

        const twinkle = 0.5 + 0.5 * Math.sin(this._time * d.twinkleSpeed + d.twinkleOffset);
        const alpha = d.brightness * twinkle * Math.min(1, p.scale * 1.4);
        const size = d.size * p.scale;

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(0.3, size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(238, 222, 204, ${alpha.toFixed(3)})`;
        ctx.fill();
      }

      // ── Project all stars ──
      const projected = this._stars.map((s, i) => {
        const rot = this._rotatePoint(s.x, s.y, s.z, this._rotX, this._rotY);
        const p = this._project(rot.x, rot.y, rot.z, W, H);
        const match = this._matchesFilter(s);
        return { i, sx: p.sx, sy: p.sy, scale: p.scale, depth: p.depth, match };
      });

      this._screenPos = projected;

      const projByIdx = {};
      for (const p of projected) projByIdx[p.i] = p;

      projected.sort((a, b) => b.depth - a.depth);

      // ── Draw constellation edges ──
      ctx.lineWidth = 1;
      for (const [a, b] of this._edges) {
        const pa = projByIdx[a];
        const pb = projByIdx[b];
        if (!pa || !pb) continue;
        const bothMatch = pa.match && pb.match;
        const avgScale = (pa.scale + pb.scale) / 2;
        const alpha = bothMatch ? Math.min(0.28, avgScale * 0.32) : 0.03;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.strokeStyle = `rgba(212, 165, 116, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }

      // ── Draw stars ──
      for (const p of projected) {
        const s = this._stars[p.i];
        const isHovered = p.i === this._hoveredIdx || s.file.path === this._focusPath;
        const dimFactor = p.match ? 1 : 0.14;
        const twinkle = 0.82 + 0.18 * Math.sin(this._time * s.twinkleSpeed + s.twinkleOffset);
        const baseR = this._starBaseRadius(s.backlinks);
        const r = baseR * p.scale * twinkle * (isHovered ? 1.55 : 1);
        const color = this._starColor(s.backlinks, s.note);

        if (r < 0.3) continue;

        // Soft halo glow
        if ((s.backlinks >= 2 || isHovered) && p.match) {
          const glowR = r * (s.backlinks >= 5 ? 4.2 : 2.8);
          const gc = this._hexToRGBA(color, (isHovered ? 0.42 : 0.24) * dimFactor);
          const gcFade = this._hexToRGBA(color, 0);
          const glowGrad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
          glowGrad.addColorStop(0, gc);
          glowGrad.addColorStop(1, gcFade);
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        // Star body
        if (s.backlinks >= 5) {
          this._drawStarShape(ctx, p.sx, p.sy, 5, r, r * 0.46, color, twinkle * dimFactor);
        } else {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
          const alpha = (s.backlinks === 0 ? 0.42 * p.scale : 0.9 * twinkle) * dimFactor;
          ctx.fillStyle = this._hexToRGBA(color, Math.min(1, alpha));
          ctx.fill();
        }

        // Subtle golden ring for Atlas-indexed notes
        if (s.note && r > 2.5 && p.match) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = this._hexToRGBA('#E8B84B', 0.45 * p.scale);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Pill-backed readable label for prominent or hovered stars
        if (p.match && ((s.backlinks >= 2 && p.scale > 0.44) || p.scale > 0.85 || isHovered)) {
          const rawTitle = s.note?.title || s.file.basename;
          const name = rawTitle.length > 18 ? rawTitle.substring(0, 17) + '…' : rawTitle;
          const fontSize = Math.max(9, Math.min(12, Math.round(10.5 * p.scale)));
          ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'center';
          const textW = ctx.measureText(name).width;
          const pillW = textW + 10;
          const pillH = fontSize + 5;
          const pillX = p.sx - pillW / 2;
          const pillY = p.sy + r + 4;

          ctx.fillStyle = isHovered ? 'rgba(200, 125, 85, 0.88)' : 'rgba(20, 16, 14, 0.68)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(pillX, pillY, pillW, pillH, 4);
          } else {
            ctx.rect(pillX, pillY, pillW, pillH);
          }
          ctx.fill();

          ctx.fillStyle = isHovered ? '#FFF' : `rgba(248, 240, 230, ${(0.88 * p.scale).toFixed(2)})`;
          ctx.fillText(name, p.sx, pillY + fontSize);
        }

        // Hovered outer ring
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#F5C85C';
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
    };

    canvas.style.cursor = 'grab';
    render();
  }

  // ── Canvas drawing helpers ──
  _drawStarShape(ctx, cx, cy, points, outerR, innerR, color, alpha) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI * i) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = this._hexToRGBA(color, Math.min(1, alpha));
    ctx.fill();
  }

  _hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
}

// ═══════════════════════════════════════════════
// Cat Cafe Chat View — embedded chat with your AI team
// ═══════════════════════════════════════════════
class CafeChatView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._pollTimer = null;
    this._messages = [];
    this._threadId = null;
    this._autoScroll = true;
    this._messagesKey = null;     // what is on screen (see messagesKey); a read showing anything else renders it
    this._expanded = new Set();   // long messages opened with 展开全文: they stay open when the list is rendered again
    this._pollRun = null;         // the one chain of message reads (see _startPolling)
    this._attachNote = false;
    this._pendingContext = null;
    this._resetRefs();
  }

  /** Element references of the connected layout; cleared on every rebuild so nothing writes into detached nodes. */
  _resetRefs() {
    this._strip = null;
    this._presenceBadge = null;
    this._seminarBtn = null;
    this._dock = null;
    this._noteLine = null;
    this._presenceHint = null;
    this._ctxBtn = null;
    this._ctxLabel = null;
    this._mentionBar = null;
    this._inputTools = null;
    this._input = null;
    this._header = null;
    this._config = null;
    this._configStatus = null;
    this._offlineManualBtn = null;
    this._passageRow = null;
  }

  getViewType() { return VIEW_TYPE_CAFE_CHAT; }
  getDisplayText() { return '☕ 猫咖对话'; }
  getIcon() { return 'message-circle'; }

  onload() {
    super.onload();
    // The study pod and the attach toggle follow the note being read, without re-rendering the conversation.
    const sync = () => this._syncReadingNote();
    this.registerEvent(this.app.workspace.on('active-leaf-change', sync));
    this.registerEvent(this.app.workspace.on('file-open', sync));
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    // A rebuild (reconnect, new address, offline and back) keeps what was being typed: the unsent draft and its
    // selection, and an address typed into the settings but not saved yet (with its selection and focus).
    if (this._input?.isConnected) this._draft = { value: this._input.value, start: this._input.selectionStart, end: this._input.selectionEnd };
    const addressDraft = this._takeAddressDraft();
    container.empty();
    container.addClass('atlas-cafe-chat');
    this._resetRefs();

    if (!this.plugin.isCafeConnected) {
      this.plugin.renderUnifiedNavBar(container, 'chat');
      this._renderOffline(container);
      if (addressDraft) {
        this._offlineManualBtn?.click();  // opens 填写地址
        this._putAddressDraft(addressDraft);
      }
      return;
    }

    const client = this.plugin.cafeClient;
    if (!this._threadId && client.threads.length > 0) {
      this._threadId = client.threads[0].id;
    }

    this._renderChat(container);
    if (this._draft) {
      this._input.value = this._draft.value;
      this._input.setSelectionRange(this._draft.start, this._draft.end);
      this._draft = null;
    }
    if (addressDraft) {
      this._toggleConfig(true);
      this._putAddressDraft(addressDraft);
    }
    // What is held locally (the messages last read for this thread, failed sends) shows at once, whether or not there
    // is a thread to read from the cafe; the read below then brings it up to date.
    this._renderMessages();
    if (this._pendingContext) {
      const ctx = this._pendingContext;
      this._pendingContext = null;
      await this.applyChatContext(ctx);
    } else {
      await this._loadMessages();
    }
    this._startPolling();
  }

  onClose() {
    this._stopPolling();
  }

  /**
   * Summoning only changes the companion strip and the @ list, so those are refreshed in place: the draft and its
   * selection, the attach toggle and the reading position in the conversation stay. Anything else rebuilds the panel.
   */
  refresh(opts = {}) {
    if (opts.companionsOnly && this._strip?.isConnected && this.plugin.isCafeConnected) {
      this._renderCompanions();
      this._renderHeader();  // the cafe may also have new or renamed threads
      this._renderConfigStatus();  // status only: an address being typed keeps its value, selection and focus
      return;
    }
    this.onOpen();
  }

  async applyChatContext(options = {}) {
    // A conversation is another connection's once the plugin has connected otherwise (see openCafeChat): nothing of
    // this context is applied then, also when it was kept for onOpen. False when not applied.
    if (options.client && options.client !== this.plugin.cafeClient) return false;
    if (!this._input) {
      this._pendingContext = options;
      return true;
    }
    if (options.threadId && options.threadId !== this._threadId) {
      // As when it is picked in the header: the other conversation's messages leave the screen before this one's load
      this._threadId = options.threadId;
      if (this._threadSelect) this._threadSelect.value = options.threadId;
      this._messages = [];
      this._messagesKey = null;
      this._renderMessages();
    }
    if (options.attachFile) {
      this._attachNote = true;
      this._syncReadingNote();
    }
    if (options.targetCatId) {
      this._insertMention(this.plugin.cafeClient?.findCat(options.targetCatId) || options.targetCatId);
    }
    if (options.prefillText) {
      this._input.value = options.prefillText;
      this._input.focus();
    }
    if (options.passage) {
      this._renderPassage();
      this._input.focus();
    }
    await this._loadMessages();
    this._pollSoon();
    return true;
  }

  _renderOffline(container) {
    const offline = container.createDiv('atlas-chat-offline');
    offline.createDiv({ text: '☕', cls: 'atlas-chat-offline-icon' });
    offline.createEl('h3', { text: '还没连上猫咖' });
    offline.createEl('p', { text: '猫咖（Clowder AI）是猫猫们工作和聊天的地方。连上之后，伴读席、研讨会和对话都会出现在这里。' });
    const lastError = this.plugin.settings.catCafeEnabled && this.plugin.cafeClient?.lastError;
    if (lastError) offline.createEl('p', { text: `连不上 ${this.plugin.settings.catCafeAddress}：${lastError}`, cls: 'atlas-cafe-onboard-error' });

    const actions = offline.createDiv('atlas-cafe-onboard-actions');
    const connectBtn = actions.createEl('button', { text: '🔌 一键连接猫咖', cls: 'atlas-btn atlas-btn-primary' });
    const manualBtn = actions.createEl('button', { text: '⚙️ 填写地址', cls: 'atlas-btn', attr: { 'aria-expanded': 'false', 'aria-controls': 'atlas-chat-config' } });
    this._offlineManualBtn = manualBtn;  // onOpen reopens it to carry an unsaved address across a rebuild
    const form = offline.createDiv({ cls: 'atlas-chat-config is-offline', attr: { id: 'atlas-chat-config', hidden: '' } });
    manualBtn.addEventListener('click', () => {
      const open = form.hidden;
      form.hidden = !open;
      manualBtn.setAttribute('aria-expanded', String(open));
      if (open && !form.hasChildNodes()) this._renderAddressForm(form);
      if (open) form.querySelector('input')?.focus();
    });

    const result = offline.createDiv('atlas-cafe-onboard-result');
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = '正在查找本机的猫咖…';
      result.empty();
      const outcome = await this.plugin.oneClickConnect();
      if (outcome.status === 'connected') return;  // every view was refreshed into its connected state
      connectBtn.disabled = false;
      connectBtn.textContent = '🔌 再试一次';
      if (outcome.status === 'failed') {
        result.createEl('p', { text: `找到了猫咖（${outcome.address}），但没能连上：${outcome.error}。请确认它运行正常后再试。` });
      } else {
        this._renderInstallGuide(result);
      }
    });
  }

  /** Shown when no Cat Cafe answers on this machine: where to get Clowder AI, then come back and retry. */
  _renderInstallGuide(parent) {
    const guide = parent.createDiv('atlas-cafe-install');
    guide.createEl('p', { text: '没有在本机找到正在运行的猫咖。还没安装的话：', cls: 'atlas-cafe-install-lead' });
    const steps = guide.createEl('ol');
    steps.createEl('li', { text: '从 Clowder AI 发布页下载桌面安装包并安装（Mac 选 .dmg：Apple 芯片用 arm64，Intel 用 x64；Windows 选 Setup .exe）' });
    steps.createEl('li', { text: '打开猫咖，等它启动完成' });
    steps.createEl('li', { text: '回到这里，点「再试一次」' });
    const links = guide.createDiv('atlas-cafe-install-links');
    const download = links.createEl('button', { text: '⬇️ 打开下载页', cls: 'atlas-btn atlas-btn-primary' });
    download.addEventListener('click', () => window.open(CLOWDER_RELEASES_URL));
    const docs = links.createEl('button', { text: '📖 安装说明', cls: 'atlas-btn' });
    docs.addEventListener('click', () => window.open(CLOWDER_INSTALL_URL));
    guide.createEl('p', {
      text: '已经装好的话，先把猫咖打开再试；熟悉命令行也可以按安装说明从源码安装。地址不是默认的 localhost:3004 时，用「手动设置」填写。',
      cls: 'atlas-cafe-install-note'
    });
  }

  /** The passage attached to the next message: which one, and ✕; the draft's prompt asks what to do with it. */
  _renderPassage() {
    const row = this._passageRow;
    if (!row) return;  // offline layout
    const list = this.plugin.chatPassages;
    const p = list[0];
    row.empty();
    row.hidden = !p;
    row.toggleClass('is-multi', list.length > 1);
    if (this._input) {
      this._input.placeholder = !p ? CHAT_PLACEHOLDER
        : list.length > 1 ? `围绕这 ${list.length} 段选段提问（如「对比 #1 和 #2」），或开启研讨会…`
        : '告诉猫猫要做什么：讨论这段，还是直接改；继续选段可跨笔记累加，Enter 发送…';
    }
    this._syncReadingNote();  // the 📎 whole-note toggle steps aside while a passage is attached, and comes back after
    if (!p) return;
    if (list.length > 1) {
      const head = row.createDiv('atlas-chat-passage-head');
      head.createSpan({ text: `📌 交叉引用 · ${passagesLabel(list)}`, cls: 'atlas-chat-passage-label' });
      const clear = head.createEl('button', { text: '清空 ✕', cls: 'atlas-chat-passage-clear', attr: { 'aria-label': '清空全部选段' } });
      clear.addEventListener('click', () => this.plugin.setChatPassages([]));
      const chips = row.createDiv({ cls: 'atlas-chat-passage-chips', attr: { role: 'list', 'aria-label': '已选跨文件段落列表' } });
      list.forEach((s, i) => {
        const chip = chips.createDiv({ cls: 'atlas-chat-passage-chip', attr: { role: 'listitem' } });
        chip.createSpan({ text: `#${i + 1}`, cls: 'atlas-chat-passage-chip-idx' });
        const jump = chip.createEl('button', { text: `《${s.basename}》${passageLines(s)} · ${s.text.length} 字`, cls: 'atlas-chat-passage-chip-jump', attr: { title: `${s.path}\n${s.text.slice(0, 400)}` } });
        jump.addEventListener('click', () => this.plugin.jumpToPassage(s));
        const remove = chip.createEl('button', { text: '✕', cls: 'atlas-chat-passage-chip-rm', attr: { 'aria-label': `移除第 ${i + 1} 段选段` } });
        remove.addEventListener('click', () => this.plugin.setChatPassages(this.plugin.chatPassages.filter(item => item !== s)));
      });
      return;
    }
    row.createSpan({ text: '📌', cls: 'atlas-chat-passage-icon', attr: { 'aria-hidden': 'true' } });
    row.createSpan({
      text: `选段 · 《${p.basename}》${passageLines(p)} · ${p.text.length} 字`,
      cls: 'atlas-chat-passage-label',
      attr: { title: `只附带这一段，不附整篇笔记：\n${p.text.length > 400 ? `${p.text.slice(0, 400)}…` : p.text}` },
    });
    const clear = row.createEl('button', { text: '✕', cls: 'atlas-chat-passage-clear', attr: { title: '不附带这段', 'aria-label': '不附带这段' } });
    clear.addEventListener('click', () => {
      this.plugin.setChatPassages([]);
    });
  }

  /** Keep what depends on the note being read in step with it: the note line, the seminar hint and the attach toggle. */
  _syncReadingNote() {
    if (!this._noteLine) return;  // offline layout
    const file = this.app.workspace.getActiveFile();
    const hasCats = Boolean(this.plugin.cafeClient?.cats?.length);
    const present = this.plugin.getSummonedCats().length;
    // 「当前笔记」, not 「正在伴读」: opening a note does not send it anywhere; the attach toggle decides that.
    const note = file
      ? `当前笔记 · ${file.basename}`
      : (present || !hasCats) ? '可以直接聊天，也可打开笔记' : '点选头像召唤，也可直接开研讨会';
    this._noteLine.setText(note);
    this._noteLine.title = note;
    this._seminarBtn.title = !hasCats
      ? '猫咖尚未提供伙伴名单，暂时无法组织研讨会'
      : file ? `围绕《${file.basename}》组织研讨会` : '组织多猫研讨会';

    this._ctxBtn.hidden = !file || Boolean(this.plugin.chatPassage);  // with a passage attached only the passage goes
    this._ctxBtn.setAttribute('aria-pressed', String(this._attachNote));
    if (file) {
      const label = `${this._attachNote ? '已附带' : '附带'} · ${file.basename}`;
      const meaning = this._attachNote ? `发送时将附上《${file.basename}》` : `点击后，发送时附上《${file.basename}》`;
      this._ctxLabel.setText(label);
      this._ctxBtn.title = meaning;
      this._ctxBtn.setAttribute('aria-label', `${label}（${meaning}）`);
    }
    // Nothing to attach and nobody to @: the toolbar row goes away instead of leaving a blank strip
    this._inputTools.hidden = this._ctxBtn.hidden && this._mentionBar.hidden;
  }

  /** Cats, presence and @ targets — rebuilt in place whenever someone is summoned or dismissed. */
  _renderCompanions() {
    const client = this.plugin.cafeClient;
    const cats = client?.cats || [];
    const summoned = this.plugin.getSummonedCats();
    const focusedCat = this._dock?.contains(document.activeElement) ? document.activeElement.dataset.catId : null;

    this._dock.empty();
    if (!cats.length) this._dock.createSpan({ text: '猫咖尚未提供伙伴名单', cls: 'atlas-companion-empty' });
    for (const cat of cats) {
      const profile = SpecParser.resolveCatProfile(cat);
      const name = cat.nickname || profile?.nickname || cat.displayName || cat.name || cat.id;
      const on = this.plugin.isCatSummoned(cat.id);
      const slot = this._dock.createEl('button', {
        cls: `atlas-companion-slot${on ? ' is-summoned' : ''}`,
        attr: {
          'aria-pressed': String(on),
          'aria-label': `${name}；点击召唤或取消，右键提问`,
          title: profile?.specialty ? `${name} · ${profile.specialty}` : name,
        },
      });
      slot.dataset.catId = cat.id;
      renderCatAvatar3D(slot, cat, client, 'mini');
      slot.createSpan({ text: name, cls: 'atlas-companion-slot-name' });
      slot.addEventListener('click', () => this.plugin.toggleSummonCat(cat.id));
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._askCat(cat);
      });
      slot.addEventListener('focus', () => slot.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      if (cat.id === focusedCat) slot.focus({ preventScroll: true });
    }

    const hasCats = cats.length > 0;
    this._presenceBadge.hidden = !hasCats;  // with no cats offered, 「未召唤」 would suggest someone to summon
    this._presenceBadge.setText(summoned.length ? `${summoned.length} 只在场` : '未召唤');
    this._presenceBadge.toggleClass('is-empty', !summoned.length);
    this._presenceHint.hidden = !hasCats;
    this._presenceHint.setText(summoned.length ? '点选召唤 · 右键提问' : '点选头像召唤');
    this._seminarBtn.disabled = !hasCats;

    // @ targets: the cats in attendance, otherwise the first four on offer. A chip only inserts the mention.
    this._mentionBar.empty();
    const targets = summoned.length ? summoned : cats.slice(0, 4);
    this._mentionBar.hidden = !targets.length;
    for (const cat of targets) {
      const profile = SpecParser.resolveCatProfile(cat);
      const name = cat.nickname || profile?.nickname || cat.displayName || cat.name || cat.id;
      const chip = this._mentionBar.createEl('button', {
        text: `@${name}`,
        cls: 'atlas-chat-mention-chip',
        attr: { title: `插入 ${profile?.mention || '@' + name}` },
      });
      chip.addEventListener('click', () => this._insertMention(cat));
      chip.addEventListener('focus', () => chip.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
    this._syncReadingNote();  // the note line's wording depends on who is present
  }

  /** Prefix the draft with a cat's @mention (once) and return to the draft. Nothing is sent. */
  _insertMention(cat) {
    if (!this._input) return;
    const profile = SpecParser.resolveCatProfile(cat);
    const name = cat?.nickname || profile?.nickname || cat?.displayName || cat?.name || cat?.id || cat;
    const mention = profile?.mention || `@${name}`;
    if (!this._input.value.includes(mention)) {
      this._input.value = `${mention} ${this._input.value}`.trim() + ' ';
    }
    this._input.focus();
  }

  /** Right-click on a cat: ask it, with the note being read attached when there is one. */
  _askCat(cat) {
    if (this.app.workspace.getActiveFile()) this._attachNote = true;
    this._syncReadingNote();
    this._insertMention(cat);
  }

  _renderChat(container) {
    this.plugin.renderUnifiedNavBar(container, 'chat');

    // ── 伴读席: presence + the one seminar entry · scrollable cats · the note being read ──
    this._strip = container.createEl('section', { cls: 'atlas-companion-strip', attr: { 'aria-label': '伴读席' } });
    const top = this._strip.createDiv('atlas-companion-strip-top');
    const titleGroup = top.createDiv('atlas-companion-title-group');
    titleGroup.createSpan({ text: '🐾 伴读席', cls: 'atlas-companion-strip-title' });
    this._presenceBadge = titleGroup.createSpan({ cls: 'atlas-companion-presence-badge' });
    this._seminarBtn = top.createEl('button', { text: '研讨会', cls: 'atlas-companion-seminar-pill' });
    this._seminarBtn.addEventListener('click', () => {
      const file = this.app.workspace.getActiveFile();  // the note being read now, not when the strip was built
      const passage = this.plugin.chatPassages.length ? this.plugin.chatPassages : null;
      this.plugin.openSeminarModal({ file, attachNote: !passage && Boolean(file), passage });
    });
    this._dock = this._strip.createDiv({ cls: 'atlas-companion-dock', attr: { 'aria-label': '可选伙伴；可横向滚动' } });
    const context = this._strip.createDiv('atlas-companion-context-bar');
    this._noteLine = context.createSpan({ cls: 'atlas-companion-note' });
    this._presenceHint = context.createSpan({ cls: 'atlas-companion-hint' });

    // ── Thread row (title shrinks; Hub and ⚙ stay) + the in-panel connection settings ⚙ opens ──
    this._header = container.createDiv('atlas-chat-header');
    this._config = container.createDiv({ cls: 'atlas-chat-config', attr: { id: 'atlas-chat-config', hidden: '' } });
    this._renderHeader();

    // ── Message area ──
    this._messageArea = container.createDiv('atlas-chat-messages');
    this._messageArea.addEventListener('scroll', () => {
      const el = this._messageArea;
      this._autoScroll = (el.scrollHeight - el.scrollTop - el.clientHeight) < 60;
    });

    // ── Input area: one-row toolbar (attach toggle · scrollable @ list), then draft + send ──
    const inputArea = container.createDiv('atlas-chat-input-area');
    // The passage attached to the next message (editor: 和猫猫讨论 / 请猫猫修改选中段落); hidden when there is none
    this._passageRow = inputArea.createDiv({ cls: 'atlas-chat-passage', attr: { hidden: '' } });
    const inputTools = this._inputTools = inputArea.createDiv('atlas-chat-input-tools');
    this._ctxBtn = inputTools.createEl('button', { cls: 'atlas-chat-ctx-btn', attr: { 'aria-pressed': 'false' } });
    this._ctxBtn.createSpan({ text: '📎', attr: { 'aria-hidden': 'true' } });
    this._ctxLabel = this._ctxBtn.createSpan({ cls: 'atlas-chat-ctx-label' });
    this._ctxBtn.addEventListener('click', () => {
      this._attachNote = !this._attachNote;
      this._syncReadingNote();
    });
    this._mentionBar = inputTools.createDiv({ cls: 'atlas-chat-mention-bar', attr: { role: 'group', 'aria-label': '插入提问对象；可横向滚动' } });

    const inputRow = inputArea.createDiv('atlas-chat-input-row');
    this._input = inputRow.createEl('textarea', {
      cls: 'atlas-chat-input',
      attr: { placeholder: CHAT_PLACEHOLDER, rows: '2', 'aria-label': '消息草稿' }
    });
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });

    const sendBtn = inputRow.createEl('button', {
      text: '发送',
      cls: 'atlas-chat-send-btn'
    });
    sendBtn.addEventListener('click', () => this._sendMessage());

    this._renderCompanions();  // fills the strip and the @ list, then the note-dependent parts
    this._renderPassage();
  }

  /** Thread picker, Hub and ⚙ — rebuilt in place when the cafe's thread list changes. */
  _renderHeader() {
    const header = this._header;
    const client = this.plugin.cafeClient;
    if (!header || !client) return;
    header.empty();
    this._threadSelect = null;
    if (!client.threads.some((t) => t.id === this._threadId)) {
      // The thread on screen is gone (or there was none yet): follow the first one, or show no thread at all when the
      // cafe has none left for this vault. Either way its messages leave the screen and nothing more is sent to or read
      // from it (see _isCurrent); the unsent draft stays.
      const next = client.threads[0] || null;
      if ((next?.id ?? null) !== (this._threadId ?? null)) {
        if (this._threadId) new obsidian.Notice(next ? `💬 当前对话已不在猫咖里，已切到「${next.title || '对话'}」` : '💬 当前对话已不在猫咖里');
        this._threadId = next?.id ?? null;
        this._messages = [];
        this._messagesKey = null;
        this._renderMessages();
        if (next) this._loadMessages();
      }
    }

    if (client.threads.length > 1) {
      this._threadSelect = header.createEl('select', { cls: 'atlas-chat-thread-select', attr: { 'aria-label': '选择对话' } });
      for (const t of client.threads) {
        const opt = this._threadSelect.createEl('option', { text: t.title || t.id, attr: { value: t.id } });
        if (t.id === this._threadId) opt.selected = true;
      }
      this._threadSelect.addEventListener('change', async () => {
        this._threadId = this._threadSelect.value;
        this._messages = [];
        this._messagesKey = null;
        await this._loadMessages();
      });
    } else {
      const title = client.threads.length === 1 ? `💬 ${client.threads[0].title || '对话'}` : '💬 猫咖对话流';
      header.createEl('span', { text: title, cls: 'atlas-chat-thread-name', attr: { title } });
    }

    // ＋ opens a conversation of its own (see startNewConversation); an attached passage goes along
    const newBtn = header.createEl('button', {
      text: '＋',
      cls: 'atlas-chat-new-btn',
      attr: { title: '新开对话：在猫咖里新建一个对话，附着的选段会跟过去', 'aria-label': '新开对话' },
    });
    newBtn.addEventListener('click', () => this.plugin.startNewConversation());

    const hubBtn = header.createEl('button', {
      text: '↗ Hub',
      cls: 'atlas-chat-hub-btn',
      attr: { title: '在浏览器中打开此对话' }
    });
    hubBtn.addEventListener('click', () => {
      if (this._threadId) {
        // Same page route the Hub web app links to: /thread/<id> (singular). /threads/<id> is a 404.
        window.open(`${client.getHubUrl()}/thread/${encodeURIComponent(this._threadId)}`);
      } else {
        window.open(client.getHubUrl());
      }
    });

    const cfgBtn = header.createEl('button', {
      text: '⚙',
      cls: 'atlas-chat-config-btn',
      attr: { title: '猫咖连接与设置', 'aria-label': '猫咖连接与设置', 'aria-controls': 'atlas-chat-config', 'aria-expanded': String(Boolean(this._config && !this._config.hidden)) },
    });
    cfgBtn.addEventListener('click', () => this._toggleConfig());
  }

  _toggleConfig(open = this._config.hidden) {
    this._config.hidden = !open;
    this._header.querySelector('.atlas-chat-config-btn')?.setAttribute('aria-expanded', String(open));
    if (open) this._renderConfig();
  }

  /** In-panel connection settings (status · refresh · address · disconnect), so nobody has to dig through Obsidian's settings. */
  _renderConfig() {
    const box = this._config;
    const plugin = this.plugin;
    box.empty();
    this._configStatus = box.createEl('p', { cls: 'atlas-chat-config-status' });
    this._renderConfigStatus();
    const actions = box.createDiv('atlas-chat-config-row');
    const refreshBtn = actions.createEl('button', { text: '↻ 刷新伙伴与对话', cls: 'atlas-chat-config-action' });
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      const r = await plugin.refreshCafe();  // panels, and this box, refresh in place
      new obsidian.Notice(r.ok ? `↻ 已刷新：${r.cats} 只伙伴 · ${r.threads} 条对话` : `⚠️ 刷新失败：${r.error || '无法连接猫咖'}`);
      if (refreshBtn.isConnected) refreshBtn.disabled = false;
    });
    const offBtn = actions.createEl('button', { text: '断开连接', cls: 'atlas-chat-config-action' });
    offBtn.addEventListener('click', async () => {
      plugin.settings.catCafeEnabled = false;
      await plugin.saveSettings();
      await plugin._disconnectCafe();  // every panel rebuilds into its offline state
    });
    this._renderAddressForm(box);
  }

  /** The status line alone: what a roster refresh updates, leaving an address being typed untouched. */
  _renderConfigStatus() {
    if (!this._configStatus?.isConnected) return;
    const plugin = this.plugin;
    const client = plugin.cafeClient;
    this._configStatus.setText(plugin.isCafeConnected
      ? `✅ 已连接 · ${plugin.settings.catCafeAddress} · ${client.cats.length} 只伙伴 · ${client.threads.length} 条对话`
      : `❌ 未连接：${client?.lastError || '连接失败'}`);
  }

  /** Address field + 保存并连接 (also in the offline panel), plus the way to the rest of the plugin settings. */
  _renderAddressForm(parent) {
    const plugin = this.plugin;
    parent.createEl('label', { text: '猫咖地址', cls: 'atlas-chat-config-label', attr: { for: 'atlas-chat-config-address' } });
    const row = parent.createDiv('atlas-chat-config-row');
    const input = row.createEl('input', {
      cls: 'atlas-chat-config-input',
      attr: { id: 'atlas-chat-config-address', type: 'text', value: plugin.settings.catCafeAddress || '', placeholder: 'http://localhost:3004', spellcheck: 'false' },
    });
    const go = row.createEl('button', { text: '保存并连接', cls: 'atlas-chat-config-action' });
    const connect = async () => {
      const address = input.value.trim().replace(/\/+$/, '');
      if (!address) return;
      go.disabled = true;
      plugin.settings.catCafeAddress = address;
      plugin.settings.catCafeEnabled = true;
      await plugin.saveSettings();
      await plugin._initCafeConnection();  // panels rebuild; a failure shows in the offline panel
    };
    go.addEventListener('click', connect);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        connect();
      }
    });
    const more = parent.createEl('button', { text: '更多插件设置…', cls: 'atlas-chat-config-action is-link' });
    more.addEventListener('click', () => {
      this.app.setting?.open();
      this.app.setting?.openTabById('clowder-atlas');
    });
  }

  /** An address typed but not saved yet, with its selection and focus (null when the field shows the saved one). */
  _takeAddressDraft() {
    const input = this.containerEl.querySelector('.atlas-chat-config-input');
    if (!input || input.closest('.atlas-chat-config')?.hidden) return null;  // a closed form means the edit was let go
    if (input.value === (this.plugin.settings.catCafeAddress || '')) return null;
    return { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input };
  }

  _putAddressDraft(draft) {
    const input = this.containerEl.querySelector('.atlas-chat-config-input');
    if (!input) return;
    input.value = draft.value;
    input.setSelectionRange(draft.start, draft.end);
    if (draft.focused) input.focus();
  }

  async _sendMessage() {
    if (this._sending) return;
    const content = this._input.value.trim();
    const passages = this.plugin.chatPassages;
    const passage = passages.length ? passages : null;
    // a passage may go without words: the cats are then asked what they make of it
    if ((!content && !passage) || !this.plugin.isCafeConnected) return;
    // Where this message goes is fixed when 发送 is pressed, before anything is awaited: this cafe, this thread.
    const client = this.plugin.cafeClient;
    const cafe = client.baseUrl;
    const threadId = this._threadId ?? null;

    const request = passage ? passageMessage(passage, content) : content;
    let fullContent = request;
    if (this._attachNote && !passage) {  // a passage goes alone — never with the whole note, whatever 📎 was left at
      const file = this.app.workspace.getActiveFile();
      if (file) {
        const noteContent = await this.app.vault.read(file);
        const preview = noteContent.substring(0, 1000);
        fullContent = `[关于笔记「${file.basename}」]\n\n${preview}${noteContent.length > 1000 ? '\n...(truncated)' : ''}\n\n---\n${request}`;
      }
    }

    // If user didn't write an explicit @handle and has summoned companion cats, append their @mentions on standalone lines so they respond!
    if (!/@\S+/.test(content)) {
      const summoned = this.plugin.getSummonedCats();
      if (summoned.length > 0) {
        const mentions = summoned.map(c => {
          const p = SpecParser.resolveCatProfile(c);
          return p?.mention || `@${c.nickname || c.name || c.id}`;
        });
        fullContent += '\n\n' + mentions.join('\n');
      }
    }

    if (fullContent.length > 100000) {
      new obsidian.Notice('⚠️ 选段、提问与来源标签合计超过猫咖一条消息上限，请减少部分选段或提问');
      return;
    }
    this._sending = true;
    this._input.value = '';
    this._input.focus();

    // Optimistic local render
    const sentAt = Date.now();
    const id = `send-${sentAt}-${Math.random().toString(36).slice(2, 6)}`;
    this._appendMessage({ id, type: 'user', content: passage ? passageShown(passage, content) : content, from: { kind: 'user' }, lifecycle: { startedAt: sentAt }, _pending: true });
    // A passage request gets its own identity; once the cafe has stored this message, its id is bound to the request,
    // so a 修改稿 answering it (and only such a reply) can replace this passage.
    const revisionId = passage ? `rq-${sentAt}-${Math.random().toString(36).slice(2, 6)}` : null;
    try {
      if (revisionId) await this.plugin.rememberPassageRequest(revisionId, cafe, threadId, passages);
      // the connection changed while the note was being read: never send to whatever is connected now
      if (this.plugin.cafeClient !== client) throw new Error('发送前猫咖连接已切换');
      const body = { content: fullContent };
      if (threadId) body.threadId = threadId;

      const resp = await client._fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      console.log('Clowder Atlas: Message sent, queued to', resp.entries?.map(e => e.targetCatId).join(', '));
      if (revisionId) await this.plugin.bindRevisionMessage(revisionId, resp?.userMessageId);
      if (passage) await this.plugin.consumeChatPassages(passages);
      this._pollSoon();  // the message, and soon the cats' replies, are read back from the cafe
    } catch (err) {
      // It did not land. It is kept — the text as typed, what was sent, its thread and the reason — as a failed message
      // in that conversation, to resend, put back into the draft box (after a newer draft, never over it) or delete.
      // The record lives with the plugin and in its data, not in this panel's input or layout, so going offline,
      // reconnecting or restarting Obsidian does not lose it.
      const reason = err.message || '未知错误';
      new obsidian.Notice(`⚠️ 消息发送失败：${reason}。已留在对话里，可以重发或放回输入框`);
      await this.plugin.recordFailedSend({ id, cafe, threadId, content, fullContent, ...(passage ? { passage: passages[0], passages, revisionId } : {}), error: reason, at: sentAt });
      if (passage) await this.plugin.consumeChatPassages(passages);
    } finally {
      this._sending = false;
    }
  }

  /**
   * Failed sends that belong on screen here: this thread's, plus those with no thread here to go to (sent to the default
   * lobby, to a thread since deleted, or to another cafe — or from before sources were kept), so a failed text is never
   * out of sight.
   */
  _failedHere() {
    const client = this.plugin.cafeClient;
    const ids = new Set((client?.threads || []).map((t) => t.id));
    const here = this._threadId ?? null;
    return this.plugin.getFailedSends().filter((r) => r.cafe !== client?.baseUrl
      || (r.threadId ?? null) === here || !ids.has(r.threadId));
  }

  /** Where a failed send stands from here: null (this thread), 'lobby', 'gone' (thread deleted) or 'elsewhere' (other cafe or unknown). */
  _failedMessage(record) {
    const sameCafe = Boolean(record.cafe) && record.cafe === this.plugin.cafeClient?.baseUrl;
    const where = !sameCafe ? 'elsewhere'
      : (record.threadId ?? null) === (this._threadId ?? null) ? null : record.threadId ? 'gone' : 'lobby';
    const attached = normalizePassages(record.passages || record.passage);
    const shown = attached.length ? passageShown(attached, record.content) : record.content;
    return { id: record.id, type: 'user', content: shown, from: { kind: 'user' }, lifecycle: { startedAt: record.at }, _failed: { record, where } };
  }

  /**
   * Marks a failed send and gives it its ways back: 重发 (same text, same cafe, same thread or its lobby), 放回输入框, 删除.
   * While a resend is on its way every button waits, however often the messages are redrawn meanwhile.
   */
  _renderFailedParts(bubble, footerRow, { record, where }) {
    bubble.addClass('is-failed');
    const busy = this.plugin.isResending(record.id);
    const place = where === 'elsewhere' ? (record.cafe ? `（原本发往另一个猫咖：${record.cafe}）` : '（来源猫咖未记录）')
      : where === 'gone' ? '（原对话已不在猫咖里）' : where === 'lobby' ? '（发往猫咖默认大厅）' : '';
    footerRow.createEl('span', { text: busy ? '↻ 正在重发…' : `⚠️ 发送失败${place}：${record.error}`, cls: 'atlas-chat-failed-note' });
    const row = bubble.createDiv('atlas-chat-msg-actions');
    if (where === null || where === 'lobby') {  // never retargeted: no 重发 to a deleted thread or another cafe
      const retry = row.createEl('button', { text: busy ? '重发中…' : '↻ 重发', cls: 'atlas-chat-action-pill', attr: { title: '把原来的内容再发一次，发往原来的猫咖和对话' } });
      retry.disabled = busy;
      retry.addEventListener('click', () => this._resendFailed(record));
    }
    const back = row.createEl('button', { text: '↩ 放回输入框', cls: 'atlas-chat-action-pill', attr: { title: '放回输入框；已经写了新内容的话，接在后面' } });
    back.disabled = busy;
    back.addEventListener('click', () => this._putBackFailed(record));
    const drop = row.createEl('button', { text: '删除', cls: 'atlas-chat-action-pill' });
    drop.disabled = busy;
    drop.addEventListener('click', () => this.plugin.dropFailedSend(record.id));
  }

  /** Back into the draft box, after whatever is being written there (never over it); the failed message then goes. */
  async _putBackFailed(record) {
    if (!this._input) return;
    const passages = normalizePassages(record.passages || record.passage);
    if (passages.length) {
      const attached = this.plugin.chatPassages;
      if (attached.length && (attached.length !== passages.length || attached.some((p, i) => !samePassage(p, passages[i])))) {
        new obsidian.Notice('💡 输入框上已经附着另一段选段：先发送或去掉它，再放回这条');
        return;
      }
      await this.plugin.setChatPassages(passages);
    }
    if (record.content) {
      const draft = this._input.value.replace(/\s+$/, '');
      this._input.value = draft ? `${draft}\n\n${record.content}` : record.content;
    }
    this._input.focus();
    this._input.setSelectionRange(this._input.value.length, this._input.value.length);
    await this.plugin.dropFailedSend(record.id);
  }

  /**
   * Sends exactly what failed (with the note and @ it carried) to the cafe and thread it was meant for, one try at a
   * time. A record from another cafe, or without a source, is never sent to the cafe connected now.
   */
  async _resendFailed(record) {
    const plugin = this.plugin;
    const client = plugin.cafeClient;
    if (!client || !plugin.isCafeConnected || !record.cafe || record.cafe !== client.baseUrl) return;
    if (!plugin.beginResend(record.id)) return;  // already on its way (its button may have been redrawn meanwhile)
    try {
      const body = { content: record.fullContent || record.content };
      if (record.threadId) body.threadId = record.threadId;
      const resp = await client._fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (record.revisionId) await plugin.bindRevisionMessage(record.revisionId, resp?.userMessageId);  // it is the same request, sent again
      plugin.endResend(record.id);
      await plugin.dropFailedSend(record.id);
      new obsidian.Notice('↻ 已重发');
      if ((record.threadId ?? null) === (this._threadId ?? null)) { this._loadMessages(); this._pollSoon(); }
    } catch (err) {
      plugin.endResend(record.id);
      const reason = err.message || '未知错误';
      new obsidian.Notice(`⚠️ 重发失败：${reason}`);
      // still kept, with the new reason — unless it was deleted meanwhile
      if (plugin.getFailedSends().some((r) => r.id === record.id)) await plugin.recordFailedSend({ ...record, error: reason });
      else plugin._renderChatMessages();
    }
  }

  /** A message read may land only while its thread is still the one on screen, on the same connection. */
  _isCurrent(threadId, client) {
    return threadId === this._threadId && client === this.plugin.cafeClient;
  }

  async _loadMessages() {
    const threadId = this._threadId, client = this.plugin.cafeClient;
    if (!threadId || !this.plugin.isCafeConnected) {
      if (!threadId) {  // no thread to read from: what is held locally (failed sends) still shows
        this._messages = [];
        this._renderMessages();
      }
      return;
    }
    try {
      const data = await client._fetch(
        `/api/messages?threadId=${encodeURIComponent(threadId)}&limit=30&order=asc`
      );
      if (!this._isCurrent(threadId, client)) return;  // switched, cleared or disconnected meanwhile
      this._messages = (data && data.messages) || [];
      this._renderMessages();
    } catch (err) {
      console.warn('Clowder Atlas: Failed to load messages:', err.message);
    }
  }

  _renderMessages() {
    if (!this._messageArea) return;
    this._messagesKey = messagesKey(this._messages);
    const keep = this._autoScroll ? null : this._messageArea.scrollTop;  // read further up: stay there
    this._messageArea.empty();

    const failed = this._failedHere();
    if (this._messages.length === 0 && failed.length === 0) {
      this._messageArea.createDiv({
        text: this._threadId
          ? '暂无消息 — 召唤猫猫伴读或发起研讨会，讨论结论可存为待结晶笔记 💎'
          : '这个库在猫咖里还没有对话 — 发出的消息会进入猫咖的默认大厅',
        cls: 'atlas-chat-empty'
      });
      return;
    }

    const client = this.plugin.cafeClient;
    for (const msg of this._messages) {
      this._renderOneMessage(msg, client);
    }
    for (const record of failed) {
      this._renderOneMessage(this._failedMessage(record), client);
    }

    this._messageArea.scrollTop = keep ?? this._messageArea.scrollHeight;
  }

  _renderOneMessage(msg, client) {
    const isUser = msg.type === 'user';
    const bubble = this._messageArea.createDiv(`atlas-chat-bubble ${isUser ? 'is-user' : 'is-cat'}`);

    let catData = null;
    if (!isUser) {
      const catId = msg.catId || msg.from?.catId || '';
      catData = client?.cats?.find(c => c.id === catId);
      const profile = SpecParser.resolveCatProfile(catData || catId);
      const headerRow = bubble.createDiv('atlas-chat-cat-header');
      renderCatAvatar3D(headerRow, catData || { color: { primary: profile?.color || '#C87D55' } }, client, 'chat');
      const name = catData?.nickname || profile?.nickname || catData?.displayName || catData?.name || catId || '猫猫';
      headerRow.createEl('span', { text: name, cls: 'atlas-chat-cat-name' });
      if (profile?.breed) {
        headerRow.createEl('span', { text: profile.breed, cls: 'atlas-chat-cat-breed' });
      }
    }

    // A cat's reply: processing while it is being written (its words so far), then completed — or failed, canceled,
    // interrupted, when it ended short of that
    const state = msg.lifecycle?.kind === 'response' ? msg.lifecycle.status : null;
    const writing = state === 'processing';
    const content = msg.content || '';
    const isLong = content.length > 600;
    let expanded = isLong && this._expanded.has(msg.id);
    const textEl = bubble.createDiv('atlas-chat-text');
    if (writing && !content) {
      textEl.textContent = '正在回复…';
      textEl.addClass('is-writing');
    } else {
      textEl.textContent = isLong && !expanded ? content.substring(0, 600) + '…' : content;
    }

    if (isLong) {
      const toggleBtn = bubble.createEl('button', {
        text: expanded ? '🔼 收起全文' : `📖 展开全文 (${content.length} 字)`,
        cls: 'atlas-chat-expand-btn'
      });
      toggleBtn.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) this._expanded.add(msg.id); else this._expanded.delete(msg.id);
        textEl.textContent = expanded ? content : content.substring(0, 600) + '…';
        toggleBtn.textContent = expanded ? '🔼 收起全文' : `📖 展开全文 (${content.length} 字)`;
      });
    }

    // Footer row: timestamp + Knowledge Crystallization actions (for cat replies)
    const footerRow = bubble.createDiv('atlas-chat-bubble-footer');
    const ts = msg.lifecycle?.startedAt || msg.lifecycle?.completedAt;
    if (ts) {
      const timeStr = new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      footerRow.createEl('span', { text: timeStr, cls: 'atlas-chat-time' });
    }

    if (msg._pending) {
      footerRow.createEl('span', { text: '发送中…', cls: 'atlas-chat-pending' });
    }
    if (writing) footerRow.createEl('span', { text: '回复中…', cls: 'atlas-chat-pending' });
    const ended = { failed: '回复失败', canceled: '回复已取消', interrupted: '回复中断' }[state];
    if (ended) footerRow.createEl('span', { text: `⚠️ ${ended}`, cls: 'atlas-chat-pending' });
    if (msg._failed) this._renderFailedParts(bubble, footerRow, msg._failed);

    // Bring cat insights back into Obsidian: save as a pending note (crystallized after review) or append — once the
    // reply is no longer being written, so what is kept is what the cat said, not a part of it.
    if (!isUser && !writing && content.trim().length > 0) {
      const actRow = bubble.createDiv('atlas-chat-msg-actions');
      const saveBtn = actRow.createEl('button', {
        text: '💎 存为待结晶笔记',
        cls: 'atlas-chat-action-pill',
        attr: { title: '存进待结晶目录并关联这次请求的源笔记；审阅后在透镜里点亮结晶' }
      });
      const sourceThreadId = this._threadId;
      saveBtn.addEventListener('click', () => {
        this.plugin.saveMessageAsPendingNote(msg, catData, sourceThreadId, client.baseUrl);
      });

      const appBtn = actRow.createEl('button', {
        text: '📥 摘录到当前笔记',
        cls: 'atlas-chat-action-pill',
        attr: { title: '将这条猫猫回复作为引用块追加到当前打开的笔记末尾' }
      });
      appBtn.addEventListener('click', () => {
        this.plugin.appendMessageToActiveNote(msg, catData);
      });
      this._renderRevisionActions(actRow, msg, content);
    }
  }

  /**
   * A cat's 修改稿 can replace the passage of the request it answers — found through the messages the reply names, never
   * by when it arrived — after a side-by-side check; or be copied. The version now in the note shows as 已采用, and
   * another cat's version for the same request can still be put in its place. An unmatched reply is copy-only.
   */
  _renderRevisionActions(row, msg, content) {
    const revised = extractRevision(content);
    if (revised === null) return;
    const { target, reason } = this.plugin.revisionTargetForReply(this.plugin.cafeClient?.baseUrl, msg, this._threadId);
    if (target) {
      const inUse = target.original === revised;
      const apply = row.createEl('button', {
        text: inUse ? '✓ 已采用' : '✏️ 替换原段落',
        cls: 'atlas-chat-action-pill',
        attr: { title: inUse ? '笔记里现在就是这一版' : `先对照原文，再替换《${target.path.split('/').pop().replace(/\.md$/, '')}》${passageLines(target)}` },
      });
      apply.disabled = inUse;
      apply.addEventListener('click', () => new RevisionModal(this.app, this.plugin, target.id, revised).open());
    }
    const copy = row.createEl('button', {
      text: '📋 复制修改稿',
      cls: 'atlas-chat-action-pill',
      attr: target ? {} : { title: reason === 'multi' ? '这是多段选段交叉引用的综合稿，请复制后按需粘贴' : reason === 'several'
        ? '这条回复同时回答了几次选段请求，分不清改的是哪一段：可以复制后自己粘贴'
        : '分不清这份修改稿对应哪一段选段：可以复制后自己粘贴' },
    });
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(revised);
      new obsidian.Notice('📋 修改稿已复制');
    });
  }

  _appendMessage(msg) {
    if (!this._messageArea) return;
    const empty = this._messageArea.querySelector('.atlas-chat-empty');
    if (empty) empty.remove();

    const client = this.plugin.cafeClient;
    this._renderOneMessage(msg, client);
    this._messageArea.scrollTop = this._messageArea.scrollHeight;
  }

  /**
   * The conversation on screen is read again every 5 s, and every 1.5 s while a cat's reply is being written in it (see
   * messagesKey) or right after a message was sent (_pollSoon). One chain of reads at a time: starting again, or
   * stopping, ends the chain that was running, also when its read is still on its way.
   */
  _startPolling(firstIn = 5000) {
    this._stopPolling();
    const run = this._pollRun = {};
    const next = async () => {
      await this._pollNewMessages();
      if (this._pollRun !== run) return;
      this._pollTimer = setTimeout(next, this._replying() ? 1500 : 5000);
    };
    this._pollTimer = setTimeout(next, firstIn);
  }

  _stopPolling() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    this._pollRun = null;
  }

  /** A message was just sent (or the conversation changed): read again shortly, if reading is on. */
  _pollSoon() {
    if (this._pollRun) this._startPolling(1500);
  }

  /** A cat's reply is being written in the conversation on screen. */
  _replying() {
    return this._messages.some((m) => m.lifecycle?.kind === 'response' && m.lifecycle.status === 'processing');
  }

  async _pollNewMessages() {
    const threadId = this._threadId, client = this.plugin.cafeClient;
    if (!threadId || !this.plugin.isCafeConnected) return;
    try {
      const data = await client._fetch(
        `/api/messages?threadId=${encodeURIComponent(threadId)}&limit=30&order=asc`
      );
      if (!this._isCurrent(threadId, client)) return;
      const newMessages = (data && data.messages) || [];
      if (messagesKey(newMessages) !== this._messagesKey) {  // new messages, or a reply's words or state changed
        this._messages = newMessages;
        this._renderMessages();
      }
    } catch (err) {
      // Silent fail on poll
    }
  }
}

// ═══════════════════════════════════════════════
// Revision Modal — a cat's 修改稿 next to the passage, then replace it in the note
// ═══════════════════════════════════════════════
class RevisionModal extends obsidian.Modal {
  /** `requestId`: the passage request this 修改稿 answers; it is read afresh when the check opens and again on 替换. */
  constructor(app, plugin, requestId, revised) {
    super(app);
    this.plugin = plugin;
    this.requestId = requestId;
    this.revised = revised;
  }

  async onOpen() {
    const { contentEl } = this;
    const t = this.plugin.getRevisionTargetById(this.requestId);
    contentEl.empty();
    contentEl.addClass('atlas-revision-modal');
    const name = t ? t.path.split('/').pop().replace(/\.md$/, '') : '';
    contentEl.createEl('h3', { text: t ? `✏️ 替换《${name}》${passageLines(t)}` : '✏️ 替换原段落' });
    const file = t ? this.app.vault.getAbstractFileByPath(t.path) : null;
    const found = !t ? { offset: -1, reason: '这份修改稿对应的选段记录已不存在' }
      : file instanceof obsidian.TFile ? locatePassage(await this.plugin._currentText(file), t)
      : { offset: -1, reason: `找不到笔记「${t.path}」` };
    if (found.offset < 0) contentEl.createEl('p', { text: `⚠️ ${found.reason}。可以复制修改稿，自己粘贴到合适的位置。`, cls: 'atlas-revision-problem' });
    if (t) {
      contentEl.createDiv({ text: '原文', cls: 'atlas-revision-label' });
      contentEl.createEl('pre', { text: t.original, cls: 'atlas-revision-text' });
    }
    contentEl.createDiv({ text: '修改稿', cls: 'atlas-revision-label' });
    contentEl.createEl('pre', { text: this.revised, cls: 'atlas-revision-text is-revised' });
    const row = contentEl.createDiv('atlas-revision-actions');
    const replace = row.createEl('button', { text: '替换', cls: 'mod-cta' });
    replace.disabled = found.offset < 0;
    replace.addEventListener('click', async () => {
      replace.disabled = true;
      const result = await this.plugin.applyRevision({ id: this.requestId }, this.revised);
      if (!result.ok) {
        new obsidian.Notice(`⚠️ 没有替换：${result.reason}`);
        replace.disabled = false;
        return;
      }
      new obsidian.Notice(`✏️ 已替换《${name}》里的这段，Cmd+Z 可以撤销`);
      this.close();
      this.plugin._renderChatMessages();
    });
    const copy = row.createEl('button', { text: '复制修改稿' });
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.revised);
      new obsidian.Notice('📋 修改稿已复制');
    });
    const cancel = row.createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════
// Seminar Modal — organize multi-cat discussions
// ═══════════════════════════════════════════════
class SeminarModal extends obsidian.Modal {
  constructor(app, plugin, optionsOrSet) {
    super(app);
    this.plugin = plugin;
    const isSet = optionsOrSet instanceof Set;
    const opts = isSet ? { preSummoned: optionsOrSet } : (optionsOrSet || {});
    const initialIds = opts.preSummoned
      ? [...opts.preSummoned]
      : [...this.plugin.summonedCatIds];

    // If no cats are currently summoned, pre-select first 3 online cats so user can start in 1 click
    if (initialIds.length === 0 && this.plugin.cafeClient?.cats?.length) {
      initialIds.push(...this.plugin.cafeClient.cats.slice(0, 3).map(c => c.id));
    }

    this._selected = new Set(initialIds);
    this._targetFile = opts.file || this.app.workspace.getActiveFile();
    this._attachNote = opts.attachNote !== undefined ? Boolean(opts.attachNote) : Boolean(this._targetFile);
    this._defaultTopic = opts.defaultTopic || '';
    this._passages = normalizePassages(opts.passages ?? opts.passage ?? this.plugin.chatPassages);
    this._passage = this._passages[0] || null;
    this._attachPassage = this._passages.length > 0;
    if (this._attachPassage && opts.attachNote === undefined) this._attachNote = false;
    // The dialog belongs to the connection it was opened on: it lists that cafe's conversations and starts seminars
    // there only; once the plugin is connected otherwise it is void (see _start, _open). So a dialog opens at most one.
    this._client = this.plugin.cafeClient;
    this._where = 'new';     // 'new': a conversation of its own; 'existing': the one picked in 3. 在哪开会
    this._opening = null;    // { key, thread }: the conversation this dialog opens; every attempt reuses both (see _open)
    this._busy = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('atlas-seminar-modal');

    // Title
    contentEl.createEl('h2', { text: '🎓 组织猫猫研讨会' });
    contentEl.createEl('p', {
      text: '勾选参会猫猫并设定议题，猫猫们会在右侧对话流展开多视角碰撞，结论可存为待结晶笔记，审过再点亮。',
      cls: 'atlas-seminar-desc',
    });

    // Cat selector
    const client = this.plugin.cafeClient;
    const cats = client?.cats || [];

    contentEl.createEl('label', { text: '1. 参会猫猫（将同步设为你的伴读宠物）', cls: 'atlas-seminar-label' });
    const catGrid = contentEl.createDiv('atlas-seminar-cats');

    for (const cat of cats) {
      this._renderCatOption(catGrid, cat, client);
    }

    // Topic presets + input
    contentEl.createEl('label', { text: '2. 研讨议题（可点选预设模板）', cls: 'atlas-seminar-label' });
    const presetRow = contentEl.createDiv('atlas-seminar-presets');
    const noteTitle = this._targetFile ? `《${this._targetFile.basename}》` : '当前议题';
    const passage = this._passage;
    const passageTitle = passage ? `《${passage.basename}》${passageLines(passage)}这段` : '';
    (this._passages.length > 1 ? [
      { label: '🔗 交叉比对异同', text: '请交叉比对以上选段的核心概念、共识和关键分歧，标明 [#序号] 与源笔记双链。' },
      { label: '🧭 证据链与因果推演', text: '请串联这些选段的证据链，区分事实与推论，指出逻辑断层和待补反例。' },
      { label: '✨ 综合提炼结晶卡', text: '请综合这些选段提炼知识卡片，包含核心命题、跨篇源文对照与待验证问题。' },
      { label: '⚔️ 正反交锋辩论', text: '请从不同视角辨析这些选段的论据、隐含前提与适用边界，引用时标明 [#序号]。' },
    ] : passage ? [
      { label: '🔍 审阅这段', text: `请从各自专长审阅${passageTitle}：论证是否成立、表达是否清楚、还能补充什么。` },
      { label: '✏️ 各改一版', text: `请每只猫各自给出${passageTitle}的修改稿，并说明改了什么、为什么。` },
      { label: '⚡ 正反辩论', text: `请围绕${passageTitle}的核心说法展开正反辩论：它在什么情况下成立，什么情况下会失效？` },
    ] : [
      {
        label: '🔍 审阅笔记盲区',
        text: `请从各自专长审阅${noteTitle}的核心论点、潜在盲区与可补充的关联知识，并给出具体改进建议。`,
      },
      {
        label: '⚡ 多视角正反辩论',
        text: `请围绕${noteTitle}中的核心机制展开多视角碰撞：它最大的优势是什么？在极端场景下有哪些失效风险？`,
      },
      {
        label: '✨ 提炼结晶要点',
        text: `请帮我将${noteTitle}提炼为高密度的 Atlas 知识结晶卡片（包含 TL;DR、核心机制对比、对我们的启发）。`,
      },
    ]).forEach((p) => {
      const pBtn = presetRow.createEl('button', {
        text: p.label,
        cls: 'atlas-seminar-preset-pill',
      });
      pBtn.addEventListener('click', () => {
        this._topicInput.value = p.text;
        this._topicInput.focus();
      });
    });

    this._topicInput = contentEl.createEl('textarea', {
      cls: 'atlas-seminar-topic',
      attr: {
        placeholder: '想让猫猫们讨论什么？点击上方预设胶囊可一键填入议题…',
        rows: '4',
      },
    });
    if (this._defaultTopic) {
      this._topicInput.value = this._defaultTopic;
    } else if (this._passages.length > 1) {
      this._topicInput.value = `请围绕这 ${passagesLabel(this._passages)} 交叉研讨：核心共识、分歧与可提炼的结论是什么？引用时标明 [#序号] 与源笔记双链。`;
    } else if (passage) {
      this._topicInput.value = `请从各自专长审阅${passageTitle}：论证是否成立、表达是否清楚、还能补充什么。`;
    } else if (this._targetFile) {
      this._topicInput.value = `请从各自专长审阅《${this._targetFile.basename}》的核心论点、潜在盲区与可补充的关联知识，并给出具体建议。`;
    }

    // Passage attachment (from the chat panel's 选段): this part of the note
    if (passage) {
      const row = contentEl.createDiv('atlas-seminar-attach');
      const where = this._passages.length > 1 ? passagesLabel(this._passages) : `《${passage.basename}》${passageLines(passage)}`;
      const label = () => this._passages.length > 1
        ? `📌 ${this._attachPassage ? '✓ 已附带' : '附带'} ${where}`
        : (this._attachPassage ? `📌 ✓ 已附带选段：${where}（${passage.text.length} 字）` : `📌 附带选段：${where}`);
      const btn = row.createEl('button', { text: label(), cls: `atlas-btn atlas-seminar-attach-btn ${this._attachPassage ? 'is-active' : ''}` });
      const details = this._passages.length > 1 ? row.createDiv('atlas-seminar-passage-list') : null;
      if (details) this._passages.forEach((p, i) => details.createSpan({ text: `#${i + 1} 《${p.basename}》${passageLines(p)}`, cls: 'atlas-seminar-passage-chip', attr: { title: `${p.path}\n${p.text.slice(0, 400)}` } }));
      btn.addEventListener('click', () => {
        this._attachPassage = !this._attachPassage;
        btn.toggleClass('is-active', this._attachPassage);
        btn.textContent = label();
        if (details) details.hidden = !this._attachPassage;
        if (this._noteAttachRow) this._noteAttachRow.style.display = this._attachPassage ? 'none' : '';
      });
    }

    // Note attachment — stepping aside while a passage is attached: one or the other goes, never both
    if (this._targetFile) {
      const attachRow = contentEl.createDiv('atlas-seminar-attach');
      this._noteAttachRow = attachRow;
      if (passage && this._attachPassage) attachRow.style.display = 'none';
      const attachBtn = attachRow.createEl('button', {
        text: this._attachNote
          ? `📎 ✓ 已附带笔记「${this._targetFile.basename}」作为研讨材料`
          : `📎 附带笔记「${this._targetFile.basename}」`,
        cls: `atlas-btn atlas-seminar-attach-btn ${this._attachNote ? 'is-active' : ''}`,
      });
      attachBtn.addEventListener('click', () => {
        this._attachNote = !this._attachNote;
        attachBtn.toggleClass('is-active', this._attachNote);
        attachBtn.textContent = this._attachNote
          ? `📎 ✓ 已附带笔记「${this._targetFile.basename}」作为研讨材料`
          : `📎 附带笔记「${this._targetFile.basename}」`;
      });
    }

    this._renderWhere(contentEl);

    // Start button + hint
    const startRow = contentEl.createDiv('atlas-seminar-start-row');
    const startBtn = this._startBtn = startRow.createEl('button', {
      text: '🐾 立即开会 · 打开右侧研讨流',
      cls: 'atlas-btn atlas-btn-primary atlas-seminar-start',
    });
    startBtn.addEventListener('click', () => this._start());

    this._hintEl = startRow.createDiv('atlas-seminar-hint');
    this._updateHint();
  }

  /**
   * 3. 在哪开会: a conversation of its own (the default), or one the vault already has in the dialog's cafe — the one the
   * chat panel shows, unless another is picked. While the vault has no conversation there, only a new one can be chosen.
   */
  _renderWhere(box) {
    const threads = this._client?.threads || [];
    box.createEl('label', { text: '3. 在哪开会', cls: 'atlas-seminar-label' });
    const row = box.createDiv({ cls: 'atlas-seminar-where', attr: { role: 'group', 'aria-label': '在哪开会' } });
    this._whereBtns = [['new', '🆕 新开对话'], ['existing', '💬 用现有对话']].map(([where, text]) => {
      const b = row.createEl('button', { text, cls: 'atlas-btn atlas-seminar-where-btn', attr: { 'data-where': where } });
      b.addEventListener('click', () => { this._where = where; this._syncWhere(); });
      return b;
    });
    if (!threads.length) {
      this._whereBtns[1].disabled = true;
      this._whereBtns[1].title = '这个库在猫咖里还没有对话';
    }
    this._threadSelect = box.createEl('select', { cls: 'dropdown atlas-seminar-thread-select', attr: { 'aria-label': '选择现有对话' } });
    for (const t of threads) this._threadSelect.createEl('option', { text: t.title || t.id, attr: { value: t.id } });
    const shown = this.plugin.currentChatThreadId();
    this._threadSelect.value = threads.some((t) => t.id === shown) ? shown : (threads[0]?.id ?? '');
    this._whereHint = box.createDiv('atlas-seminar-where-hint');
    this._syncWhere();
  }

  _syncWhere() {
    for (const b of this._whereBtns) {
      const on = b.dataset.where === this._where;
      b.toggleClass('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this._threadSelect.style.display = this._where === 'existing' ? '' : 'none';
    const opened = this._opening?.thread;
    this._whereHint.textContent = this._where === 'existing'
      ? '发到选中的对话里，默认是右侧对话栏正在看的那个。'
      : opened
        ? `新对话「${opened.title}」已经建好，再点开会会发到这里。`
        : '新建一个对话来开会，先叫「🎓 研讨会 · …」；第一只发言的猫猫会按讨论内容给它起名。';
  }

  _renderCatOption(grid, cat, client) {
    const profile = SpecParser.resolveCatProfile(cat);
    const item = grid.createDiv('atlas-seminar-cat');
    item.dataset.catId = cat.id;
    if (this._selected.has(cat.id)) item.addClass('is-selected');

    renderCatAvatar3D(item, cat, client, 'seminar');

    const name = cat.nickname || profile?.nickname || cat.displayName || cat.name || cat.id;
    item.createEl('span', { text: name, cls: 'atlas-seminar-cat-name' });
    if (profile?.breed) {
      item.createEl('span', { text: profile.breed, cls: 'atlas-seminar-cat-breed' });
    }

    const check = item.createDiv('atlas-seminar-check');
    check.textContent = '✓';

    item.addEventListener('click', () => {
      if (this._selected.has(cat.id)) {
        this._selected.delete(cat.id);
        item.removeClass('is-selected');
      } else {
        this._selected.add(cat.id);
        item.addClass('is-selected');
      }
      this._updateHint();
    });
  }

  _updateHint() {
    if (!this._hintEl) return;
    const n = this._selected.size;
    if (n === 0) {
      this._hintEl.textContent = '至少选择一只猫猫~';
    } else if (n === 1) {
      this._hintEl.textContent = '1 只猫猫就绪 — 多选几只碰撞更精彩！';
    } else {
      this._hintEl.textContent = `${n} 只猫猫就绪，发起后将在右侧对话栏实时直播讨论！`;
    }
  }

  async _start() {
    if (this._busy) return;  // a second click while one start is under way does nothing
    if (this.plugin.cafeClient !== this._client) return this._void();  // connected otherwise since the dialog opened
    const topic = this._topicInput?.value?.trim();
    if (!topic) {
      new obsidian.Notice('💡 请输入讨论议题');
      return;
    }
    if (this._selected.size === 0) {
      new obsidian.Notice('💡 请至少选择一只猫猫');
      return;
    }
    this._setBusy(true);
    try {
      await this._open(topic);
    } catch (err) {  // the modal stays open, so the seminar can be started again from here
      new obsidian.Notice('⚠️ 研讨会发起失败: ' + (err.message || '未知错误'));
    } finally {
      this._setBusy(false);
    }
  }

  /** The plugin is no longer on this dialog's connection: it starts nothing more; opened again, it starts afresh there. */
  _void() {
    new obsidian.Notice('⚠️ 猫咖连接已经变了，这次研讨会没有发出；请重新打开研讨会，在现在连接的猫咖里开');
    this.close();
  }

  /** While a start is under way, the button says so and takes no clicks. */
  _setBusy(on) {
    this._busy = on;
    if (!this._startBtn) return;
    this._startLabel ??= this._startBtn.textContent;
    this._startBtn.disabled = on;
    this._startBtn.textContent = on ? '⏳ 正在开会…' : this._startLabel;
  }

  /** Send the seminar message to its conversation (opening a new one first, if so chosen), then show it in the panel. */
  async _open(topic) {
    // After every wait that a request, a write or a change of the panel follows, it goes on only while the plugin is
    // still on this dialog's connection (as _initCafeConnection does): what comes back after the address changed, or the
    // cafe was disconnected, sends, keeps or shows nothing more for the connection made since.
    const client = this._client;
    const current = () => this.plugin.cafeClient === client;

    // Sync selected cats into global companion roster!
    this.plugin.setSummonedCats([...this._selected]);

    const selectedCats = [...this._selected].map(id => client.findCat(id) || { id });
    const catNames = selectedCats.map(cat => {
      const p = SpecParser.resolveCatProfile(cat);
      return cat.nickname || p?.nickname || cat.displayName || cat.name || cat.id;
    });
    const mentions = selectedCats.map(cat => {
      const p = SpecParser.resolveCatProfile(cat);
      return p?.mention || `@${cat.nickname || cat.name || cat.id}`;
    });

    // Build structured seminar message with standalone @mentions for A2A routing
    let content = `🎓 **猫咖研讨会**\n\n`;
    content += `**议题**：${topic}\n`;
    content += `**参会猫猫**：${catNames.join('、')}\n\n`;

    const passages = this._attachPassage ? this._passages : [];
    const passage = passages[0] || null;
    if (this._attachNote && this._targetFile && !passage) {
      const noteContent = await this.app.vault.read(this._targetFile);
      const preview = noteContent.substring(0, 1500);
      content += `---\n📎 参考笔记「${this._targetFile.basename}」：\n\n${preview}${noteContent.length > 1500 ? '\n...(全文 ' + noteContent.length + ' 字)' : ''}\n\n---\n\n`;
    }
    if (passages.length > 1) {
      content += passagesMessage(passages, topic) + '\n\n';
    } else if (passage) {
      const fence = passageFence(passage.text);
      content += `---\n📌 选段 · 《${passage.basename}》${passageLines(passage)}：\n\n${fence}\n${passage.text}\n${fence}\n\n---\n\n`;
      content += `如果要给出修改，请把改好的完整段落放进一个 ${fence}修改稿 代码块（只放改好的正文），说明写在代码块外。\n\n`;
    }

    content += `请参会猫猫从各自专长出发，就以上议题给出精炼、可直接整理进笔记的观点与建议。\n\n`;
    content += mentions.join('\n');
    if (content.length > 100000) throw new Error('选段、议题与来源标签合计超过消息上限，请减少研讨材料');

    // Its conversation: the one picked in 3. 在哪开会 (from this dialog's cafe), or the one this dialog opens. That is
    // opened at most once: its key is made once and sent with every attempt, so a retry after a failed send, or a
    // request resent because its answer was lost, gets the same conversation back from the cafe.
    if (!current()) return this._void();  // (the note was being read)
    const opensNew = this._where !== 'existing';
    if (opensNew && !this._opening) this._opening = { key: crypto.randomUUID(), thread: null };
    if (opensNew && !this._opening.thread) {
      const temporaryTitle = seminarThreadTitle({ passage: passages.length ? passages : null, noteName: this._attachNote && this._targetFile && !passage ? this._targetFile.basename : '', topic });
      const thread = await client.createThread({ temporaryTitle, projectPath: this.app.vault.adapter.basePath || '', idempotencyKey: this._opening.key });
      this._opening.thread = { ...thread, title: thread.title || temporaryTitle };  // the cafe may answer before it applies the title
      if (!current()) return this._void();  // the conversation stays in the cafe that opened it; nothing is sent
      this._syncWhere();
    }
    const threadId = opensNew ? this._opening.thread.id : this._threadSelect.value;
    const body = { content, threadId };
    const revisionId = passage ? `rq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : null;
    if (revisionId) {  // a 修改稿 answering this seminar message, from any of its cats, can then replace this passage
      await this.plugin.rememberPassageRequest(revisionId, client.baseUrl, threadId, passages);
      if (!current()) return this._void();
    }

    const resp = await client._fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Sent, to this dialog's cafe: the revision request is bound to that message there, whatever the connection now
    if (revisionId) await this.plugin.bindRevisionMessage(revisionId, resp?.userMessageId);

    const moved = !current();  // sent, to this dialog's cafe, while the plugin has come to another connection
    new obsidian.Notice(moved
      ? `🎓 研讨会已发到原来连接的猫咖（${client.baseUrl}）；猫咖连接已经换了，对话栏不会切过去`
      : opensNew
        ? `🎓 研讨会已在新对话「${this._opening.thread.title}」开启！${catNames.join('、')} 正在右侧对话栏准备发言...`
        : `🎓 研讨会已开启！${catNames.join('、')} 正在右侧对话栏准备发言...`);
    this.close();
    if (passage) await this.plugin.consumeChatPassages(passages);
    if (moved) return;
    const shown = opensNew
      ? await this.plugin.showNewConversation(client, threadId)
      : (await this.plugin.openCafeChat({ threadId, client })) !== false;
    if (!shown) new obsidian.Notice('💬 猫咖连接已经换了，对话栏没有切到这场研讨会的对话');
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════
// Main Plugin Class
// ═══════════════════════════════════════════════
class ClowderAtlasPlugin extends obsidian.Plugin {
  get chatPassages() { return this.settings?.chatPassages || []; }
  set chatPassages(input) { this.settings.chatPassages = normalizePassages(input); this._refreshLensViews(); }
  get chatPassage() { return this.chatPassages[0] || null; }
  set chatPassage(input) { this.chatPassages = input; }

  async setChatPassages(input) {
    this.chatPassages = input;
    this._renderChatPassage();
    await this.saveSettings();
  }

  async consumeChatPassages(sent) {
    // Selections added while a request was in flight belong to the next message.
    await this.setChatPassages(this.chatPassages.filter(p => !sent.includes(p)));
  }

  async jumpToPassage(p) {
    const file = this.app.vault.getAbstractFileByPath(p.path);
    if (!(file instanceof obsidian.TFile)) return new obsidian.Notice('⚠️ 找不到选段源笔记；引用篮仍保留原选段');
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true, eState: { line: p.from.line } });
    leaf.view?.editor?.setSelection(p.from, p.to);
    leaf.view?.editor?.scrollIntoView({ from: p.from, to: p.to }, true);
  }
  async onload() {
    console.log('Clowder Atlas: Loading plugin...');

    await this.loadSettings();
    this.summonedCatIds = new Set(this.settings.summonedCats || []);
    this.cafeScanPorts = [...CAFE_SCAN_PORTS];  // where findCafe() looks after the configured address
    this.cafePollMs = 30000;  // how often cats and threads are re-read while connected
    this._resending = new Set();  // failed sends being resent (see beginResend)

    // Our tabs already in the layout when the plugin is switched on in a running app (e.g. the first「信任仓库作者并启用插件」).
    // Obsidian rebuilds them as soon as their view type is registered, and while that rebuild is in flight they read as empty
    // tabs, so count them here, before registerView; otherwise onLayoutReady below opens a second lens / star chart.
    const restoring = new Set([VIEW_TYPE_PROVENANCE_LENS, VIEW_TYPE_STAR_CHART].filter((t) => this.app.workspace.getLeavesOfType(t).length));

    // Register views
    this.registerView(VIEW_TYPE_PROVENANCE_LENS, (leaf) => new ProvenanceLensView(leaf, this));
    this.registerView(VIEW_TYPE_STAR_CHART, (leaf) => new StarChartView(leaf, this));
    this.registerView(VIEW_TYPE_CAFE_CHAT, (leaf) => new CafeChatView(leaf, this));

    // Add commands
    this.addCommand({
      id: 'toggle-provenance-lens',
      name: 'Toggle Provenance Lens',
      callback: () => this.toggleLens(),
    });

    this.addCommand({
      id: 'open-provenance-lens',
      name: 'Open Provenance Lens',
      callback: () => this.activateLens(),
    });

    this.addCommand({
      id: 'insert-memory-template-minimal',
      name: 'Insert Memory Template (Minimal)',
      editorCallback: (editor) => this.insertTemplate(editor, 'minimal'),
    });

    this.addCommand({
      id: 'insert-memory-template-full',
      name: 'Insert Memory Template (Full)',
      editorCallback: (editor) => this.insertTemplate(editor, 'full'),
    });

    this.addCommand({
      id: 'insert-memory-template-paper',
      name: 'Insert Memory Template (Paper)',
      editorCallback: (editor) => this.insertTemplate(editor, 'paper'),
    });

    this.addCommand({
      id: 'create-atlas-note',
      name: 'Create New Atlas Note',
      callback: () => this.createAtlasNote(),
    });

    this.addCommand({
      id: 'scan-vault-stats',
      name: 'Scan Vault Statistics',
      callback: () => this.scanVault(),
    });

    this.addCommand({
      id: 'generate-canvas',
      name: 'Generate Atlas Canvas',
      callback: () => this.generateCanvas(),
    });

    this.addCommand({
      id: 'open-star-chart',
      name: 'Open Star Chart ★',
      callback: () => this.openStarChart(),
    });

    this.addCommand({
      id: 'open-cafe-chat',
      name: 'Open Cat Cafe Chat ☕',
      callback: () => this.openCafeChat(),
    });

    this.addCommand({
      id: 'ask-cats-about-note',
      name: 'Ask Cats About This Note 🐾',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.isCafeConnected) return false;
        if (checking) return true;
        this._askCatsAboutNote(file);
      },
    });

    // A passage of the note being edited, handed to the cats. Whether they discuss it or revise it is up to what the user
    // writes to them — not to which menu item was picked.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!editor.somethingSelected() || !view?.file) return;
      menu.addItem((item) => item.setTitle('🐾 把选中段落交给猫猫').setIcon('message-circle').onClick(() => this.askAboutPassage(editor, view)));
    }));
    this.addCommand({
      id: 'ask-about-selection',
      name: 'Ask Cats About Selection 🐾',
      editorCheckCallback: (checking, editor, view) => {
        if (!editor.somethingSelected() || !view?.file) return false;
        if (!checking) this.askAboutPassage(editor, view);
        return true;
      },
    });

    this.addCommand({
      id: 'organize-seminar',
      name: 'Organize Cat Seminar 🎓',
      callback: () => this.openSeminarModal(),
    });

    this.addCommand({
      id: 'new-cafe-conversation',
      name: 'New Cat Cafe Conversation 💬',
      callback: () => this.startNewConversation(),
    });

    // Single ribbon icon with coherent menu
    this.addRibbonIcon('cat', 'Clowder Atlas', (evt) => {
      const menu = new obsidian.Menu();
      menu.addItem(item => item.setTitle('🔍 溯源透镜（右侧伴读台）').setIcon('eye').onClick(() => this.activateLens()));
      menu.addItem(item => item.setTitle('💬 猫咖对话（右侧研讨流）').setIcon('message-circle').onClick(() => this.openCafeChat()));
      menu.addItem(item => item.setTitle('🎓 针对当前笔记开研讨会').setIcon('graduation-cap').onClick(() => this.openSeminarModal()));
      menu.addSeparator();
      menu.addItem(item => item.setTitle('✦ 3D 记忆星图').setIcon('star').onClick(() => this.openStarChart()));
      menu.addItem(item => item.setTitle('🎨 生成 2D 知识画布').setIcon('layout-grid').onClick(() => this.generateCanvas()));
      menu.showAtMouseEvent(evt);
    });

    // Status bar
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // Add settings tab
    this.addSettingTab(new ClowderAtlasSettingTab(this.app, this));

    // Auto-open on layout ready — Star Chart + Provenance Lens
    this.app.workspace.onLayoutReady(() => {
      this.updateStatusBar();
      // The cat playground was folded into the companion strip (0.8.3); close its tabs left in saved layouts.
      for (const leaf of this.app.workspace.getLeavesOfType('clowder-atlas-cat-playground')) leaf.detach();
      if (!restoring.has(VIEW_TYPE_PROVENANCE_LENS) && !this.app.workspace.getLeavesOfType(VIEW_TYPE_PROVENANCE_LENS).length) {
        this.activateLens();
      }
      if (!restoring.has(VIEW_TYPE_STAR_CHART) && !this.app.workspace.getLeavesOfType(VIEW_TYPE_STAR_CHART).length) {
        this.openStarChart();
      }
    });

    // ── Cat Cafe Connection ──
    this.cafeClient = null;
    if (this.settings.catCafeEnabled) {
      this._initCafeConnection();
    }

    console.log('Clowder Atlas: Plugin loaded successfully!');
    new obsidian.Notice('🐾 Clowder Atlas 已就绪 — 探索你的知识花园');
  }

  onunload() {
    if (this.cafeClient) {
      this.cafeClient.destroy();
      this.cafeClient = null;
    }
    console.log('Clowder Atlas: Plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.chatPassages = normalizePassages(this.settings.chatPassages);
  }

  async saveSettings() {
    const write = () => this.saveData(this.settings);
    this._settingsWrite = (this._settingsWrite || Promise.resolve()).then(write, write);
    await this._settingsWrite;
  }

  // ── Global Companion Summon State & Unified Navigation ──

  isCatSummoned(catId) {
    return this.summonedCatIds && this.summonedCatIds.has(catId);
  }

  getSummonedCats() {
    if (!this.cafeClient || !this.cafeClient.cats) return [];
    return this.cafeClient.cats.filter(c => this.isCatSummoned(c.id));
  }

  async toggleSummonCat(catId) {
    if (!this.summonedCatIds) this.summonedCatIds = new Set();
    const cat = this.cafeClient?.findCat(catId);
    const name = cat?.nickname || cat?.displayName || cat?.name || catId;
    if (this.summonedCatIds.has(catId)) {
      this.summonedCatIds.delete(catId);
      new obsidian.Notice(`👋 ${name} 先去休息啦`);
    } else {
      this.summonedCatIds.add(catId);
      new obsidian.Notice(`✨ 已召唤 ${name} 到伴读席！`);
    }
    this.settings.summonedCats = [...this.summonedCatIds];
    await this.saveSettings();
    this.refreshAllViews({ companionsOnly: true });
    this.updateStatusBar();
  }

  async setSummonedCats(catIds) {
    this.summonedCatIds = new Set(catIds || []);
    this.settings.summonedCats = [...this.summonedCatIds];
    await this.saveSettings();
    this.refreshAllViews({ companionsOnly: true });
    this.updateStatusBar();
  }

  /** Opens the chat with the passage selected in `editor` attached; the user's words then say what the cats should do. */
  async askAboutPassage(editor, view) {
    const from = editor.getCursor('from'), to = editor.getCursor('to');
    const text = editor.getRange(from, to);
    if (!text.trim() || !view?.file) return;
    if (text.length > PASSAGE_MAX_CHARS) {
      new obsidian.Notice(`⚠️ 选中的内容有 ${text.length} 字，猫咖一条消息放不下，请缩短到 ${PASSAGE_MAX_CHARS} 字以内`);
      return;
    }
    const passage = { path: view.file.path, basename: view.file.basename, text,
      from: { line: from.line, ch: from.ch }, to: { line: to.line, ch: to.ch } };
    await this.addChatPassage(passage);
  }

  async addChatPassage(passage, openChat = true) {
    if (this.chatPassages.some(p => samePassage(p, passage))) {
      if (openChat) await this.openCafeChat({ passage: true });
      new obsidian.Notice('💡 这段已在选段引用篮里');
      return false;
    }
    if (this.chatPassages.reduce((n, p) => n + p.text.length, 0) + passage.text.length > PASSAGE_MAX_CHARS) {
      new obsidian.Notice('⚠️ 多段选段累计超过 90,000 字，请先移除部分选段后再添加');
      return false;
    }
    await this.setChatPassages([...this.chatPassages, passage]);
    if (openChat) await this.openCafeChat({ passage: true });
    return true;
  }

  _renderChatPassage() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CAFE_CHAT)) leaf.view?._renderPassage?.();
  }

  // Domain writes explicitly invalidate the Lens; unrelated settings saves must not redraw its reading state.
  _refreshLensViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROVENANCE_LENS)) leaf.view?.refresh?.();
  }

  /**
   * Passage requests, by request id — { id, cafe, threadId, path, original, from, to, at, messageIds } — kept in data.json.
   * messageIds are the cafe's ids for the message that carried the request (its userMessageId; again after a resend).
   * A cat's reply names the messages it answers (lifecycle.inputMessageIds): that is how a 修改稿 finds its passage.
   */
  _revisionRequests() {
    return Object.values(this.settings.revisionTargets || {}).filter((t) => t && t.id && Array.isArray(t.messageIds));
  }

  getRevisionTargetById(id) {
    const t = id ? (this.settings.revisionTargets || {})[id] : null;
    return t && t.id === id && Array.isArray(t.messageIds) ? t : null;
  }

  /** The latest passage request in a conversation — to see where things stand; replies are never matched by this. */
  getRevisionTarget(cafe, threadId) {
    return this._revisionRequests()
      .filter((t) => t.path && t.cafe === cafe && (t.threadId ?? null) === (threadId ?? null))
      .sort((a, b) => b.at - a.at)[0] || null;
  }

  async setRevisionTarget(target) {
    this.settings.revisionTargets = { ...(this.settings.revisionTargets || {}), [target.id]: target };
    this._refreshLensViews();
    await this.saveSettings();
  }

  async rememberPassageRequest(id, cafe, threadId, input) {
    const passages = normalizePassages(input).map(p => ({ ...p, from: { ...p.from }, to: { ...p.to } }));
    const p = passages.length === 1 ? passages[0] : null;
    const request = { id, cafe, threadId, passages, at: Date.now(), messageIds: [] };
    if (p) return this.setRevisionTarget({ ...request, path: p.path, original: p.text, from: p.from, to: p.to });
    this.settings.passageRequests = { ...(this.settings.passageRequests || {}), [id]: request };
    this._refreshLensViews();
    await this.saveSettings();
  }

  _requestsForReply(cafe, msg, threadId = msg?.threadId) {
    const ids = msg?.lifecycle?.kind === 'response' && Array.isArray(msg.lifecycle.inputMessageIds) ? msg.lifecycle.inputMessageIds : [];
    const requests = [...this._revisionRequests(), ...Object.values(this.settings.passageRequests || {})];
    return requests.filter(t => t.cafe === cafe
      && (threadId === undefined || (t.threadId ?? null) === (threadId ?? null))
      && t.messageIds.some(id => ids.includes(id)));
  }

  passagesForReply(cafe, msg, threadId) {
    return this._requestsForReply(cafe, msg, threadId).flatMap(t => t.passages || [{ path: t.path, basename: t.path.split('/').pop().replace(/\.md$/, ''), text: t.original, from: t.from, to: t.to }]);
  }

  /** The cafe stored request `id` as `messageId`: replies answering that message now find this passage. */
  async bindRevisionMessage(id, messageId) {
    const t = this.getRevisionTargetById(id) || this.settings.passageRequests?.[id];
    if (!t || !messageId || t.messageIds.includes(messageId)) return;
    const bound = { ...t, messageIds: [...t.messageIds, messageId] };
    if (t.path) await this.setRevisionTarget(bound);
    else {
      this.settings.passageRequests = { ...this.settings.passageRequests, [id]: bound };
      this._refreshLensViews();
      await this.saveSettings();
    }
    this._renderChatMessages();
  }

  /**
   * The passage request a cat's reply answers: the only one whose message the reply names. A reply that names none of
   * them, or several (the cafe answered more than one message at once), is not matched: its 修改稿 stays copy-only.
   */
  revisionTargetForReply(cafe, msg, threadId) {
    const hits = this._requestsForReply(cafe, msg, threadId);
    if (hits.length === 1 && !hits[0].path) return { target: null, reason: 'multi' };
    return hits.length === 1 ? { target: hits[0] } : { target: null, reason: hits.length > 1 ? 'several' : 'unknown' };
  }

  /** The open editor of `file`, if it is open (a replacement made through it is one Cmd+Z away). */
  _editorFor(file) {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view?.file?.path === file.path && leaf.view.editor) return leaf.view.editor;
    }
    return null;
  }

  /** The note's text as it is now: the open editor's (unsaved typing included), else the file's. */
  async _currentText(file) {
    const editor = this._editorFor(file);
    return editor ? editor.getValue() : this.app.vault.read(file);
  }

  /**
   * Puts a cat's revision in place of the passage it was asked to revise — and only there: the original text must still
   * be where it was, or occur exactly once. Through the open editor when there is one (one undoable step), otherwise as
   * one atomic file update. The request then holds the new text, so another cat's version for it can take its place.
   * Returns { ok, reason }.
   */
  async applyRevision(request, revised) {
    const target = this.getRevisionTargetById(request?.id);  // as it stands now, not as it was when the check opened
    if (!target?.path) return { ok: false, reason: '这份修改稿没有可替换的单选段记录' };
    const file = this.app.vault.getAbstractFileByPath(target.path);
    if (!(file instanceof obsidian.TFile)) return { ok: false, reason: `找不到笔记「${target.path}」` };
    const editor = this._editorFor(file);
    let offset = -1, failure = null;
    if (editor) {
      const at = locatePassage(editor.getValue(), target);
      if (at.offset < 0) return { ok: false, reason: at.reason };
      offset = at.offset;
      editor.replaceRange(revised, editor.offsetToPos(offset), editor.offsetToPos(offset + target.original.length));
    } else {
      await this.app.vault.process(file, (data) => {
        const at = locatePassage(data, target);
        if (at.offset < 0) { failure = at.reason; return data; }
        offset = at.offset;
        return data.slice(0, offset) + revised + data.slice(offset + target.original.length);
      });
      if (failure) return { ok: false, reason: failure };
    }
    const after = await this._currentText(file);
    await this.setRevisionTarget({ ...target, original: revised, from: posOfOffset(after, offset), to: posOfOffset(after, offset + revised.length) });
    return { ok: true };
  }

  /** Sends that did not land, oldest first: { id, cafe, threadId, content, fullContent, error, at }. */
  getFailedSends() {
    return this.settings.failedSends || [];
  }

  /**
   * Keeps (or updates) a failed send, saved with the plugin's data, and shows it in the chat panels. Nothing is ever
   * dropped automatically: a record stays until the user resends, puts back or deletes it.
   */
  async recordFailedSend(record) {
    this.settings.failedSends = [...this.getFailedSends().filter((r) => r.id !== record.id), record];
    await this.saveSettings();
    this._renderChatMessages();
  }

  async dropFailedSend(id) {
    this.settings.failedSends = this.getFailedSends().filter((r) => r.id !== id);
    await this.saveSettings();
    this._renderChatMessages();
  }

  /** Retries in flight, by failed-send id: a rebuilt 重发 reads this, and a second start is refused. */
  beginResend(id) {
    if (this._resending.has(id)) return false;
    this._resending.add(id);
    this._renderChatMessages();  // every panel shows it as on its way
    return true;
  }

  endResend(id) {
    this._resending.delete(id);
  }

  isResending(id) {
    return this._resending.has(id);
  }

  _renderChatMessages() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CAFE_CHAT)) leaf.view?._renderMessages?.();
  }

  /** `{ companionsOnly: true }` when only who is summoned changed: the chat then refreshes its strip in place. */
  refreshAllViews(opts = {}) {
    for (const type of [VIEW_TYPE_PROVENANCE_LENS, VIEW_TYPE_CAFE_CHAT]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        leaf.view?.refresh?.(opts);
      }
    }
  }

  /**
   * Renders the unified top navigation bar shared by the Lens and Chat side panels
   * so switching between views never feels like a dead end.
   */
  renderUnifiedNavBar(container, activeTab) {
    const topbar = container.createDiv('atlas-topbar');
    const brand = topbar.createDiv('atlas-topbar-brand');
    brand.createEl('span', { text: '🐾', cls: 'atlas-topbar-paw' });
    brand.createEl('span', { text: 'Atlas' });

    const connected = this.isCafeConnected;
    brand.createEl('span', {
      cls: `atlas-conn-dot ${connected ? 'is-connected' : ''}`,
      attr: { title: connected ? '已连接猫咖 Hub' : '未连接（点击打开对话面板连接猫咖）' }
    });
    brand.addEventListener('click', () => {
      if (!connected) this.openCafeChat();  // connecting happens in the chat panel, not in Obsidian's settings
    });

    const actions = topbar.createDiv('atlas-topbar-actions');
    const navItems = [
      { id: 'lens', label: '🔍 透镜', title: '当前笔记溯源透镜', onClick: () => this.activateLens() },
      { id: 'chat', label: '💬 对话', title: '猫咖实时对话流', onClick: () => this.openCafeChat() },
      { id: 'stars', label: '✦ 星图', title: '打开 3D 记忆星图', onClick: () => this.openStarChart() },
    ];
    for (const item of navItems) {
      const btn = actions.createEl('button', {
        text: item.label,
        cls: `atlas-icon-btn ${activeTab === item.id ? 'is-active-tab' : ''}`,
        attr: { title: item.title }
      });
      btn.addEventListener('click', item.onClick);
    }
  }

  openSeminarModal(options = {}) {
    if (!this.isCafeConnected) {
      new obsidian.Notice('⚠️ 请先连接猫咖 Hub');
      return;
    }
    new SeminarModal(this.app, this, options).open();
  }

  /**
   * Save a cat's chat/seminar message as a pending L1 Atlas note in <atlasDir>/pending.
   * Spec §2.3 (memory_status): only a person may mark it crystallized — the lens「点亮结晶」, which also moves it to crystals.
   */
  async saveMessageAsPendingNote(msg, catData, threadId, cafe = this.cafeClient?.baseUrl) {
    const uuid = this._generateUUID();
    const now = this._localDate();
    const dir = this.settings.atlasDir + '/pending';
    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    const profile = SpecParser.resolveCatProfile(catData || msg.catId || '');
    const catName = catData?.nickname || profile?.nickname || catData?.name || msg.catId || 'ClowderCat';
    const activeFile = this.app.workspace.getActiveFile();
    const sources = passagesUniqueNotes(this.passagesForReply(cafe, msg, threadId));
    const rawText = (msg.content || '').trim();
    const firstHeadingMatch = rawText.match(/^#+\s*(.+)$/m);
    const shortTitle = firstHeadingMatch
      ? firstHeadingMatch[1].replace(/[\\/:*?"<>|]/g, '').slice(0, 24).trim()
      : sources.length ? `${sources[0].basename}${sources.length > 1 ? `等${sources.length}篇-交叉研讨` : '-研讨要点'}`
      : (activeFile ? `${activeFile.basename}-研讨要点` : `猫咖研讨要点-${now}`);
    // A message that opens with the heading used as the title would otherwise repeat it under the note's own heading.
    const bodyText = firstHeadingMatch && rawText.startsWith(firstHeadingMatch[0]) && firstHeadingMatch[1].trim() === shortTitle
      ? rawText.slice(firstHeadingMatch[0].length).trim()
      : rawText;

    const safeFileName = `${dir}/${shortTitle}-${uuid.slice(0, 6)}.md`;
    // Only this request's sources, never a union of everything discussed in the thread. Unknown response provenance
    // stays unknown. Legacy messages without response metadata retain the explicit "current note" association.
    const links = sources.length ? sources.map(p => `[[${p.path.replace(/\.md$/, '')}]]`)
      : msg.lifecycle?.kind !== 'response' && activeFile ? [`[[${activeFile.basename}]]`] : [];
    const relatedList = JSON.stringify(links);

    const noteContent = [
      '---',
      'atlas_version: v1',
      `atlas_id: "${uuid}"`,
      `memory_type: ${this.settings.defaultMemoryType || 'semantic'}`,
      `title: ${JSON.stringify(shortTitle)}`,
      'memory_status: pending',
      `atlas_authors: ${JSON.stringify([catName])}`,
      'atlas_source: clowder_ai',
      `atlas_source_ref: ${JSON.stringify(threadId || 'cafe-chat')}`,
      ...(cafe ? [`atlas_source_cafe: ${JSON.stringify(cafe)}`] : []),
      `related: ${relatedList}`,
      'tags: [agent-memory, cat-seminar]',
      `created: "${now}"`,
      `updated: "${now}"`,
      '---',
      '',
      `# ${shortTitle}`,
      '',
      `> 🐾 由 **${catName}** 在猫咖研讨中提出，待审阅后点亮结晶`,
      ...(links.length ? ['', '> [!abstract] 来源上下文', `> - **交叉引用笔记**：${links.join('、')}`] : []),
      '',
      bodyText,
      '',
    ].join('\n');

    const newFile = await this.app.vault.create(safeFileName, noteContent);
    await this.app.workspace.getLeaf(false).openFile(newFile);
    new obsidian.Notice(`💎 已将 ${catName} 的观点存为待结晶笔记：${newFile.basename}（审阅后在透镜里点亮结晶）`);
    this.updateStatusBar();
  }

  /**
   * Spec §5.2: a pending candidate waits in <atlasDir>/pending until a person crystallizes it, then moves to
   * <atlasDir>/crystals. Notes anywhere else stay where the person keeps them. Returns the new folder or null.
   */
  async movePendingToCrystals(file) {
    const root = obsidian.normalizePath(this.settings.atlasDir || ATLAS_DIR_DEFAULT);
    if (file.parent?.path !== `${root}/pending`) return null;
    const dir = `${root}/crystals`;
    if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    let target = `${dir}/${file.name}`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(target); i++) target = `${dir}/${file.basename}-${i}.${file.extension}`;
    await this.app.fileManager.renameFile(file, target);  // keeps atlas_id; links follow the user's link settings
    return dir;
  }

  /**
   * Append a cat's chat/seminar insight directly to the currently open Markdown note!
   */
  async appendMessageToActiveNote(msg, catData) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== 'md') {
      new obsidian.Notice('💡 请先在左侧打开一篇 Markdown 笔记，再点击摘录');
      return;
    }
    const profile = SpecParser.resolveCatProfile(catData || msg.catId || '');
    const catName = catData?.nickname || profile?.nickname || catData?.name || msg.catId || '猫猫';
    const now = this._localDate();
    const quotedLines = (msg.content || '')
      .trim()
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');

    const block = `\n\n> [!quote] 🐾 ${catName} 伴读研讨摘录 (${now})\n${quotedLines}\n`;
    await this.app.vault.append(activeFile, block);
    new obsidian.Notice(`📥 已将 ${catName} 的观点追加到《${activeFile.basename}》末尾！`);
  }

  // ── Cat Cafe Connection ──

  async _initCafeConnection() {
    const addr = this.settings.catCafeAddress || 'http://localhost:3004';
    this.cafeClient?.destroy();  // one client, one poll loop
    const client = this.cafeClient = new CatCafeClient(addr);
    // Disconnecting or switching address while this waits makes the attempt void: after every await it goes on only
    // while its client is still the plugin's client, so nothing is shown, saved or started for a stale connection.
    const current = () => this.cafeClient === client;
    const vaultPath = this.app.vault.adapter.basePath || '';
    const ok = await client.connect(vaultPath);
    if (!current()) return;
    if (ok) {
      const catCount = client.cats.length;
      const threadCount = client.threads.length;
      // Default-summon the first 3 cats if user has never summoned any yet, so the companion strip feels alive immediately!
      if ((!this.summonedCatIds || this.summonedCatIds.size === 0) && client.cats.length > 0) {
        this.summonedCatIds = new Set(client.cats.slice(0, 3).map(c => c.id));
        this.settings.summonedCats = [...this.summonedCatIds];
        await this.saveSettings();
        if (!current()) return;
      }
      console.log(`Clowder Atlas: Connected to Cat Cafe! ${catCount} cats, ${threadCount} threads for this vault`);
      new obsidian.Notice(`🐾 已连接猫咖！${catCount} 只猫在线，${this.summonedCatIds.size} 只伴读猫猫已就位`);
      // Cats or threads changed in the cafe (or it went away): refresh the panels, in place while still connected
      client.startPolling(vaultPath, this.cafePollMs, () => {
        this.refreshAllViews({ companionsOnly: this.isCafeConnected });
        this.updateStatusBar();
      });
    } else {
      console.warn('Clowder Atlas: Cat Cafe connection failed:', client.lastError);
      new obsidian.Notice('⚠️ 猫咖连接失败 — 请确认 Cat Cafe Hub 正在运行');
    }
    this.refreshAllViews();
    this.updateStatusBar();
  }

  async _disconnectCafe() {
    if (this.cafeClient) {
      this.cafeClient.destroy();
      this.cafeClient = null;
    }
    this.refreshAllViews();
    this.updateStatusBar();
  }

  _refreshLens() {
    this.refreshAllViews();
  }

  get isCafeConnected() {
    return this.cafeClient && this.cafeClient.connected;
  }

  /**
   * One click for people who may not have Clowder AI set up: find a Cat Cafe running on this machine, save its
   * address, switch the connection on (persisted) and connect.
   * Returns { status: 'connected' | 'failed' | 'not-found', address?, error? }.
   */
  async oneClickConnect() {
    const address = await this.findCafe();
    if (!address) return { status: 'not-found' };
    this.settings.catCafeEnabled = true;
    this.settings.catCafeAddress = address;
    await this.saveSettings();
    await this._initCafeConnection();
    return this.isCafeConnected
      ? { status: 'connected', address }
      : { status: 'failed', address, error: this.cafeClient?.lastError || '连接失败' };
  }

  /** The configured address first, then the usual local ports; returns the first that answers like a Cat Cafe. */
  async findCafe() {
    const candidates = [this.settings.catCafeAddress, ...this.cafeScanPorts.map((p) => `http://localhost:${p}`)]
      .filter(Boolean).map((a) => a.trim().replace(/\/+$/, ''));
    for (const base of new Set(candidates)) {
      if (await CatCafeClient.isCafe(base)) return base;
    }
    return null;
  }

  /** Re-read cats and threads now (the chat panel's ↻); panels update in place. */
  async refreshCafe() {
    const client = this.cafeClient;
    if (!client) return { ok: false, error: '未连接猫咖' };
    await client.connect(this.app.vault.adapter.basePath || '');
    if (this.cafeClient !== client) return { ok: false, error: '连接已断开或已切换地址' };
    this.refreshAllViews({ companionsOnly: client.connected });
    this.updateStatusBar();
    return { ok: client.connected, cats: client.cats.length, threads: client.threads.length, error: client.lastError };
  }

  /** Settings「检测并修复」: same search as the one-click connect, reported as notices. */
  async _diagnoseConnection() {
    const before = this.settings.catCafeAddress;
    const outcome = await this.oneClickConnect();
    if (outcome.status === 'connected') {
      new obsidian.Notice(outcome.address === before ? '✅ 连接已恢复！' : `✅ 自动修复：猫咖在 ${outcome.address}`);
      return true;
    }
    new obsidian.Notice(outcome.status === 'failed'
      ? `❌ 找到了猫咖（${outcome.address}），但没能连上：${outcome.error}`
      : '❌ 本机没有找到运行中的猫咖 — 请先打开猫咖；还没安装的话，在对话面板点「一键连接猫咖」查看下载方式');
    return false;
  }

  // ── Provenance Lens & Views ──

  async activateLens() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROVENANCE_LENS);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      existing[0].view?.updateForActiveFile?.(false);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_PROVENANCE_LENS, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async openStarChart({ focusPath = null } = {}) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STAR_CHART);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view;
      if (view._focusPath && !focusPath) view._paused = false;
      view._focusPath = focusPath;
      await existing[0].view?.onOpen?.();
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_STAR_CHART, active: true });
      if (focusPath) { leaf.view._focusPath = focusPath; await leaf.view.onOpen(); }
      this.app.workspace.revealLeaf(leaf);
    }
  }

  /**
   * Turn the chat panel to a conversation just opened on `client`. The list is read again first, so the panel knows it
   * (else it would fall back to the first conversation). If the connection changed meanwhile, the panel — showing another
   * cafe now — is left alone, and false is returned.
   */
  async showNewConversation(client, threadId) {
    if (this.cafeClient !== client) return false;
    await this.refreshCafe();
    if (this.cafeClient !== client) return false;
    return (await this.openCafeChat({ threadId, client })) !== false;
  }

  /**
   * ＋ (chat header) or the command: open a conversation of its own in the cafe — named for the passage attached in the
   * chat, else the note being read, until the first cat to answer names it — and turn the chat panel to it. An attached
   * passage stays attached, so it goes with the first message there. One opening at a time; its key gets the same
   * conversation back if Obsidian resends the request.
   */
  async startNewConversation() {
    if (!this.isCafeConnected) {
      new obsidian.Notice('⚠️ 请先连接猫咖 Hub');
      return;
    }
    if (this._openingConversation) return;
    this._openingConversation = true;
    const client = this.cafeClient;
    try {
      const passage = this.chatPassages.length ? this.chatPassages : null;
      const noteName = passage ? '' : (this.app.workspace.getActiveFile()?.basename || '');
      const temporaryTitle = threadTitle('💬 新对话', { passage, noteName });
      const thread = await client.createThread({ temporaryTitle, projectPath: this.app.vault.adapter.basePath || '', idempotencyKey: crypto.randomUUID() });
      const title = thread.title || temporaryTitle;  // the cafe may answer before it applies the title
      if (!(await this.showNewConversation(client, thread.id))) {
        new obsidian.Notice(`💬 新对话「${title}」建在原来连接的猫咖（${client.baseUrl}）里；猫咖连接已经换了，对话栏没有切过去`);
        return;
      }
      new obsidian.Notice(`💬 已新开对话「${title}」${passage ? passage.length > 1 ? `，${passage.length} 段选段跟过来了` : '，选段跟过来了' : ''}`);
    } catch (err) {
      new obsidian.Notice(`⚠️ 新对话没有建成：${err.message || '未知错误'}`);
    } finally {
      this._openingConversation = false;
    }
  }

  /** The conversation the chat panel shows (null while it is closed or has none): the seminar's default existing one. */
  currentChatThreadId() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE_CAFE_CHAT)[0]?.view?._threadId ?? null;
  }

  /**
   * Show the chat panel, creating it if needed, with `options` applied. A conversation (`threadId`) belongs to the
   * connection it was listed or opened on (`client`, else the one now): carried through the panel's creation, which can
   * take a while, so it is never applied to another connection (see applyChatContext). False when it was not applied.
   */
  async openCafeChat(options = {}) {
    if (options.threadId && !options.client) options = { ...options, client: this.cafeClient };
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CAFE_CHAT);
    if (existing.length) {
      this.app.workspace.revealLeaf(existing[0]);
      return existing[0].view?.applyChatContext ? existing[0].view.applyChatContext(options) : true;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return false;
    await leaf.setViewState({ type: VIEW_TYPE_CAFE_CHAT, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view?.applyChatContext ? leaf.view.applyChatContext(options) : true;
  }

  async _askCatsAboutNote(file) {
    if (!this.isCafeConnected) {
      new obsidian.Notice('⚠️ 请先连接猫咖 Hub');
      return;
    }
    await this.openCafeChat({ attachFile: file });
  }

  async toggleLens() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROVENANCE_LENS);
    if (existing.length) {
      existing[0].detach();
    } else {
      await this.activateLens();
    }
  }

  // ── Template Insertion ──

  async insertTemplate(editor, type) {
    // Guard against re-entry (rapid double-invoke before cache updates)
    if (this._templateInFlight) {
      new obsidian.Notice('模板操作进行中，请稍候');
      return;
    }
    this._templateInFlight = true;

    try {
      await this._insertTemplateInner(editor, type);
    } finally {
      // Release after a short delay to let cache catch up
      setTimeout(() => { this._templateInFlight = false; }, 500);
    }
  }

  async _insertTemplateInner(editor, type) {
    const now = this._localDate();
    const activeFile = this.app.workspace.getActiveFile();

    // Check if file already has frontmatter — read EDITOR CONTENT directly,
    // not metadata cache, because cache may lag behind unsaved edits.
    const editorContent = editor.getValue();
    const hasFrontmatter = /^\s*---\s*\n/.test(editorContent) && editorContent.indexOf('\n---', 4) > 0;

    if (activeFile && hasFrontmatter) {
      await this._enrollExistingNote(activeFile, editor, type, now);
      return;
    }

    // Also guard: if editor already has content (but no frontmatter), don't blindly prepend
    if (editorContent.trim().length > 0) {
      if (activeFile) {
        await this._enrollExistingNote(activeFile, editor, type, now);
        return;
      }
    }

    // Truly empty file — safe to insert full template
    const uuid = this._generateUUID();
    let template = '';

    switch (type) {
      case 'minimal':
        template = [
          '---',
          'atlas_version: v1',
          `atlas_id: "${uuid}"`,
          `memory_type: ${this.settings.defaultMemoryType}`,
          'title: ""',
          'memory_status: draft',
          'tags: []',
          `created: "${now}"`,
          `updated: "${now}"`,
          '---',
          '',
          '# ',
          '',
          '## 要点',
          '',
          '',
          '## 来源',
          '',
          '',
          '## 关联笔记',
          '',
          ''
        ].join('\n');
        break;

      case 'full':
        template = [
          '---',
          'atlas_version: v1',
          `atlas_id: "${uuid}"`,
          `memory_type: ${this.settings.defaultMemoryType}`,
          'title: ""',
          'memory_status: draft',
          'atlas_authors: []',
          'atlas_source: manual',
          'atlas_source_ref: ""',
          'related: []',
          'tags: [agent-memory]',
          `created: "${now}"`,
          `updated: "${now}"`,
          'atlas_author_details: []',
          'atlas_evidence: []',
          '---',
          '',
          '# ',
          '',
          '## TL;DR',
          '',
          '',
          '## 内容',
          '',
          '',
          '## 关联与启发',
          '',
          '',
          '## 证据链',
          '',
          '> 本笔记的内容来源于以下证据，可逐条追溯。',
          '',
          ''
        ].join('\n');
        break;

      case 'paper':
        template = [
          '---',
          'atlas_version: v1',
          `atlas_id: "${uuid}"`,
          'memory_type: semantic',
          'type: paper',
          'title: ""',
          'memory_status: draft',
          'atlas_authors: []',
          'atlas_source: manual',
          'atlas_source_ref: ""',
          'paper_authors: []',
          'paper_arxiv: ""',
          'paper_venue: ""',
          'paper_date: ""',
          'related: []',
          'tags: [agent-memory, paper]',
          `created: "${now}"`,
          `updated: "${now}"`,
          'atlas_evidence: []',
          '---',
          '',
          '# ',
          '',
          '## TL;DR',
          '',
          '',
          '## 核心贡献',
          '',
          '',
          '## 方法',
          '',
          '',
          '## 关键结果',
          '',
          '',
          '## 与其他工作的关系',
          '',
          '',
          '## 对我们的启发',
          '',
          ''
        ].join('\n');
        break;
    }

    editor.replaceRange(template, { line: 0, ch: 0 });
    new obsidian.Notice(`Atlas 模板已插入 (${type})`);
    this.updateStatusBar();
  }

  /**
   * Safely enroll an existing note into Atlas using SYNCHRONOUS editor
   * operations only. Parses frontmatter from the editor buffer, patches
   * missing Atlas fields, and writes back via editor.replaceRange() —
   * all in a single synchronous tick. No disk I/O, no race window.
   *
   * Obsidian's auto-save handles persistence to disk at its normal cadence.
   * Invalid YAML is preserved as-is with a user notice.
   */
  _enrollExistingNote(file, editor, type, now) {
    const content = editor.getValue();
    const lines = content.split('\n');

    // ── Locate frontmatter boundaries ──
    let fmOpenLine = -1;
    let fmCloseLine = -1;

    // Opening --- must be at or before the first non-blank line
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*$/.test(lines[i])) continue;       // skip leading blanks
      if (/^---\s*$/.test(lines[i])) {
        fmOpenLine = i;
      }
      break; // first non-blank line decides
    }

    if (fmOpenLine >= 0) {
      for (let i = fmOpenLine + 1; i < lines.length; i++) {
        if (/^---\s*$/.test(lines[i])) {
          fmCloseLine = i;
          break;
        }
      }
    }

    if (fmOpenLine >= 0 && fmCloseLine > fmOpenLine) {
      // ── Has frontmatter — parse, patch, replace ──
      const yamlStr = lines.slice(fmOpenLine + 1, fmCloseLine).join('\n');

      let parsed;
      try {
        parsed = obsidian.parseYaml(yamlStr);
      } catch (e) {
        new obsidian.Notice('⚠️ YAML 格式无效，无法自动补字段。请手动修正 frontmatter 后重试。');
        return;
      }
      // Only plain objects (YAML mappings) and null/undefined (empty doc)
      // can have Atlas fields added. Arrays, strings, numbers etc. are
      // valid YAML but not property mappings — preserve them as-is.
      if (parsed === null || parsed === undefined) {
        parsed = {};
      } else if (Array.isArray(parsed) || typeof parsed !== 'object') {
        new obsidian.Notice('⚠️ Frontmatter 不是属性映射（可能是纯文本或列表），无法自动补字段。请改为 key: value 格式后重试。');
        return;
      }

      // Only add missing Atlas fields — never overwrite existing values
      if (!parsed.atlas_id)      parsed.atlas_id = this._generateUUID();
      if (!parsed.atlas_version) parsed.atlas_version = 'v1';
      if (!parsed.memory_type)   parsed.memory_type = (type === 'paper') ? 'semantic' : this.settings.defaultMemoryType;
      if (!parsed.memory_status) parsed.memory_status = 'draft';
      if (!parsed.atlas_authors) parsed.atlas_authors = [];
      if (!parsed.atlas_source)  parsed.atlas_source = 'manual';
      if (!parsed.created)       parsed.created = now;
      parsed.updated = now;

      if (type === 'paper') {
        if (!parsed.type)           parsed.type = 'paper';
        if (!parsed.paper_authors)  parsed.paper_authors = [];
      }

      const newYaml = obsidian.stringifyYaml(parsed);   // trailing \n included
      const newFmBlock = '---\n' + newYaml + '---\n';

      // Synchronous atomic replace: opening --- through closing ---\n
      editor.replaceRange(
        newFmBlock,
        { line: fmOpenLine, ch: 0 },
        { line: fmCloseLine + 1, ch: 0 }
      );
    } else {
      // ── No frontmatter — prepend new block at the top ──
      const fm = {};
      fm.atlas_id      = this._generateUUID();
      fm.atlas_version  = 'v1';
      fm.memory_type    = (type === 'paper') ? 'semantic' : this.settings.defaultMemoryType;
      fm.memory_status  = 'draft';
      fm.atlas_authors  = [];
      fm.atlas_source   = 'manual';
      fm.created        = now;
      fm.updated        = now;

      if (type === 'paper') {
        fm.type          = 'paper';
        fm.paper_authors = [];
      }

      const newYaml = obsidian.stringifyYaml(fm);
      editor.replaceRange('---\n' + newYaml + '---\n', { line: 0, ch: 0 });
    }

    new obsidian.Notice(`已将此笔记加入 Atlas (${type})，原有字段已保留`);
    this.updateStatusBar();
  }

  // ── Create Atlas Note ──

  async createAtlasNote() {
    const uuid = this._generateUUID();
    const now = this._localDate();
    const dir = this.settings.atlasDir + '/pending';

    // Ensure directory exists
    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    const fileName = `${dir}/新笔记-${now}-${uuid.slice(0, 8)}.md`;
    const content = [
      '---',
      'atlas_version: v1',
      `atlas_id: "${uuid}"`,
      `memory_type: ${this.settings.defaultMemoryType}`,
      'title: ""',
      'memory_status: draft',
      'atlas_authors: []',
      'atlas_source: manual',
      'atlas_source_ref: ""',
      'related: []',
      'tags: [agent-memory]',
      `created: "${now}"`,
      `updated: "${now}"`,
      '---',
      '',
      '# ',
      '',
      ''
    ].join('\n');

    const file = await this.app.vault.create(fileName, content);
    await this.app.workspace.getLeaf(false).openFile(file);
    new obsidian.Notice(`新 Atlas 笔记已创建: ${file.name}`);
    this.updateStatusBar();
  }

  // ── Vault Scan ──

  async scanVault() {
    const files = this.app.vault.getMarkdownFiles();
    let atlasCount = 0;
    let byType = {};
    let byStatus = {};
    let byLevel = {};

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const note = SpecParser.parse(cache?.frontmatter);
      if (note) {
        atlasCount++;
        byType[note.memory_type] = (byType[note.memory_type] || 0) + 1;
        byStatus[note.memory_status] = (byStatus[note.memory_status] || 0) + 1;
        byLevel[note.level] = (byLevel[note.level] || 0) + 1;
      }
    }

    const lines = [
      `📊 Vault 扫描完成`,
      ``,
      `总文件: ${files.length} 篇 Markdown`,
      `Atlas 笔记: ${atlasCount} 篇`,
      ``,
      `按类型:`,
      ...Object.entries(byType).map(([k, v]) => `  ${MEMORY_TYPE_COLORS[k]?.icon || '📄'} ${k}: ${v}`),
      ``,
      `按状态:`,
      ...Object.entries(byStatus).map(([k, v]) => `  ${STATUS_LABELS[k]?.icon || '📋'} ${k}: ${v}`),
      ``,
      `按层级:`,
      ...Object.entries(byLevel).map(([k, v]) => `  ${k}: ${v}`),
    ];

    new obsidian.Notice(lines.join('\n'), 15000);
    console.log('Clowder Atlas Vault Scan:', { atlasCount, byType, byStatus, byLevel });

    this.updateStatusBar();
  }

  // ── Canvas Generation ──

  async generateCanvas() {
    const files = this.app.vault.getMarkdownFiles();
    const nodes = [];
    const edges = [];
    const atlasNotes = [];

    // Collect Atlas notes
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const note = SpecParser.parse(cache?.frontmatter);
      if (note) {
        atlasNotes.push({ file, note, cache });
      }
    }

    if (atlasNotes.length === 0) {
      new obsidian.Notice('未找到 Atlas 笔记，请先创建或标记一些笔记');
      return;
    }

    // Group by memory_type
    const groups = {};
    for (const { file, note } of atlasNotes) {
      const type = note.memory_type || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push({ file, note });
    }

    // Layout: arrange groups vertically, notes horizontally within each group
    let groupY = 50;
    const nodeWidth = 280;
    const nodeHeight = 120;
    const padding = 30;
    let nodeIdMap = {};

    for (const [type, items] of Object.entries(groups)) {
      const typeInfo = MEMORY_TYPE_COLORS[type] || { hex: '#888888', label: type };

      // Group node
      const groupWidth = Math.max(400, items.length * (nodeWidth + padding) + padding);
      const groupId = 'group-' + type;
      nodes.push({
        id: groupId,
        type: 'group',
        x: 30,
        y: groupY,
        width: groupWidth,
        height: nodeHeight + padding * 2 + 40,
        color: this._canvasColor(typeInfo.hex),
        label: `${typeInfo.label} (${type})`
      });

      // Note nodes inside group
      let nodeX = 30 + padding;
      for (const { file, note } of items) {
        const nodeId = this._generateSimpleId();
        nodeIdMap[file.path] = nodeId;

        const lumState = LUMINANCE_STATES[note.luminance];
        nodes.push({
          id: nodeId,
          type: 'file',
          file: file.path,
          x: nodeX,
          y: groupY + 40 + padding,
          width: nodeWidth,
          height: nodeHeight,
          color: lumState ? this._canvasColor(lumState.hex) : undefined,
        });
        nodeX += nodeWidth + padding;
      }

      groupY += nodeHeight + padding * 2 + 40 + 50;
    }

    // Create edges from BOTH content wikilinks AND frontmatter `related` field
    const edgeSet = new Set(); // dedupe by "source→target"
    for (const { file, note, cache } of atlasNotes) {
      const sourceId = nodeIdMap[file.path];
      if (!sourceId) continue;

      // Collect all link targets (content + related frontmatter)
      const targets = [];

      // Content wikilinks
      if (cache?.links) {
        for (const link of cache.links) {
          const dest = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
          if (dest) targets.push(dest.path);
        }
      }

      // Frontmatter related (parse wikilinks)
      if (note.related) {
        for (const raw of note.related) {
          const parsed = SpecParser.parseWikilink(raw);
          if (!parsed) continue;
          const dest = this.app.metadataCache.getFirstLinkpathDest(parsed.target, file.path);
          if (dest) targets.push(dest.path);
        }
      }

      // Create edges (deduplicated)
      for (const targetPath of targets) {
        if (nodeIdMap[targetPath]) {
          const edgeKey = `${sourceId}→${nodeIdMap[targetPath]}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              id: this._generateSimpleId(),
              fromNode: sourceId,
              toNode: nodeIdMap[targetPath],
              fromSide: 'right',
              toSide: 'left',
            });
          }
        }
      }
    }

    // Write canvas file
    const canvasDir = this.settings.canvasDir;
    if (!this.app.vault.getAbstractFileByPath(canvasDir)) {
      await this.app.vault.createFolder(canvasDir);
    }

    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const canvasPath = `${canvasDir}/atlas-${now}.canvas`;
    const canvasData = JSON.stringify({ nodes, edges }, null, 2);

    const canvasFile = await this.app.vault.create(canvasPath, canvasData);
    await this.app.workspace.getLeaf(false).openFile(canvasFile);
    new obsidian.Notice(`Atlas Canvas 已生成: ${atlasNotes.length} 笔记, ${edges.length} 连接`);
  }

  // ── Status Bar ──

  updateStatusBar() {
    if (!this.statusBarItem) return;
    const files = this.app.vault.getMarkdownFiles();
    let count = 0;
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (SpecParser.parse(cache?.frontmatter)) count++;
    }
    if (this.isCafeConnected) {
      const summoned = this.getSummonedCats().length;
      this.statusBarItem.setText(`🐾 Atlas: ${count} · 伴读 ${summoned}/${this.cafeClient.cats.length}猫`);
    } else {
      this.statusBarItem.setText(`🐾 Atlas: ${count}`);
    }
  }

  // ── Helpers ──

  _generateUUID() {
    // UUIDv4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  _generateSimpleId() {
    return Math.random().toString(36).substring(2, 18);
  }

  _canvasColor(hex) {
    // JSON Canvas 1.0 spec: color is 1-6 (preset) or "#RRGGBB" (custom hex)
    // Obsidian preset mapping: 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple
    // We use presets where close enough, custom hex otherwise
    const colorMap = {
      '#FFD700': '3',       // yellow (active luminance → yellow preset)
      '#DEB887': '2',       // warm → orange preset
      '#A9B7C6': undefined, // cool → no color (default)
      '#5C6370': undefined, // dormant → no color
      '#6C8EBF': '5',       // semantic blue → cyan preset (closest)
      '#D4A574': '2',       // episodic amber → orange preset
      '#6AAF6A': '4',       // procedural green → green preset
      '#E8B84B': '3',       // warm gold → yellow preset
    };
    return colorMap[hex] || undefined;
  }

  /** Returns local date string YYYY-MM-DD (user's timezone, not UTC) */
  _localDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

module.exports = ClowderAtlasPlugin;
