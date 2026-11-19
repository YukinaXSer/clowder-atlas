// 0.0.8 cafe citations, run on the plugin's own main.js in a sandbox (no Obsidian, no network): what a quote from the
// cafe is, how a message carries it, what a request and a note keep of it, and when it may be sent.
// Usage: node test/citations.mjs [plugin-directory]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = process.argv[2] || path.resolve(here, '..');
const src = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
const notices = [];
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class { constructor(s) { notices.push(s); } }, requestUrl: async () => ({}) };
const box = { module: { exports: {} }, require: (n) => { if (n === 'obsidian') return host; throw Error(n); }, console: { ...console, log() {}, warn() {} }, URL, Set, Map, setTimeout, clearTimeout, setInterval() {}, clearInterval() {}, crypto };
vm.runInNewContext(src + '\nmodule.exports.t={normalizeCitations,sameCitation,citationCoordinates,cafeEvidence,citedParagraph,groupSameHits,messageCitation,matterCitation,citedMessage,citedShown,extractRevision,markdownLiteral,DEFAULT_SETTINGS,CafeMemoryModal};', box);
const Plugin = box.module.exports, t = Plugin.t; let fail = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? '  — ' + detail : ''}`); if (!cond) fail++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CAFE = 'http://localhost:3004';
const REV = 'a'.repeat(64);
const quote = (over = {}) => ({ type: 'message', ref: 'thread_a#0001-m1', cafe: CAFE, version: REV, label: '「记忆讨论」· 宪宪 · 2026-11-18', text: '遗忘不是删除，是降低被想起的机会。', ...over });
const matter = (over = {}) => ({ type: 'matter', ref: 'matter:m-1', cafe: CAFE, version: 'rev:2', label: '「解读后主动入库」', text: '本页只适用于记忆研究专题。', ...over });
const note = (p, text, line = 0) => ({ path: p, basename: p.split('/').pop().replace(/\.md$/, ''), text, from: { line, ch: 0 }, to: { line, ch: text.length } });

// 1. What counts as a citation
ok('a message coordinate is thread#message, whole', same(t.citationCoordinates('message', 'thread_a#0001-m1'), { threadId: 'thread_a', messageId: '0001-m1' }));
ok('a matter coordinate is matter:<id>', same(t.citationCoordinates('matter', 'matter:m-1'), { matterId: 'm-1' }));
ok('anything else is not a cafe coordinate', [['message', 'thread_a'], ['message', '#m'], ['message', 't#'], ['matter', 'm-1'], ['matter', 'matter:'], ['thread', 't#m'], ['paper', 'arxiv:1'], ['message', null]].every(([type, ref]) => t.citationCoordinates(type, ref) === null));
const kept = t.normalizeCitations([quote(), matter(), null, {}, quote({ text: '' }), quote({ cafe: '' }), quote({ version: '' }), quote({ ref: 'nowhere' }), note('a.md', '一段笔记'), quote({ type: 'event', ref: 'event:1' })]);
ok('only whole citations are kept: words, cafe, version and a coordinate (a note passage is not one)', kept.length === 2, JSON.stringify(kept));
ok('the same words from the same place are one quote; other words of that message are another', t.sameCitation(quote(), quote({ label: '别的标签' })) && !t.sameCitation(quote(), quote({ text: '另一句' })) && !t.sameCitation(quote(), quote({ cafe: 'http://other' })));

// 2. The part of a message quoted by default: the paragraph the hit is in, an exact part of the message
const body = '开头一段，和搜索无关。\n\n第二段先讲背景。遗忘机制在这里被提到，\n这一行还属于第二段。\n\n第三段是别的话题。';
const snippet = '先讲背景。遗忘机制在这里被提到，\n这一行';
const para = t.citedParagraph(body, snippet, [{ start: snippet.indexOf('遗忘机制'), end: snippet.indexOf('遗忘机制') + 4 }]);
ok('the paragraph around the hit, not the whole message', para.text === '第二段先讲背景。遗忘机制在这里被提到，\n这一行还属于第二段。', JSON.stringify(para));
ok('…as an exact part of the message', body.slice(para.start, para.end) === para.text);
const long = `${'铺垫。'.repeat(900)}关键词在很长的一段里。${'后续。'.repeat(900)}`;
const clipped = t.citedParagraph(long, '关键词在很长的一段里。', [{ start: 0, end: 3 }]);
ok('a very long paragraph gives 1,500 characters around the hit', clipped.text.length === 1500 && clipped.text.includes('关键词在很长的一段里。') && long.slice(clipped.start, clipped.end) === clipped.text, String(clipped.text.length));
const pairs = t.citedParagraph(`${'\u{1F4D8}'.repeat(900)}词${'\u{1F4D8}'.repeat(900)}`, '词', [{ start: 0, end: 1 }]);
ok('…and never half of a two-unit character at its ends', !/^[\uDC00-\uDFFF]/.test(pairs.text) && !/[\uD800-\uDBFF]$/.test(pairs.text) && pairs.text.includes('词'), String(pairs.text.length));
const attached = t.citedParagraph('正文里没有这句。', '只在附件里的命中', [{ start: 0, end: 2 }]);
ok('a hit that is not in the message text (an attachment, a card) is quoted as the hit itself', attached.text === '只在附件里的命中' && attached.start === -1);

// 3. The same words found in several messages are one entry
const hit = (id, at, text, more = {}) => ({ threadId: 'thread_a', messageId: id, threadTitle: '记忆讨论', speaker: 'opus', timestamp: at, snippet: { text, start: 0, end: text.length, source: 'body' }, highlights: [{ start: text.indexOf('遗忘'), end: text.indexOf('遗忘') + 2 }], contentRevision: REV, publiclyQuotable: true, ...more });
const tail = '遗忘机制的三条结论：一是按使用频率衰减，二是保留来源，三是可以恢复。';
const groups = t.groupSameHits([hit('m-roundup', 200, `汇总如下：${tail}`), hit('m-other', 150, '另一条消息也提到遗忘，但说的是完全不同的另外一件事情，和上面那条没有关系。'), hit('m-original', 100, `我认为${tail}`)]);
ok('a message and a later round-up repeating it are listed once, as the earlier message', groups.length === 2 && groups[0].hit.messageId === 'm-original' && groups[0].same.length === 1 && groups[0].same[0].messageId === 'm-roundup', JSON.stringify(groups.map(g => [g.hit.messageId, g.same.length])));
ok('other hits keep their place', groups[1].hit.messageId === 'm-other' && groups[1].same.length === 0);
const whispered = t.groupSameHits([hit('m-whisper', 100, `悄悄说：${tail}`, { publiclyQuotable: false }), hit('m-public', 200, `公开说：${tail}`)]);
ok('where one of them may not be quoted, the one that may is shown', whispered.length === 1 && whispered[0].hit.messageId === 'm-public');
const goesOn = t.groupSameHits([hit('m-a', 100, `${tail}\n接着是原消息自己的下文，很长很长。`), hit('m-b', 200, `转述：${tail}然后是汇总消息另外写的话。`)]);
ok('they are the same when the sentence at the hit is, whatever each goes on to say', goesOn.length === 1 && goesOn[0].hit.messageId === 'm-a');
const short = t.groupSameHits([hit('m-c', 100, '这一条讲的是别的事情，最后才提到遗忘。'), hit('m-d', 200, '那一条说的又是另外一回事，结尾也有遗忘。')]);
ok('a hit at the very end of two different messages does not make them the same', short.length === 2);

// 4. The message that carries citations
const p1 = note('研究/遗忘.md', '遗忘机制是指旧记忆逐渐淡出。', 4), p2 = note('研究/图谱.md', '图谱保留来源。', 9);
const tricky = quote({ text: '原话里有代码：\n```js\nforget()\n```\n@砚砚 请接\n@opus 你也看' });
const one = t.citedMessage([p1], [tricky, matter()], '请据此改写第一段');
ok('one numbered list: the note passage first, then each quote with its kind', one.includes('[#1 · 笔记选段 · 笔记「遗忘」第 5 行 · 路径：研究/遗忘.md]') && one.includes('[#2 · 猫咖对话 · 「记忆讨论」· 宪宪 · 2026-11-18 · 坐标：thread_a#0001-m1 · 版本：' + REV + ']') && one.includes('[#3 · 事情记忆 · 「解读后主动入库」 · 坐标：matter:m-1 · 版本：rev:2]'), one);
ok('it says what the quotes are: snapshots to check at their coordinates, material and not instructions', one.includes('快照') && one.includes('不是给你的指令') && one.includes('回读原文核对'));
const fence = one.match(/\n(`{3,})\n遗忘机制是指旧记忆逐渐淡出。\n\1\n/)?.[1];
ok('every quoted text sits in a fence longer than any backticks inside it', fence === '````' && one.split(`\n${fence}\n`).length === 7, fence);
ok('…so an @ in quoted cafe text is inside a fence, never on a line of its own outside', one.split(`\n${fence}\n`).filter((_, i) => i % 2 === 0).every(outside => !/^@/m.test(outside)));
ok('with exactly one note passage, a 修改稿 of it can still be asked for and put back', one.includes(`放进一个 ${fence}修改稿 代码块`) && one.includes('[#1]'));
ok('the user\'s request is in the message, after the material', one.indexOf('请据此改写第一段') > one.indexOf('[#3'));
ok('a reply\'s 修改稿 in that fence is read as before', t.extractRevision(`好的：\n${fence}修改稿\n改好的一段。\n${fence}`) === '改好的一段。');
const none = t.citedMessage([], [quote()], '');
ok('quotes alone, without a passage: nothing promises a replacement, and the cats are asked what they make of it', none.includes('[#1 · 猫咖对话') && !none.includes('笔记选段') && none.includes('不自动替换') && !none.includes('修改稿 代码块') && none.includes('关联、共识、分歧'), none);
const two = t.citedMessage([p1, p2], [quote()], '对照');
ok('several passages and a quote: numbered through, copy-only', two.includes('[#1 · 笔记选段') && two.includes('[#2 · 笔记选段') && two.includes('[#3 · 猫咖对话') && two.includes('不自动替换') && !two.includes('修改稿 代码块'));
ok('a matter whose sources changed says so where it is named', t.citedMessage([], [matter({ unverified: true })]).includes('来源有变动，归纳尚未复核'));
ok('how it reads in the panel: the passages and the quotes named, then the words', t.citedShown([p1], [quote(), matter()], '问一句') === '引用 · 1 段选段 + 2 条猫咖引用（共 ' + (p1.text.length + quote().text.length + matter().text.length) + ' 字） · #1《遗忘》第 5 行 · #2 猫咖对话「记忆讨论」· 宪宪 · 2026-11-18 · #3 事情记忆「解读后主动入库」\n问一句', t.citedShown([p1], [quote(), matter()], '问一句'));

// 5. A quote of a message, of a matter
const client = { baseUrl: CAFE, findCat: (id) => (id === 'opus' ? { id, nickname: '宪宪' } : null) };
const made = t.messageCitation(client, '记忆\n讨论', { threadId: 'thread_a', messageId: '0001-m1', speaker: 'opus', timestamp: Date.UTC(2026, 10, 18, 4), contentRevision: REV }, '一句话');
ok('a message quote has its whole coordinate, the revision it was read at, and who said it when', made.ref === 'thread_a#0001-m1' && made.version === REV && made.cafe === CAFE && made.text === '一句话' && /宪宪 · 2026-11-18$/.test(made.label), JSON.stringify(made));
ok('the user is named as the user, a source by its label', t.messageCitation(client, 't', { threadId: 'a', messageId: 'b', speaker: 'user', timestamp: 1, contentRevision: REV }, 'x').label.includes('用户') && t.messageCitation(client, 't', { threadId: 'a', messageId: 'b', speaker: 'connector', speakerLabel: '飞书 · 小明', timestamp: 1, contentRevision: REV }, 'x').label.includes('飞书 · 小明'));
const page = { matter: { matterId: 'm-1', title: '解读后主动入库', description: '归纳全文。范围：只在本专题。', revision: 2, status: 'active' }, entries: [] };
ok('a matter quote is its summary whole, at its revision', same(t.matterCitation(client, page), { type: 'matter', ref: 'matter:m-1', cafe: CAFE, version: 'rev:2', label: '「解读后主动入库」', text: '归纳全文。范围：只在本专题。' }), JSON.stringify(t.matterCitation(client, page)));
ok('…marked when the cafe says its sources have changed', t.matterCitation(client, { ...page, summaryStatus: 'sources_changed' }).unverified === true);

// 6. The basket: quotes are kept apart from note passages, and both count toward one message
const plugin = new Plugin();
plugin.saveData = async (data) => { plugin.saved = JSON.parse(JSON.stringify(data)); };
plugin.app = { workspace: { getLeavesOfType: () => [] } };
plugin.loadData = async () => ({ chatPassages: [p1], chatCitations: [quote(), null, {}, { text: 'x' }] });
await plugin.loadSettings();
ok('what was saved comes back; anything that is not a whole citation is dropped', plugin.chatCitations.length === 1 && plugin.chatPassages.length === 1);
notices.length = 0;
ok('the same quote is not added twice', (await plugin.addChatCitation(quote())) === false && plugin.chatCitations.length === 1 && notices.some(n => n.includes('已在引用篮')));
ok('other words of that message, and a matter, are added', (await plugin.addChatCitation(quote({ text: '另一句原话' }))) === true && (await plugin.addChatCitation(matter())) === true && plugin.chatCitations.length === 3);
ok('quotes are saved under their own key; chatPassages still holds note passages only', plugin.saved.chatCitations.length === 3 && plugin.saved.chatPassages.length === 1 && plugin.saved.chatPassages.every(p => p.path && p.from && p.to));
ok('nothing that is not a citation gets in', (await plugin.addChatCitation({ text: '没有出处的话' })) === false && plugin.chatCitations.length === 3);
await plugin.setChatPassages([note('大.md', '甲'.repeat(60000))]);
notices.length = 0;
ok('a quote that would take the basket past one message is refused, the basket unchanged', (await plugin.addChatCitation(quote({ text: '乙'.repeat(40000) }))) === false && plugin.chatCitations.length === 3 && notices.some(n => n.includes('90,000')));
await plugin.setChatPassages([]);
await plugin.setChatCitations([quote({ text: '丙'.repeat(89990) })]);
ok('…and so is a note passage when quotes already fill it', (await plugin.addChatPassage(note('小.md', '丁'.repeat(100)), false)) === false && plugin.chatPassages.length === 0);
await plugin.setChatCitations([quote(), matter()]);
const sent = plugin.chatCitations;
await plugin.addChatCitation(quote({ text: '发送途中新加的' }));
await plugin.consumeChatCitations(sent);
ok('what was sent leaves the basket; a quote added while it was on its way stays', plugin.chatCitations.length === 1 && plugin.chatCitations[0].text === '发送途中新加的');
ok('a fresh install has an empty basket of quotes', same(t.DEFAULT_SETTINGS.chatCitations, []) && same(t.DEFAULT_SETTINGS.citedFailedSends, []));

// 7. A request keeps where its quotes came from, never their words; a reply finds only its own request's
const q = new Plugin();
q.settings = { revisionTargets: {}, passageRequests: {}, failedSends: [], citedFailedSends: [] };
q.saveData = async (data) => { q.saved = JSON.parse(JSON.stringify(data)); };
q.app = { workspace: { getLeavesOfType: () => [] } };
const reply = (ids, threadId = 't') => ({ threadId, lifecycle: { kind: 'response', inputMessageIds: ids } });
const c1 = quote(), c2 = matter(), c3 = quote({ ref: 'thread_b#0002-m9', label: '「另一场」· 用户 · 2026-11-10', text: '别处的话' });
await q.rememberPassageRequest('one', CAFE, 't', [p1], [c1]);
await q.bindRevisionMessage('one', 'u-one');
ok('one passage with quotes is still one replaceable passage', q.revisionTargetForReply(CAFE, reply(['u-one'])).target?.path === p1.path && q.settings.passageRequests.one === undefined);
ok('…and the request records each quote by coordinate and version, without the words', same(q.settings.revisionTargets.one.citations, [{ type: 'message', ref: c1.ref, cafe: CAFE, version: REV, label: c1.label }]) && !JSON.stringify(q.saved.revisionTargets).includes(c1.text), JSON.stringify(q.settings.revisionTargets.one.citations));
await q.rememberPassageRequest('cited', CAFE, 't', [], [c2, c3]);
await q.bindRevisionMessage('cited', 'u-cited');
const copyOnly = q.revisionTargetForReply(CAFE, reply(['u-cited']));
ok('quotes with no passage: a 修改稿 has nothing to replace, and says why', copyOnly.target === null && copyOnly.reason === 'cited', JSON.stringify(copyOnly));
await q.rememberPassageRequest('multi', CAFE, 't', [p1, p2], [c1]);
await q.bindRevisionMessage('multi', 'u-multi');
ok('several passages with a quote stay copy-only as before', q.revisionTargetForReply(CAFE, reply(['u-multi'])).reason === 'multi');
ok('a reply finds the quotes of the request it answers', same(q.citationsForReply(CAFE, reply(['u-cited']), 't').map(c => c.ref), [c2.ref, c3.ref]));
ok('two requests answered in turn in one conversation do not mix: each reply has its own sources and target', same(q.citationsForReply(CAFE, reply(['u-one']), 't').map(c => c.ref), [c1.ref]) && same(q.citationsForReply(CAFE, reply(['u-cited']), 't').map(c => c.ref), [c2.ref, c3.ref])
  && q.revisionTargetForReply(CAFE, reply(['u-one'])).target?.id === 'one' && q.revisionTargetForReply(CAFE, reply(['u-cited'])).target === null);
ok('a reply answering both names each quote once, and replaces nothing', same(q.citationsForReply(CAFE, reply(['u-one', 'u-multi']), 't').map(c => c.ref), [c1.ref]) && q.revisionTargetForReply(CAFE, reply(['u-one', 'u-multi'])).target === null);
ok('another cafe\'s reply, another conversation\'s, or one naming no request finds none', q.citationsForReply('http://other', reply(['u-cited']), 't').length === 0 && q.citationsForReply(CAFE, reply(['u-cited'], 'elsewhere'), 'elsewhere').length === 0 && q.citationsForReply(CAFE, reply([]), 't').length === 0);
await q.setChatCitations([]);
ok('…whatever the basket holds by then', q.citationsForReply(CAFE, reply(['u-cited']), 't').length === 2);

// 8. A failed send that quotes the cafe is kept under its own key
await q.recordFailedSend({ id: 'plain', cafe: CAFE, threadId: 't', content: '一句话', at: 1, error: 'x' });
await q.recordFailedSend({ id: 'quoting', cafe: CAFE, threadId: 't', content: '带引用', citations: [c1], at: 2, error: 'x' });
ok('it is not in the list the version before these quotes would resend from', same(q.saved.failedSends.map(r => r.id), ['plain']) && same(q.saved.citedFailedSends.map(r => r.id), ['quoting']));
ok('here both are failed sends', same(q.getFailedSends().map(r => r.id), ['plain', 'quoting']));
await q.recordFailedSend({ id: 'quoting', cafe: CAFE, threadId: 't', content: '带引用', citations: [c1], at: 2, error: '又失败了' });
ok('recorded again, it is updated in place', q.getFailedSends().length === 2 && q.getFailedSends()[1].error === '又失败了');
await q.dropFailedSend('quoting');
await q.dropFailedSend('plain');
ok('deleting removes it', q.getFailedSends().length === 0 && q.saved.citedFailedSends.length === 0);

// 9. Before a quote is sent, its original is asked for: readable, unchanged, and of this cafe
const calls = [];
const cafe = (over = {}) => ({ baseUrl: CAFE, connected: true,
  readSource: async (c) => { calls.push(['source', c.threadId, c.messageId, c.version]); return { status: 'available', updated: false }; },
  readMatter: async (id) => { calls.push(['matter', id]); return { matter: { matterId: id, revision: 2, status: 'active' }, entries: [] }; }, ...over });
const refuse = (memory, message = 'x') => async () => { throw Object.assign(new Error(message), { memory }); };
q.cafeClient = cafe();
ok('readable and unchanged: ok, asked at the coordinate and the version it was quoted at', (await q.checkCitation(c1)).state === 'ok' && same(calls.at(-1), ['source', 'thread_a', '0001-m1', REV]));
ok('the original changed since: updated', (await q.checkCitation(c1, cafe({ readSource: async () => ({ status: 'available', updated: true }) }))).state === 'updated');
ok('no longer readable (deleted, or access withdrawn): gone', (await q.checkCitation(c1, cafe({ readSource: refuse('gone') }))).state === 'gone');
const unknown = await q.checkCitation(c1, cafe({ readSource: refuse('unavailable', '猫咖在 15 秒内没有回应') }));
ok('the cafe could not be asked: unknown, with why', unknown.state === 'unknown' && unknown.detail.includes('没有回应'), JSON.stringify(unknown));
calls.length = 0;
ok('a quote from another cafe is not asked of this one', (await q.checkCitation(quote({ cafe: 'http://other' }))).state === 'elsewhere' && calls.length === 0);
ok('not connected: not asked', (await q.checkCitation(c1, cafe({ connected: false }))).state === 'offline');
ok('a matter at the revision quoted: ok', (await q.checkCitation(c2)).state === 'ok' && same(calls.at(-1), ['matter', 'm-1']));
const page2 = (over, top = {}) => cafe({ readMatter: async (id) => ({ matter: { matterId: id, revision: 2, status: 'active', ...over }, entries: [], ...top }) });
ok('a matter revised since: updated', (await q.checkCitation(c2, page2({ revision: 3 }))).state === 'updated');
ok('a matter retired since: gone', (await q.checkCitation(c2, page2({ status: 'retired' }))).state === 'gone');
ok('a matter whose sources changed since it was quoted: updated', (await q.checkCitation(c2, page2({}, { summaryStatus: 'sources_changed' }))).state === 'updated');
ok('…but not when it was quoted already marked so', (await q.checkCitation({ ...c2, unverified: true }, page2({}, { summaryStatus: 'sources_changed' }))).state === 'ok');
ok('all stand: nothing in the way of sending', (await q.citationProblem(cafe(), [c1, c2], 1)) === null);
const stale = await q.citationProblem(cafe({ readMatter: async (id) => ({ matter: { matterId: id, revision: 5, status: 'active' }, entries: [] }) }), [c1, c2], 1);
ok('one does not: the reason names it by its number in the message (after the note passages)', typeof stale === 'string' && stale.includes('#3') && stale.includes('事情记忆') && stale.includes('没有发出'), stale);
ok('withdrawn access stops the send', /已不可读/.test(await q.citationProblem(cafe({ readSource: refuse('gone') }), [c1], 0)));
ok('a quote from another cafe stops the send, naming that cafe', /另一个猫咖（http:\/\/other）/.test(await q.citationProblem(cafe(), [quote({ cafe: 'http://other' })], 0)));
ok('a cafe that cannot be asked stops the send too: unchecked quotes do not go', /暂时无法核对/.test(await q.citationProblem(cafe({ readSource: refuse('unavailable', '超时') }), [c1], 0)));

// 10. The lens asks often: an answer serves for a minute, a failure is asked again
q._citationChecks = new Map();
let asked = 0;
q.cafeClient = cafe({ readSource: async () => { asked++; return { status: 'available', updated: false }; } });
const first = await q.citationStanding(c1), again = await q.citationStanding(c1);
ok('the same citation, asked again at once, is not asked of the cafe again', first.state === 'ok' && again.state === 'ok' && asked === 1, String(asked));
q.cafeClient = cafe({ readSource: refuse('unavailable') });
q._citationChecks.clear();
await q.citationStanding(c1); await new Promise((r) => setTimeout(r, 0));
q.cafeClient.readSource = async () => { asked++; return { status: 'available', updated: false }; };
ok('one that could not be had is asked for again', (await q.citationStanding(c1)).state === 'ok' && asked === 2, String(asked));

// 11. A note keeps the coordinates of what it quotes, never the words
const evidence = t.cafeEvidence({ atlas_evidence: [{ type: 'paper', ref: 'arxiv:2602.19320', label: '论文' }, { type: 'message', ref: c1.ref, cafe: CAFE, version: REV, label: c1.label }, { type: 'message', ref: 'not-a-coordinate' }, { type: 'matter', ref: 'matter:m-1' }] });
ok('cafe citations are read from a note\'s evidence; other evidence, and broken coordinates, are not', same(evidence.map(e => e.ref), [c1.ref, 'matter:m-1']) && evidence[1].cafe === '' && evidence[1].version === '');
ok('a citation in a note without its cafe is not asked of whichever cafe is connected', (await q.checkCitation(evidence[1], cafe())).state === 'elsewhere');
let created = null;
q.settings = { ...q.settings, atlasDir: '_atlas', defaultMemoryType: 'semantic' };
q.app = { vault: { getAbstractFileByPath: () => ({}), create: async (file, content) => { created = { file, content }; return { basename: 'saved' }; } },
  workspace: { getActiveFile: () => null, getLeaf: () => ({ openFile: async () => {} }), getLeavesOfType: () => [] } };
q.updateStatusBar = () => {};
await q.saveMessageAsPendingNote({ id: 'r1', content: '结论：两处说法一致。', ...reply(['u-cited']) }, { nickname: '砚砚' }, 't', CAFE);
ok('a note saved from a reply lists what its request quoted: kind, coordinate, cafe and version', ['atlas_evidence:', '  - type: matter', `    ref: "${c2.ref}"`, `    version: "rev:2"`, '  - type: message', `    ref: "${c3.ref}"`, `    cafe: "${CAFE}"`, `    version: "${REV}"`, 'cited_at:'].every(line => created.content.includes(line)), created.content);
ok('…and where to read it again, in the note itself', created.content.includes('> [!abstract] 来源上下文') && created.content.includes(`（坐标 \`${c3.ref}\`）`));
ok('…but not the quoted words', !created.content.includes(c2.text) && !created.content.includes(c3.text));
created = null;
await q.saveMessageAsPendingNote({ id: 'r2', content: '普通回复。', ...reply(['u-nothing']) }, { nickname: '砚砚' }, 't', CAFE);
ok('a note saved from a reply that quoted nothing has no such evidence', !created.content.includes('atlas_evidence') && !created.content.includes('来源上下文'));
ok('a title from the cafe makes no link, tag or emphasis in the note', t.markdownLiteral('讨论 [[遗忘机制]]\n#标签 *强调*') === '讨论 \\[\\[遗忘机制\\]\\] \\#标签 \\*强调\\*');

// A search result and a later source read must describe the same revision. An old hit is not attachment text
// belonging to the new revision when its message was edited between searching and collecting.
let collected = null;
const modal = Object.create(t.CafeMemoryModal.prototype);
modal._alive = () => true;
modal._collect = async (c) => { collected = c; return true; };
modal._client = { ...client, readSource: async () => ({ updated: true, message: { threadId: 'thread_a', messageId: '0001-m1', content: '已经改过的原话', contentRevision: 'b'.repeat(64) } }) };
let changedError = null;
try { await modal._citeHit({ threadId: 'thread_a', messageId: '0001-m1', contentRevision: REV, snippet: { text: '搜索时的旧原话' } }); }
catch (err) { changedError = err; }
ok('a search hit edited before collection cannot pair its old words with the new revision', collected === null && changedError?.message.includes('重新搜索'));

console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
process.exitCode = fail ? 1 : 0;
