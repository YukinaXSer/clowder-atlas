// Display grammar and DOM safety, independent of Obsidian and network. Native layout is exercised separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} };
const box = { module: { exports: {} }, require: () => host, URL, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.runInNewContext(src + '\nmodule.exports.t={parseChatBlocks,chatVisibleBlocks,renderChatFormattedContent,renderChatInline,extractRevision};', box);
const { parseChatBlocks: parse, chatVisibleBlocks: visible, renderChatFormattedContent: render, renderChatInline: inline, extractRevision } = box.module.exports.t;
class Node {
  constructor(tag = '', text = '') { this.tagName = tag; this.children = []; this.attributes = {}; this.ownText = text; this.ownerDocument = doc; this.style = {}; }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(key, value) { this.attributes[key] = value; }
  set textContent(text) { this.children = []; this.ownText = text; }
  get textContent() { return this.ownText + this.children.map(n => n.textContent).join(''); }
}
const doc = { createElement: tag => new Node(tag), createTextNode: text => new Node('', text) };
const all = (n, predicate) => [n, ...n.children.flatMap(c => all(c, predicate))].filter(predicate);
const cls = (n, c) => all(n, x => (x.className || '').split(' ').includes(c));
const show = text => { const n = new Node('div'); render(n, parse(text)); return n; };
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('PASS ' + name); };
test('headings, hanging lists and lead keys replace bare syntax', () => {
  const n = show('### 章节\n\n#### 1. 冥想盆\n- **灵感来源**：旧讨论\n  - 第二层\n    1. 第三层');
  assert.equal(cls(n, 'atlas-chat-h-section').length, 1); assert.equal(cls(n, 'atlas-chat-h-sub').length, 1);
  assert.equal(cls(n, 'atlas-chat-lead-key')[0].textContent, '灵感来源');
  assert.equal(cls(n, 'atlas-chat-li').length, 3); assert(!n.textContent.includes('####')); assert(!n.textContent.includes('**'));
});
test('inline strong/em/code/citation/wiki aliases have distinct nodes', () => {
  const n = show('**重点**、*斜体*、`0.0.8` [#12] [[path/笔记|别名]]');
  for (const c of ['strong','em','inline-code','ref-badge','wikilink']) assert.equal(cls(n, 'atlas-chat-' + c).length, 1);
  assert(n.textContent.includes('「别名」'));
});
test('escapes and unmatched delimiters stay literal; code takes precedence', () => {
  const n = show('\\*字面\\* **未闭合\n\n``a ` b`` `**原样** [#1]`');
  assert(n.textContent.includes('*字面* **未闭合')); assert(n.textContent.includes('a ` b'));
  assert(n.textContent.includes('**原样** [#1]')); assert.equal(cls(n, 'atlas-chat-ref-badge').length, 0);
});
test('multiplication and file-name underscores are not italic syntax', () => {
  const n = show('2*3*4 = 24; a_b_c; 甲*乙*丙'); assert.equal(cls(n, 'atlas-chat-em').length, 0);
});
test('heading hashes inside a word are not stripped as closing markers', () => {
  const n = show('### C#\n\n### 标题 ###'); assert(n.textContent.startsWith('C#')); assert(n.textContent.endsWith('标题'));
});
test('bold and italic can nest and code does not close surrounding emphasis', () => {
  const n = show('**重点 *斜体***；*斜体 **重点***；**先看 `**` 再说**');
  assert.equal(cls(n, 'atlas-chat-strong').length, 3); assert.equal(cls(n, 'atlas-chat-em').length, 2);
  assert.equal(n.textContent, '重点 斜体；斜体 重点；先看 ** 再说');
});
test('table cells respect escaped pipes and pipes in code', () => {
  const n = show('| 名称 | 内容 |\n| :--- | ---: |\n| a\\|b | `x|y` [#1] |');
  assert.equal(cls(n, 'atlas-chat-table').length, 1); assert.equal(all(n, x => x.tagName === 'td').length, 2);
  assert(n.textContent.includes('a|b')); assert(n.textContent.includes('x|y'));
});
test('ordinary fences preserve code and require a matching closing run', () => {
  const n = show('````js\n**literal**\n```\nstill code\n````');
  assert.equal(cls(n, 'atlas-chat-codeblock').length, 1); assert(n.textContent.includes('```\nstill code'));
  assert.equal(cls(n, 'atlas-chat-strong').length, 0);
});
test('an unfinished streaming fence stays a whole literal code block', () => {
  const n = show('```js\n<img src=x onerror=alert(1)>');
  assert.equal(all(n, x => x.tagName === 'img').length, 0); assert(n.textContent.includes('<img'));
});
test('revision cards format their body without changing revision extraction', () => {
  const raw = '说明\n\n```修改稿\n**修改后** [#1]\n```';
  const n = show(raw); assert.equal(cls(n, 'atlas-chat-revision-card').length, 1);
  assert.equal(extractRevision(raw), '**修改后** [#1]'); assert.equal(cls(n, 'atlas-chat-strong').length, 1);
});
test('an earlier revision card never promises the last revision action', () => {
  const n = new Node('div'); render(n, parse('```修改稿\n旧稿\n```\n\n```修改稿\n新稿\n```'), { activeRevision: '新稿', revisionHint: '复制最后一稿' });
  const hints = cls(n, 'atlas-chat-revision-hint'); assert(hints[0].textContent.includes('最后一份')); assert.equal(hints[1].textContent, '复制最后一稿');
});
test('quotes, rules and soft line breaks stay distinguishable', () => {
  const n = show('> **原话**\n> 下一行\n\n---\n\n正文\n续行');
  assert.equal(cls(n, 'atlas-chat-quote').length, 1); assert.equal(all(n, x => x.tagName === 'hr').length, 1);
  assert(n.textContent.includes('正文\n续行'));
});
test('HTML and dangerous links create no executable DOM or network resource', () => {
  const n = show('<script>alert(1)</script> <img src=x onerror=alert(1)> [点我](javascript:alert(1)) [数据](data:text/html,hi)');
  assert.equal(all(n, x => ['script','img','iframe','a'].includes(x.tagName)).length, 0);
  assert(n.textContent.includes('<script>')); assert(n.textContent.includes('javascript:'));
});
test('web links retain their balanced parentheses and isolate the new window', () => {
  const n = show('[文档 **重点**](https://example.test/a_(b))'); const a = all(n, x => x.tagName === 'a')[0];
  assert.equal(a.attributes.href, 'https://example.test/a_(b)'); assert.equal(a.attributes.rel, 'noopener noreferrer');
});
test('block folding keeps whole strong/table/fence blocks and can show everything', () => {
  const text = '段'.repeat(590) + '\n\n**' + '整'.repeat(100) + '**\n\n```js\n' + '码'.repeat(200) + '\n```\n\n结束';
  const blocks = parse(text), folded = visible(blocks, false);
  assert.equal(folded.blocks.length, 2); assert.equal(folded.hiddenCount, 2);
  assert.equal(visible(blocks, true).blocks.length, 4); const n = new Node(); render(n, folded.blocks);
  assert.equal(cls(n, 'atlas-chat-strong')[0].textContent.length, 100);
});
test('one very long block is displayed whole instead of a fake expand control', () => {
  const blocks = parse('x'.repeat(2000)); assert.equal(visible(blocks, false).hiddenCount, 0);
});
test('a fold never ends with a heading whose first body is hidden', () => {
  const blocks = parse('段'.repeat(590) + '\n\n### 标题\n\n正文\n\n' + '尾'.repeat(300));
  const v = visible(blocks, false); assert(v.blocks.at(-1).type !== 'heading');
});
console.log('ALL PASS ' + pass);
