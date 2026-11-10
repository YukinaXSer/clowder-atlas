import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} };
let banners = 0;
const box = { module: { exports: {} }, require: () => host, console, URL, Set, Map, setTimeout, clearTimeout,
  createDiv: () => ({ createEl() {}, addEventListener() {} }) };
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
vm.runInNewContext(source + '\nmodule.exports.lens={ excerpt:typeof lensExcerpt==="function"?lensExcerpt:null, network:typeof lensNetwork==="function"?lensNetwork:null, threads:typeof lensThreads==="function"?lensThreads:null };', box);
const Plugin = box.module.exports, p = new Plugin();
const file = path => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md' });
const target=file('A/同名.md'), other=file('B/同名.md'), inbound=file('研究.md');
p.settings = { showRecallBadge:true, enableLuminanceCSS:true };
p.app = { vault:{getAbstractFileByPath:()=>target}, metadataCache:{getFileCache:()=>({frontmatter:{atlas_version:'v1',memory_type:'semantic',memory_status:'draft'}})} };
const cell={addClass(){},hasClass(){return false;},querySelector(){return null;},prepend(){banners++;}};
for(const docId of ['table-cell-1','table-cell-2']) p.postProcessMarkdown?.(cell,{sourcePath:target.path,docId});
assert.equal(banners,0,'rendering table cells must not inject Atlas UI into note content');

const h=Plugin.lens;
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
