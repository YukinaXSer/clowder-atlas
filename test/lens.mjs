import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} };
let banners = 0;
const box = { module: { exports: {} }, require: () => host, console, URL, Set, Map, setTimeout, clearTimeout,
  createDiv: () => ({ createEl() {}, addEventListener() {} }) };
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
vm.runInNewContext(source + '\nmodule.exports.lens={ excerpt:typeof lensExcerpt==="function"?lensExcerpt:null, network:typeof lensNetwork==="function"?lensNetwork:null, threads:typeof lensThreads==="function"?lensThreads:null, preview:formatLensSnippetPreview };', box);
const Plugin = box.module.exports, p = new Plugin();
const file = path => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md' });
const target=file('A/同名.md'), other=file('B/同名.md'), inbound=file('研究.md');
p.settings = { showRecallBadge:true, enableLuminanceCSS:true };
p.app = { vault:{getAbstractFileByPath:()=>target}, metadataCache:{getFileCache:()=>({frontmatter:{atlas_version:'v1',memory_type:'semantic',memory_status:'draft'}})} };
const cell={addClass(){},hasClass(){return false;},querySelector(){return null;},prepend(){banners++;}};
for(const docId of ['table-cell-1','table-cell-2']) p.postProcessMarkdown?.(cell,{sourcePath:target.path,docId});
assert.equal(banners,0,'rendering table cells must not inject Atlas UI into note content');

const h=Plugin.lens;
assert.equal(h.preview('> [!abstract]+ 来源\n> **重点** / __结论__ / *斜体* / _说明_ / [[A/目标.md#小节|别名]]'), '来源\n重点 / 结论 / 斜体 / 说明 / 「别名」');
assert.equal(h.preview('[[A/目标#小节]] [[#本地小节]] `__init__` ``a * b`` user_id <img src=x>'), '「目标 › 小节」 「本地小节」 __init__ a * b user_id <img src=x>', 'display formatting preserves literal code, identifiers and text-only content');
assert.equal(h.preview('\\*字面星号\\* 与 \\_下划线\\_ 与 [[笔记#^块]] 与 `a\\*b`'), '*字面星号* 与 _下划线_ 与 「笔记」 与 a\\*b', 'escaped markers stay literal, block references show the note, code keeps its backslashes');
assert.equal(h.preview('2 * a * b，_ 强调 _，user_id'), '2 * a * b，_ 强调 _，user_id', 'spaced mathematical operators are not Markdown emphasis');
assert.equal(h.preview('字面 \\` 反引号，再来 `code` 一段'), '字面 ` 反引号，再来 code 一段', 'an escaped backtick does not open inline code');
assert.equal(h.preview('**粗体 \\* 星号** 与 ``a`b`` 与 落单 ` 反引号'), '粗体 * 星号 与 a`b 与 落单 ` 反引号', 'emphasis reads across an escaped marker; code keeps a backtick; a lone backtick stays');
assert.equal(h.preview('私用区  原样，\\* 星号'), '私用区  原样，* 星号', 'private-use characters already in the text are not turned into markers');
const text='---\nsecret: DO-NOT-EXCERPT\n---\n# 标题\n\n第一段正文。\n第二行。\n\n末段。';
const excerpt=h.excerpt(target,text);
assert.equal(excerpt.text,'第一段正文。\n第二行。');
assert.equal(excerpt.from.line,5);
assert.equal(excerpt.to.line,6);
assert.equal(excerpt.to.ch,4);
assert.equal(h.excerpt(target,'---\na: 1\n---\n'),null);
assert.equal(h.excerpt(target,'- 邻项\n- [[目标]] 这一项\n- 另一项',1).text,'- [[目标]] 这一项','list backlinks collect only the matching item');
assert.equal(h.excerpt(target,'| 前行 | 甲 |\n| [[目标]] | 乙 |\n| 后行 | 丙 |',1).text,'| [[目标]] | 乙 |','table backlinks collect only the matching row');
const content='提要。\n\n引用 [[A/同名#标题|别名]] 的原句。\n后续论述。\n\n结束。';
const cache=new Map([
 [target.path,{frontmatter:{related:['[[B/同名]]','[[不存在]]']},links:[]}],
 [other.path,{frontmatter:{},links:[]}],
 [inbound.path,{frontmatter:{},links:[{link:'A/同名#标题',position:{start:{line:2}}}]}]
]);
const files=[target,other,inbound], bodies=new Map([[target.path,text],[other.path,'B 的独立原文。'],[inbound.path,content]]);
const app={vault:{getMarkdownFiles:()=>files,getAbstractFileByPath:path=>files.find(f=>f.path===path),cachedRead:async f=>bodies.get(f.path)},metadataCache:{resolvedLinks:{[inbound.path]:{[target.path]:1}},getFileCache:f=>cache.get(f.path),getFirstLinkpathDest:raw=>files.find(f=>f.path===raw.split('#')[0]+'.md')}};
const network=await h.network(app,target);
assert.equal(network.incoming.length,1);
const inboundExcerpt=h.excerpt(network.incoming[0].file,await app.vault.cachedRead(network.incoming[0].file),network.incoming[0].line);
assert.equal(inboundExcerpt.text,'引用 [[A/同名#标题|别名]] 的原句。\n后续论述。');
assert.equal(inboundExcerpt.from.line,2);
assert.equal(network.outgoing[0].path,other.path);
assert.equal(h.excerpt(network.outgoing[0].file,await app.vault.cachedRead(network.outgoing[0].file)).text,'B 的独立原文。');
assert.equal(network.outgoing[1].file,null,'unresolved links must not acquire a made-up source excerpt');
const pdf={path:'paper.pdf',basename:'paper',extension:'pdf'};
files.push(pdf);
cache.get(target.path).links.push({link:'paper.pdf'});
const firstDest=app.metadataCache.getFirstLinkpathDest;
app.metadataCache.getFirstLinkpathDest=raw=>raw==='paper.pdf'?pdf:firstDest(raw);
assert.equal((await h.network(app,target)).outgoing[2].file,pdf,'an existing PDF retains its real destination and can be opened without extracting binary text');
assert.equal((await h.network(app,other)).incoming.length,0,'same basenames are distinct source files');
// A note the cats derived from this one names it twice over: in its related property and in the 来源上下文 block it was
// created with. It is listed under 由此篇提炼, so it is a card under 引用此篇的笔记 only when its own text cites the note.
const derivedOnly=file('_atlas/pending/要点-1.md'), derivedCiting=file('_atlas/pending/要点-2.md');
const generated='# 要点\n\n> 由 **宪宪** 在猫咖研讨中提出，待审阅后点亮结晶\n\n> [!abstract] 来源上下文\n> - **交叉引用笔记**：[[A/同名]]\n\n';
files.push(derivedOnly,derivedCiting);
bodies.set(derivedOnly.path,generated+'正文没有再提到源笔记。');
bodies.set(derivedCiting.path,generated+'正文里引用了 [[A/同名]] 的说法。');
const inBlock={link:'A/同名',position:{start:{line:5}}}, inText={link:'A/同名',position:{start:{line:7}}};
cache.set(derivedOnly.path,{frontmatter:{memory_status:'pending',related:['[[A/同名]]']},links:[inBlock]});
cache.set(derivedCiting.path,{frontmatter:{memory_status:'pending',related:['[[A/同名]]']},links:[inBlock,inText]});
app.metadataCache.resolvedLinks[derivedOnly.path]={[target.path]:1};
app.metadataCache.resolvedLinks[derivedCiting.path]={[target.path]:2};
const withDerived=await h.network(app,target);
assert.deepEqual(Array.from(withDerived.derived,e=>e.path).sort(),[derivedOnly.path,derivedCiting.path].sort());
assert.equal(withDerived.incoming.some(e=>e.path===derivedOnly.path),false,'a derived note that names its source only in the generated block is not listed twice');
assert.equal(withDerived.incoming.find(e=>e.path===derivedCiting.path)?.line,7,'a derived note whose own text cites the source shows that sentence, not the generated block');
assert.equal(withDerived.incoming.some(e=>e.path===inbound.path),true,'ordinary notes citing this one are listed as before');
const client={baseUrl:'http://a',threads:[{id:'a',title:'renamed'},{id:'b',title:'《同名》 unrelated'},{id:'c',title:'other cafe'}]};
const plugin={cafeClient:client,settings:{revisionTargets:{r:{cafe:'http://a',threadId:'a',path:target.path,messageIds:['u']},failed:{cafe:'http://a',threadId:'b',path:target.path,messageIds:[]}},passageRequests:{x:{cafe:'http://b',threadId:'c',passages:[{path:target.path}],messageIds:['u']}}}};
assert.deepEqual(Array.from(h.threads(plugin,target),t=>t.id),['a'],'thread association uses path and cafe, not a coincidentally matching title');
// Exercise every production writer that can change the shared research state, including the legacy tray bridge.
const q=new Plugin();
let rendered={trayCount:0,threads:[]};
q.settings={revisionTargets:{},passageRequests:{}};
q.cafeClient={baseUrl:'http://a',threads:[{id:'one'},{id:'two'}]};
q.app={metadataCache:app.metadataCache,workspace:{getLeavesOfType:type=>type==='clowder-atlas-provenance-lens'?[{view:{refresh(){rendered={trayCount:q.chatPassages.length,threads:Array.from(h.threads(q,target),t=>t.id)};}}}]:[]}};
q.saveData=async()=>{};
await q.setChatPassages([excerpt]);
assert.equal(rendered.trayCount,1,'collecting must notify the other view');
q.chatPassage=null;
assert.equal(rendered.trayCount,0,'the legacy bridge must also notify the other view');
await q.rememberPassageRequest('single','http://a','one',[excerpt]);
assert.deepEqual(rendered.threads,[],'preparing a request does not advertise an undelivered conversation');
await q.bindRevisionMessage('single','u-one');
assert.deepEqual(rendered.threads,['one'],'delivering a single-source request updates the Lens');
await q.rememberPassageRequest('multi','http://a','two',[excerpt,{...excerpt,path:other.path}]);
await q.bindRevisionMessage('multi','u-two');
assert.deepEqual(rendered.threads,['one','two'],'delivering a multi-source request updates the Lens');
console.log('PASS clean Markdown, source excerpts, exact link resolution and cafe-bound discussion provenance');
