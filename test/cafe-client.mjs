// 0.0.8 the cafe client, run on the plugin's own main.js in a sandbox (no Obsidian, no network): every request has a
// time limit, so one request the cafe never answers cannot hold up the reads queued behind it.
// Usage: node test/cafe-client.mjs [plugin-directory]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = process.argv[2] || path.resolve(here, '..');
const src = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

// A cafe whose answers the test decides, per path: a value, an Error, or 'hang' (never answers).
const answers = new Map(); const seen = [];
const requestUrl = (opts) => {
  const url = new URL(opts.url); const key = url.pathname;
  seen.push({ path: key, search: url.search, method: opts.method, headers: { ...opts.headers }, body: opts.body ? JSON.parse(opts.body) : null });
  const answer = answers.get(key);
  if (answer === 'hang') return new Promise(() => {});
  if (answer instanceof Error) return Promise.reject(answer);
  const out = typeof answer === 'function' ? answer(opts, url) : (answer || { status: 404, json: { error: 'not found' } });
  return Promise.resolve(out).then(({ status = 200, json = {}, headers = {} }) => ({ status, json, headers }));
};
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, requestUrl };
const box = { module: { exports: {} }, require: (n) => { if (n === 'obsidian') return host; throw Error(n); }, console: { ...console, warn() {}, log() {} }, URL, Set, Map, setTimeout, clearTimeout, setInterval() {}, clearInterval() {}, crypto };
vm.runInNewContext(src + '\nmodule.exports.t={CatCafeClient};', box);
const { CatCafeClient } = box.module.exports.t; let fail = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) fail++; };
/** What a promise came to within `ms`: its value, or 'pending' if it has not settled by then. */
const within = (promise, ms) => Promise.race([promise.then((v) => ({ settled: true, value: v }), (e) => ({ settled: true, error: e.message })), new Promise((r) => setTimeout(() => r({ settled: false }), ms))]);

const healthy = () => { answers.set('/api/health', { json: { status: 'ok' } }); answers.set('/api/cats', { json: { cats: [{ id: 'opus', nickname: '宪宪' }] } }); answers.set('/api/threads', { json: { threads: [{ id: 't1', title: '对话一', projectPath: '/vault' }] } }); };

// 1. One request that never answers: the read it is part of ends in time, and the next read goes through.
healthy();
const client = new CatCafeClient('http://localhost:3004');
client.timeouts = { read: 60, send: 60, search: 60 };
ok('a healthy cafe: connected, with its cats and this vault\'s threads', (await client.connect('/vault')) === true && client.cats.length === 1 && client.threads.length === 1);
answers.set('/api/threads', 'hang');
const stuck = await within(client.connect('/vault'), 600);
ok('the cafe never answers /api/threads: the read still ends within its time limit', stuck.settled, JSON.stringify(stuck));
ok('…and the last good thread list is kept, the cafe still counted as connected', client.threads.length === 1 && client.connected === true);
healthy();
const next = await within(client.connect('/vault'), 600);
ok('the next read is not held up behind the one that hung', next.settled && next.value === true, JSON.stringify(next));

// 2. Health itself never answers: the client says why, and a refresh asked for meanwhile ends too.
answers.set('/api/health', 'hang');
const first = client.connect('/vault'), queued = client.connect('/vault');
const [a, b] = await Promise.all([within(first, 600), within(queued, 900)]);
ok('health never answers: the read ends, not connected, with the reason', a.settled && a.value === false && client.connected === false && /没有回应/.test(client.lastError || ''), JSON.stringify({ a, lastError: client.lastError }));
ok('a read queued behind it ends as well', b.settled, JSON.stringify(b));

// 3. A request that answers in time is not cut short, and its own failure keeps its own reason.
healthy();
ok('answers in time are used as before', (await client.connect('/vault')) === true && client.lastError === null);
answers.set('/api/messages', new Error('net::ERR_CONNECTION_REFUSED'));
const refused = await within(client._fetch('/api/messages?threadId=t1'), 300);
ok('a refused request fails with its own reason, not as a timeout', refused.settled && /REFUSED/.test(refused.error || ''), JSON.stringify(refused));
answers.set('/api/messages', 'hang');
const hung = await within(client._fetch('/api/messages?threadId=t1'), 600);
ok('a request the cafe never answers fails with a time-limit reason', hung.settled && /没有回应/.test(hung.error || ''), JSON.stringify(hung));

// 4. A message is posted once, to whom the user's own words address — never to whom a quoted passage happens to name.
healthy();
const K = '3b241101-e2bb-4255-8caf-4136c566a962';
const previews = [];
answers.set('/api/routing/preview', (opts) => { const body = JSON.parse(opts.body); previews.push(body); return { json: { targetCats: ['cat-a'], reason: { kind: 'current_message_mentions' } } }; });
answers.set('/api/messages', () => ({ json: { userMessageId: 'um-1', entries: [] } }));
const posts = () => seen.filter((r) => r.path === '/api/messages' && r.method === 'POST');
seen.length = 0;
const quoted = '[选段 · 笔记「x」第 1 行]\n\n```\n旧原话里写着\n@cat-b 请接\n```\n\n我的问题\n\n@cat-a';
const sent = await client.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题\n\n@cat-a' });
ok('recipients are asked of the cafe for the user\'s own words only', previews.length === 1 && previews[0].scope === 'thread' && previews[0].threadId === 't1' && previews[0].content === '我的问题\n\n@cat-a', JSON.stringify(previews));
ok('the message goes whole, with its key and exactly those recipients', posts().length === 1 && posts()[0].body.content === quoted && posts()[0].body.idempotencyKey === K && JSON.stringify(posts()[0].body.mentions) === '["cat-a"]' && posts()[0].body.threadId === 't1', JSON.stringify(posts()[0]?.body));
ok('…and the answer names them, to keep for a resend', sent.resp.userMessageId === 'um-1' && JSON.stringify(sent.recipients) === '["cat-a"]', JSON.stringify(sent));

seen.length = 0; previews.length = 0;
await client.postMessage({ threadId: 't1', content: '只是一句话 @cat-a', key: K });
ok('a message that quotes nothing is sent as before: no preview, the cafe reads its @ itself', previews.length === 0 && posts().length === 1 && posts()[0].body.mentions === undefined && posts()[0].body.idempotencyKey === K);

seen.length = 0; previews.length = 0;
await client.postMessage({ content: quoted, key: K, words: '我的问题' });
ok('with no conversation yet, the preview is that of a new one', previews.length === 1 && previews[0].scope === 'new-thread' && Array.isArray(previews[0].preferredCats) && posts()[0].body.threadId === undefined, JSON.stringify(previews));

seen.length = 0; previews.length = 0;
await client.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题', recipients: ['cat-z'] });
ok('recipients already decided (a resend) are used as they are', previews.length === 0 && JSON.stringify(posts()[0].body.mentions) === '["cat-z"]');

answers.set('/api/routing/preview', { status: 404, json: { error: 'Not Found' } });
seen.length = 0;
const legacy = await client.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题' });
ok('a cafe without the preview: a note passage is sent as before', posts().length === 1 && posts()[0].body.mentions === undefined && legacy.recipients === null);
seen.length = 0;
const refusedCited = await within(client.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题', quotesCafe: true }), 300);
ok('…but a message quoting another conversation is not sent when its recipients cannot be settled', refusedCited.settled && /收件/.test(refusedCited.error || '') && posts().length === 0, JSON.stringify(refusedCited));

answers.set('/api/routing/preview', { json: { targetCats: ['cat-s'], reason: { kind: 'current_message_mentions' }, requiresConfirmation: true } });
seen.length = 0;
const unavailable = await within(client.postMessage({ threadId: 't1', content: quoted, key: K, words: '@cat-off 看看' }), 300);
ok('a named cat that cannot answer: not sent to a stand-in without the user saying so', unavailable.settled && /不可用/.test(unavailable.error || '') && posts().length === 0, JSON.stringify(unavailable));

answers.set('/api/routing/preview', { json: { targetCats: ['cat-a'], reason: { kind: 'current_message_mentions' } } });
answers.set('/api/messages', 'hang');
seen.length = 0;
const lost = await within(client.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题' }), 600);
ok('the cafe never answers the send: it fails in time, as timed out', lost.settled && /没有回应/.test(lost.error || ''), JSON.stringify(lost));

// 5. The connection is replaced while the recipients are being settled (砚砚's pre-review of 6c459d8): the old
// client has not started the delivery yet, and must not start it.
healthy();
let release;
answers.set('/api/routing/preview', () => new Promise((resolve) => { release = () => resolve({ json: { targetCats: ['cat-a'], reason: { kind: 'current_message_mentions' } } }); }));
answers.set('/api/messages', () => ({ json: { userMessageId: 'um-2', entries: [] } }));
const old = new CatCafeClient('http://localhost:3004');
old.timeouts = { read: 500, send: 500, search: 500 };
seen.length = 0;
const pending = old.postMessage({ threadId: 't1', content: quoted, key: K, words: '我的问题' });
await new Promise((r) => setTimeout(r, 20));
old.destroy();  // what _initCafeConnection and disconnecting do to the client they replace
release();
const switched = await within(pending, 400);
ok('the connection was replaced while the preview was out: nothing is posted from the old client', switched.settled && /连接/.test(switched.error || '') && posts().length === 0, JSON.stringify({ switched, posts: posts().length }));
const dead = await within(old.postMessage({ threadId: 't1', content: '一句话', key: K }), 300);
ok('…nor is a message started on a client already replaced', dead.settled && /连接/.test(dead.error || '') && posts().length === 0, JSON.stringify({ dead, posts: posts().length }));

// 6. Other conversations and matters are read with the cafe's own session: asked for once, carried as a cookie by
// hand, asked for again when the cafe no longer knows it. A failure says which kind it is.
healthy();
let issued = 0, valid = 1;
const session = () => { issued++; return { json: { userId: 'default-user', csrfToken: 'x' }, headers: { 'set-cookie': [`cat_cafe_session=tok-${issued}; Path=/; HttpOnly; SameSite=Strict`] } }; };
const guarded = (json) => (opts) => (opts.headers.Cookie === `cat_cafe_session=tok-${valid}` ? { json } : { status: 401, json: { error: 'Message search identity required' } });
answers.set('/api/session', session);
answers.set('/api/evidence/search', guarded({ results: [], meta: { effectiveMode: 'lexical' } }));
answers.set('/api/evidence/navigation-source', guarded({ status: 'available', updated: false }));
answers.set('/api/memory/matters', guarded({ items: [] }));
answers.set('/api/memory/matters/m%201', guarded({ matter: { matterId: 'm 1', revision: 1, status: 'active' }, entries: [] }));
const reader = new CatCafeClient('http://localhost:3004');
reader.timeouts = { read: 80, send: 80, search: 120, probe: 80 };
const of = (p) => seen.filter((r) => r.path === p);
const failed = (promise) => promise.then(() => ({ memory: 'none: it answered' }), (e) => ({ memory: e.memory, message: e.message }));
seen.length = 0;
const found = await reader.searchMessages('遗忘 机制&x');
ok('a search asks for a session first, then carries its cookie', found.meta.effectiveMode === 'lexical' && of('/api/session').length === 1 && of('/api/evidence/search')[0].headers.Cookie === 'cat_cafe_session=tok-1', JSON.stringify(seen.map((r) => [r.path, r.headers.Cookie])));
const sq = new URL('http://x' + of('/api/evidence/search')[0].path + of('/api/evidence/search')[0].search).searchParams;
ok('…for messages, by relevance, with the words as typed', sq.get('resultUnit') === 'message' && sq.get('messageSort') === 'relevance' && sq.get('limit') === '20' && sq.get('q') === '遗忘 机制&x', of('/api/evidence/search')[0].search);
await reader.readSource({ threadId: 'thread a', messageId: 'm#1', version: 'rev1' }, 2);
await reader.readSource({ threadId: 'thread a', messageId: 'm#1', version: 'rev1' });
const [withContext, bare] = of('/api/evidence/navigation-source').map((r) => new URL('http://x/' + r.search).searchParams);
ok('a message is read by its whole coordinate and the revision it was quoted at', withContext.get('threadId') === 'thread a' && withContext.get('messageId') === 'm#1' && withContext.get('contentRevision') === 'rev1' && withContext.get('contextCount') === '2');
ok('…with its text and what follows only when asked', !bare.has('contextCount') && bare.get('contentRevision') === 'rev1');
await reader.listMatters('入库 & 导读');
await reader.readMatter('m 1');
ok('matters: the directory with a filter, a page by its id', new URL('http://x/' + of('/api/memory/matters')[0].search).searchParams.get('query') === '入库 & 导读' && of('/api/memory/matters/m%201').length === 1);
ok('one session serves all of these', issued === 1 && of('/api/session').length === 1, String(issued));
seen.length = 0;
await reader.connect('/vault');
await reader.postMessage({ threadId: 't1', content: '一句话', key: K }).catch(() => {});
ok('the cookie goes on these reads only: not on the roster, not on a sent message', seen.length > 0 && seen.every((r) => r.headers.Cookie === undefined), JSON.stringify(seen.map((r) => [r.path, r.headers.Cookie])));

valid = 2;  // the cafe restarted: it no longer knows the first session
seen.length = 0;
const afterRestart = await within(reader.searchMessages('再搜'), 600);
ok('a session the cafe no longer knows is asked for again, once, and the read then answers', afterRestart.settled && !afterRestart.error && issued === 2 && of('/api/evidence/search').length === 2, JSON.stringify({ afterRestart, issued }));
valid = 99;  // refused whatever the session: this is not a direct request from the cafe's own computer
seen.length = 0;
const notLocal = await failed(reader.searchMessages('三搜'));
ok('refused again with a fresh session: only on the cafe\'s own computer, and it stops there', notLocal.memory === 'local' && of('/api/evidence/search').length === 2 && of('/api/session').length === 1, JSON.stringify({ notLocal, n: seen.length }));
answers.set('/api/session', () => ({ json: { userId: 'unpaired-user', csrfToken: 'x' }, headers: { 'set-cookie': ['cat_cafe_session=lan; Path=/'] } }));
const lan = new CatCafeClient('http://192.168.1.9:3004');
seen.length = 0;
const unpaired = await failed(lan.searchMessages('x'));
ok('a cafe that gives an unpaired session is not asked for anything more', unpaired.memory === 'local' && of('/api/evidence/search').length === 0);

answers.set('/api/session', session);
valid = issued + 1;
const fresh = () => { const c = new CatCafeClient('http://localhost:3004'); c.timeouts = { read: 80, send: 80, search: 120, probe: 80 }; valid = issued + 1; return c; };
answers.set('/api/evidence/search', { status: 404, json: { message: 'Route GET:/api/evidence/search not found', error: 'Not Found', statusCode: 404 } });
ok('a cafe without the route: unsupported', (await failed(fresh().searchMessages('x'))).memory === 'unsupported');
answers.set('/api/evidence/navigation-source', { status: 404, json: { error: 'Source unavailable' } });
ok('a message the cafe no longer gives: gone, not unsupported', (await failed(fresh().readSource({ threadId: 't', messageId: 'm' }))).memory === 'gone');
answers.set('/api/evidence/navigation-source', { status: 403, json: { error: 'Source is not accessible' } });
ok('a message the user may no longer read: gone', (await failed(fresh().readSource({ threadId: 't', messageId: 'm' }))).memory === 'gone');
answers.set('/api/memory/matters/m%201', { status: 404, json: { error: 'not_available', message: 'This page or source is not currently available to this reader.' } });
ok('a matter page no longer available: gone', (await failed(fresh().readMatter('m 1'))).memory === 'gone');
answers.set('/api/evidence/search', { status: 503, json: { error: 'Message search unavailable', degraded: true, degradeReason: 'message_search_timeout' } });
const busy = await failed(fresh().searchMessages('x'));
ok('a search the cafe could not finish: unavailable, with its word for it', busy.memory === 'unavailable' && /Message search unavailable/.test(busy.message), JSON.stringify(busy));
answers.set('/api/evidence/search', 'hang');
const silent = await within(failed(fresh().searchMessages('x')), 600);
ok('a search never answered ends at the search time limit, as unavailable', silent.settled && silent.value.memory === 'unavailable' && /没有回应/.test(silent.value.message), JSON.stringify(silent));
answers.set('/api/session', { status: 404, json: { error: 'Not Found' } });
const old2 = fresh();
ok('a cafe with no session route: unsupported', (await failed(old2.searchMessages('x'))).memory === 'unsupported');
answers.set('/api/session', session);
answers.set('/api/evidence/search', guarded({ results: [], meta: {} }));
valid = issued + 1;
const recovered = await within(old2.searchMessages('x'), 600);
ok('…and a session that could not be had is asked for again the next time', recovered.settled && !recovered.error, JSON.stringify(recovered));

console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
process.exitCode = fail ? 1 : 0;
