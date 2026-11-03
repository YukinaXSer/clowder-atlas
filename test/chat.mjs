// 0.0.4 chat helpers, run on the plugin's own main.js in a sandbox (no Obsidian, no network): the key that decides
// whether a read of the conversation shows anything new. A cat's reply is admitted empty, grows in place and settles
// with the same id, so its words and state count, not only new messages. Usage: node test/chat.mjs [plugin-directory]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = process.argv[2] || path.resolve(here, '..');
const src = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, requestUrl: async () => ({}) };
const box = { module: { exports: {} }, require: (n) => { if (n === 'obsidian') return host; throw Error(n); }, console, URL, Set, Map, setTimeout, clearTimeout, setInterval() {}, clearInterval() {} };
vm.runInNewContext(src + '\nmodule.exports.t={messagesKey};', box);
const { messagesKey: key } = box.module.exports.t; let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fail++; };
const user = { id: 'u1', type: 'user', content: '这段逻辑通吗？', lifecycle: { kind: 'input' } };
const reply = (content, status, extra = {}) => ({ id: 'r1', type: 'assistant', catId: 'opus', content, lifecycle: { kind: 'response', status, startedAt: 1 }, ...extra });
const admitted = [user, reply('', 'processing')];
ok('the same messages give the same key', key(admitted) === key(structuredClone(admitted)));
ok('a reply admitted empty, then its first words: a change', key(admitted) !== key([user, reply('通的', 'processing', { isDraft: true })]));
ok('the words growing: a change', key([user, reply('通的', 'processing', { isDraft: true })]) !== key([user, reply('通的，不过', 'processing', { isDraft: true })]));
ok('the same words, settled as completed: a change', key([user, reply('通的。', 'processing', { isDraft: true })]) !== key([user, reply('通的。', 'completed')]));
ok('ended short (interrupted): a change', key([user, reply('通的', 'completed')]) !== key([user, reply('通的', 'interrupted')]));
ok('a new message: a change', key(admitted) !== key([...admitted, { id: 'u2', type: 'user', content: '再问一个' }]));
ok('what the chat does not show (tool events, thinking, a reply preview) is no change',
  key([user, reply('通的', 'completed')]) === key([user, reply('通的', 'completed', { toolEvents: [{ id: 't' }], thinking: '…', replyPreview: { id: 'u1' } })]));
ok('no messages, and a message without content or lifecycle (an older one), have keys', typeof key([]) === 'string' && typeof key([{ id: 'old' }]) === 'string' && key([]) !== key([{ id: 'old' }]));
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
process.exitCode = fail ? 1 : 0;
