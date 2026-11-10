// 0.8.14 passage helpers, run on the plugin's own main.js in a sandbox (no Obsidian, no network): the 修改稿 block
// extractor, fence length, line labels, offset/position mapping, where a passage is now (or why it cannot be found),
// and the request text. Usage: node u1-passage-helpers.mjs [plugin-directory]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = process.argv[2] || path.resolve(here, '..');
const src = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, requestUrl: async () => ({}) };
const box = { module: { exports: {} }, require: (n) => { if (n === 'obsidian') return host; throw Error(n); }, console, URL, Set, Map, setTimeout, clearTimeout, setInterval() {}, clearInterval() {} };
vm.runInNewContext(src + '\nmodule.exports.t={passageLines,passageFence,extractRevision,offsetOfPos,posOfOffset,locatePassage,passageMessage,passageShown,seminarThreadTitle,threadTitle};', box);
const t = box.module.exports.t; let fail = 0;
const ok = (name, cond, extra='') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fail++; };
ok('lines: single', t.passageLines({ from: { line: 2, ch: 0 }, to: { line: 2, ch: 5 } }) === '第 3 行');
ok('lines: range', t.passageLines({ from: { line: 2, ch: 1 }, to: { line: 4, ch: 3 } }) === '第 3–5 行');
ok('lines: ends at line start', t.passageLines({ from: { line: 2, ch: 0 }, to: { line: 5, ch: 0 } }) === '第 3–5 行');
ok('fence: plain', t.passageFence('abc') === '```');
ok('fence: longer than inner', t.passageFence('x ```js\ncode\n``` y') === '````');
const reply = '我改了措辞：\n\n```修改稿\n新的第一句。\n新的第二句。\n```\n\n理由：更短。';
ok('extract: basic', t.extractRevision(reply) === '新的第一句。\n新的第二句。', JSON.stringify(t.extractRevision(reply)));
ok('extract: none', t.extractRevision('没有修改稿') === null);
ok('extract: last of two', t.extractRevision('```修改稿\nA\n```\n中间\n```修改稿\nB\n```') === 'B');
ok('extract: 4-backtick with inner fence', t.extractRevision('````修改稿\n前\n```js\nx\n```\n后\n````') === '前\n```js\nx\n```\n后');
ok('extract: tildes', t.extractRevision('~~~修改稿\nT\n~~~') === 'T');
ok('extract: other lang ignored', t.extractRevision('```js\nnot it\n```') === null);
const doc = '第一行\n第二行要改\n第三行\n第二行要改\n';
ok('offset/pos roundtrip', JSON.stringify(t.posOfOffset(doc, t.offsetOfPos(doc, { line: 1, ch: 2 }))) === JSON.stringify({ line: 1, ch: 2 }));
ok('locate: at its place', t.locatePassage(doc, { from: { line: 1, ch: 0 }, original: '第二行要改' }).offset === 4);
ok('locate: moved, twice → refuse', t.locatePassage('插入\n' + doc, { from: { line: 1, ch: 0 }, original: '第二行要改' }).offset === -1);
ok('locate: moved, once → found', t.locatePassage('插入\n第一行\n独特的句子\n', { from: { line: 5, ch: 0 }, original: '独特的句子' }).offset === 7);
ok('locate: gone', /找不到原文/.test(t.locatePassage(doc, { from: { line: 1, ch: 0 }, original: '不存在' }).reason));
const p = { basename: '笔记', text: '原文```x```', from: { line: 0, ch: 0 }, to: { line: 0, ch: 9 } };
const msg = t.passageMessage(p, '');
ok('message: no words → asks what the cats make of it, with a 修改稿 block on a 4-backtick fence', msg.includes('请看看这段') && msg.includes('````修改稿') && msg.includes('````\n原文```x```\n````'), msg.slice(0, 80));
const asked = t.passageMessage({ ...p, text: '一段' }, '帮我改得更简洁');
ok('message: the user\'s words decide (discuss or revise), with where a revision goes', asked.includes('帮我改得更简洁') && asked.includes('修改稿') && asked.includes('只是讨论的话'));
ok('shown', t.passageShown(p, '问') === '选段 · 《笔记》第 1 行\n问');
// 0.0.3 a seminar's new conversation: its temporary title says what the seminar is about
const st = t.seminarThreadTitle;
ok('seminar title: passage, with its lines', st({ passage: { basename: '笔记', from: { line: 2, ch: 0 }, to: { line: 4, ch: 3 } }, noteName: '别的', topic: '议题' }) === '研讨会 · 《笔记》第 3–5 行');
ok('seminar title: the note sent with it', st({ noteName: '记忆框架', topic: '议题' }) === '研讨会 · 《记忆框架》');
const fromTopic = st({ topic: '  请从各自专长\n审阅这份方案的盲区与风险，并给出具体改进建议，越具体越好  ' });
ok('seminar title: else the start of the topic, on one line, clipped', fromTopic.startsWith('研讨会 · 请从各自专长 审阅') && fromTopic.endsWith('…') && Array.from(fromTopic.slice('研讨会 · '.length)).length === 30, fromTopic);
ok('seminar title: nothing to go on', st({}) === '研讨会' && st({ topic: '   ' }) === '研讨会');
const longName = '🐱'.repeat(60);
const clipped = st({ noteName: longName });
ok('seminar title: a long name is clipped whole characters (no broken emoji), within the cafe\'s 200', clipped === `研讨会 · 《${'🐱'.repeat(39)}…》` && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(clipped) && clipped.length <= 200, clipped);
// 0.0.5 + 新开对话: the same naming, with its own label
ok('new conversation title: the passage at hand', t.threadTitle('新对话', { passage: { basename: 'B笔记', from: { line: 2, ch: 0 }, to: { line: 2, ch: 9 } } }) === '新对话 · 《B笔记》第 3 行');
ok('new conversation title: else the note being read, else the label alone', t.threadTitle('新对话', { noteName: 'B笔记' }) === '新对话 · 《B笔记》' && t.threadTitle('新对话', {}) === '新对话');
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
process.exitCode = fail ? 1 : 0;
