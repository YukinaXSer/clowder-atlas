// Calls the production client/view with a simulated Cafe; native Obsidian covers the rendered controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const routes = new Map(), seen = [], notices = [];
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class { constructor(s) { notices.push(s); } },
  requestUrl: async o => {
    const u = new URL(o.url), key = `${o.method} ${u.pathname}`;
    seen.push({ key, cookie: o.headers.Cookie, body: o.body && JSON.parse(o.body) });
    const handler = routes.get(key);
    const response = typeof handler === 'function' ? await handler(o) : handler;
    return { status: 200, json: {}, headers: {}, ...(response || { status: 404, json: { error: 'Not Found' } }) };
  } };
const box = { module: { exports: {} }, require: () => host, URL, console, setTimeout, clearTimeout, setInterval, clearInterval, crypto };
vm.runInNewContext(fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8') + '\nmodule.exports.t={CatCafeClient,CafeChatView};', box);
const { CatCafeClient, CafeChatView } = box.module.exports.t;
const T = 'thread a', E = '/api/threads/thread%20a/executions/active', Q = '/api/threads/thread%20a/queue';
const live = (catId, id = 'ex-' + catId, threadId = T) => ({ threadId, catId, executionId: id, turnInvocationId: 'turn-' + id, kind: 'live_invocation',
  cancelability: { state: 'cancelable', target: { kind: 'live_invocation', threadId, catId, executionId: id } } });
function setup(executions = []) {
  routes.clear(); seen.length = 0;
  routes.set('GET /api/session', { json: { userId: 'default-user' }, headers: { 'set-cookie': 'cat_cafe_session=synthetic; Path=/' } });
  routes.set('GET ' + E, { json: { executions } });
  routes.set('GET ' + Q, { json: { queue: [], activeInvocations: [] } });
  routes.set('DELETE ' + Q, { json: { queue: [], cleared: [] } });
  return new CatCafeClient('http://fake.invalid', { read: 80, send: 80, search: 80 });
}
const mutations = () => seen.filter(r => !r.key.startsWith('GET'));
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('PASS ' + name); } catch(e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }

await test('a bubble stop cancels only its cat, with session and exact child identity', async () => {
  const c = setup([live('a'), live('b'), live('a', 'foreign', 'another-thread')]);
  routes.set('POST /api/threads/thread%20a/executions/live/ex-a/cancel', {});
  await c.stopCatReply(T, 'a');
  assert.equal(mutations().length, 1);
  assert.equal(mutations()[0].key, 'POST /api/threads/thread%20a/executions/live/ex-a/cancel');
  assert.deepEqual(mutations()[0].body, { catId: 'a', expectedInvocationId: 'turn-ex-a' });
  assert.equal(mutations()[0].cookie, 'cat_cafe_session=synthetic');
});
await test('an expired session is refreshed once for a stop, without an extra mutation', async () => {
  const c = setup([live('a')]); let n = 0;
  routes.set('GET ' + E, () => ++n === 1 ? { status: 401, json: { error: 'Identity required' } } : { json: { executions: [live('a')] } });
  routes.set('POST /api/threads/thread%20a/executions/live/ex-a/cancel', {});
  await c.stopCatReply(T, 'a');
  assert.equal(seen.filter(r=>r.key==='GET /api/session').length, 2); assert.equal(mutations().length, 1);
});
await test('an already ended exact execution converges without canceling its replacement by cat', async () => {
  const c = setup([live('a')]);
  routes.set('POST /api/threads/thread%20a/executions/live/ex-a/cancel', { status: 409, json: { error: 'replaced', code: 'EXECUTION_REPLACED' } });
  await c.stopCatReply(T, 'a'); assert.equal(mutations().length, 1);
});
await test('a pre-start/older server uses cat cancel; CAT_NOT_ACTIVE is harmless', async () => {
  const c = setup(); routes.set('GET ' + E, { status: 404, json: { error: 'Not Found' } });
  routes.set('POST /api/threads/thread%20a/cancel/a', { status: 404, json: { error: '该猫当前未在执行', code: 'CAT_NOT_ACTIVE' } });
  await c.stopCatReply(T, 'a'); assert.equal(mutations().length, 1);
});
await test('a thread-not-found error is not silently treated as an old server', async () => {
  const c = setup(); routes.set('GET ' + E, { status: 404, json: { error: 'Thread not found', code: 'THREAD_NOT_FOUND' } });
  await assert.rejects(c.stopCatReply(T, 'a'), /Thread not found/); assert.equal(mutations().length, 0);
});
await test('a noncancelable/foreign cat cannot be reached through legacy fallback', async () => {
  const a = live('a'); a.cancelability = { state: 'not_cancelable', reason: 'foreign_principal' };
  const c = setup([a]); await assert.rejects(c.stopCatReply(T, 'a')); assert.equal(mutations().length, 0);
});
await test('thread stop drains waiting work before canceling live work, filtered to this thread', async () => {
  const managed = { threadId: T, catId: 'm', kind: 'managed_command', cancelability: { state: 'cancelable', target: { kind: 'managed_command', taskId: 'job/a' } } };
  const c = setup([live('a'), live('x', 'foreign', 'other'), managed]);
  routes.set('POST /api/threads/thread%20a/executions/live/ex-a/cancel', {});
  routes.set('DELETE /api/callbacks/hold-ball/job%2Fa', {});
  routes.set('POST /api/threads/thread%20a/cancel/b', {});
  await c.stopThreadReplies(T, ['a','b','b']);
  assert.equal(mutations()[0].key, 'DELETE ' + Q);
  assert.deepEqual(mutations().map(r=>r.key).sort(), ['DELETE ' + Q, 'DELETE /api/callbacks/hold-ball/job%2Fa',
    'POST /api/threads/thread%20a/executions/live/ex-a/cancel','POST /api/threads/thread%20a/cancel/b'].sort());
});
await test('queue failure is surfaced while the remaining live cats are still stopped', async () => {
  const c = setup([live('a'),live('b')]);
  routes.set('DELETE ' + Q, { status: 503, json: { error: 'queue still contains work' } });
  routes.set('POST /api/threads/thread%20a/executions/live/ex-a/cancel', { status: 503, json: { error: 'provider busy' } });
  routes.set('POST /api/threads/thread%20a/executions/live/ex-b/cancel', {});
  await assert.rejects(c.stopThreadReplies(T), /queue still contains work/);
  assert(mutations().some(r=>r.key.endsWith('ex-b/cancel')));
});
await test('a replaced connection starts no stop request, including after session was awaited', async () => {
  const c=setup([live('a')]); let release;
  routes.set('GET /api/session', () => new Promise(r=>{ release=()=>r({ json:{userId:'default-user'},headers:{} }); }));
  const pending=c.stopCatReply(T,'a'); await new Promise(r=>setTimeout(r,0)); c.destroy(); release();
  await assert.rejects(pending); assert.equal(mutations().length,0);
});
await test('all send surfaces record awaiting targets immediately on acceptance, before any reply exists', async () => {
  const c=setup(); routes.set('POST /api/messages', {json:{entries:[{targetCatId:'a'},{targetCatId:'b'}],userMessageId:'u1'}});
  await c.postMessage({threadId:T,content:'question'});
  assert.deepEqual(Array.from(c.pendingReplyCats(T)).sort(),['a','b']);
  assert.equal(c.pendingReplyCats('other').length,0);
});
await test('authoritative empty execution/queue refresh settles awaiting hints and never alters text', async () => {
  const c=setup(); routes.set('POST /api/messages', {json:{entries:[{targetCatId:'a'}],userMessageId:'u1'}});
  await c.postMessage({threadId:T,content:'question'}); await c.readReplyActivity(T);
  assert.equal(c.pendingReplyCats(T).length,0);
});
await test('an older Cafe still settles awaiting state from its authoritative queue/active-invocation read', async () => {
  const c=setup(); routes.set('GET '+E,{status:404,json:{error:'Not Found'}});
  routes.set('POST /api/messages',{json:{entries:[{targetCatId:'a'}]}});
  await c.postMessage({threadId:T,content:'question'}); await c.readReplyActivity(T);
  assert.equal(c.pendingReplyCats(T).length,0);
});
await test('managed-command cancellation is not followed by a broad legacy cat cancellation', async () => {
  const managed={threadId:T,catId:'a',kind:'managed_command',cancelability:{state:'cancelable',target:{kind:'managed_command',taskId:'job'}}};
  const c=setup([managed]);routes.set('DELETE /api/callbacks/hold-ball/job',{});
  await c.stopThreadReplies(T,['a']);
  assert.equal(mutations().length,2); assert(!mutations().some(r=>r.key.includes('/cancel/a')));
});
await test('a send accepted during an activity read is not cleared by the older empty snapshot', async () => {
  const c=setup(); let release;
  routes.set('GET ' + E, ()=>new Promise(r=>{release=()=>r({json:{executions:[]}});}));
  const p=c.readReplyActivity(T); await new Promise(r=>setTimeout(r,0));
  routes.set('POST /api/messages',{json:{entries:[{targetCatId:'a'}],userMessageId:'u2'}});
  await c.postMessage({threadId:T,content:'new question'}); release(); await p;
  assert.deepEqual(Array.from(c.pendingReplyCats(T)),['a']);
});
await test('a late processing poll cannot overwrite the canceled reply loaded after Stop', async () => {
  const c=setup(); let release,reads=0;
  c._fetch=async()=>{if(++reads===1)return new Promise(r=>{release=r;});return {messages:[{id:'r1',content:'half',lifecycle:{kind:'response',status:'canceled'}}]};};
  const v=new CafeChatView(null,{cafeClient:c,isCafeConnected:true});v._threadId=T;v._renderMessages=()=>{};v._readActivity=async()=>{};
  const old=v._pollNewMessages();await new Promise(r=>setTimeout(r,0));await v._loadMessages();
  release({messages:[{id:'r1',content:'half',lifecycle:{kind:'response',status:'processing'}}]});await old;
  assert.equal(v._messages[0].lifecycle.status,'canceled');
});
await test('the matching reply takes over awaiting state, while an older reply cannot settle a new send', async () => {
  const c=setup();routes.set('POST /api/messages',{json:{entries:[{targetCatId:'a'}],userMessageId:'u-new'}});
  await c.postMessage({threadId:T,content:'question'});
  const old={catId:'a',content:'earlier answer',lifecycle:{kind:'response',status:'completed',inputMessageIds:['u-old']}};
  c.observeReplyMessages(T,[old]);assert.equal(c.pendingReplyCats(T).length,1);
  const reply={catId:'a',content:'partial answer',lifecycle:{kind:'response',status:'processing',inputMessageIds:['u-new']}};
  c.observeReplyMessages(T,[old,reply]);assert.equal(c.pendingReplyCats(T).length,0);assert.equal(reply.content,'partial answer');
  await c.postMessage({threadId:T,content:'same question'});
  routes.set('POST /api/messages',{json:{entries:[{targetCatId:'b'}],userMessageId:'u-next'}});
  await c.postMessage({threadId:T,content:'follow-up'});c.observeReplyMessages(T,[reply]);
  assert.deepEqual(Array.from(c.pendingReplyCats(T)),['b']);
});
console.log(JSON.stringify({pass,fail})); process.exitCode=fail?1:0;
