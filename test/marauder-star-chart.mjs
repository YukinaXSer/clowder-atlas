import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const host={Plugin:class{},ItemView:class{},PluginSettingTab:class{},Modal:class{},Notice:class{}};
const box={module:{exports:{}},require:()=>host,console,URL,setTimeout,clearTimeout,setInterval,clearInterval};
const names=['resolveFootprintCat','collectStarPassages','collectStarFootprints','buildMarauderIndex','selectChartStars','StarChartView','CatCafeClient'];
vm.runInNewContext(fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8')+
 '\nmodule.exports.t={'+names.map(n=>n+':typeof '+n+'==="function"?'+n+':null').join(',')+'};',box);
const api=box.module.exports.t;
const cafe='http://synthetic-cafe.invalid';
const client={baseUrl:cafe,connected:true,cats:[{id:'custom-id',nickname:'Mochi',color:{primary:'#73DACA'}}],threads:[{id:'thread_same',title:'研讨'}]};
const settings={revisionTargets:{},passageRequests:{}};
const file=(path,mtime=100)=>({path,basename:path.replace('.md',''),stat:{mtime}});
const evidence=(source=cafe,type='message',ref='thread_same#message_one')=>({type,ref,cafe:source,version:'revision-one',label:'原话'});
const item=(path,{score=0,note={},frontmatter={},mtime=100}={})=>{
 const f=file(path,mtime);return {file:f,note,backlinks:score,outlinks:0,score,
  passages:api.collectStarPassages({file:f,note,frontmatter,client,settings}),
  footprints:api.collectStarFootprints({file:f,note,frontmatter,client,settings,now:100})};
};
let pass=0,fail=0;
function test(name,fn){try{for(const n of names)assert.equal(typeof api[n],'function',n+' is required');fn();pass++;console.log('PASS '+name);}
catch(e){fail++;console.log('FAIL '+name+': '+e.message);}}
test('zero-link sourced notes are reserved without changing their brightness, and focused notes always fit',()=>{
 const many=Array.from({length:100},(_,i)=>item('linked-'+i+'.md',{score:100-i}));
 const fresh=item('fresh.md',{note:{atlas_evidence:[evidence()]}}),focus=item('focus.md');
 const chosen=api.selectChartStars([...many,fresh,focus],{focusPath:'focus.md'});
 assert.equal(chosen.length,80);assert.equal(chosen[0].file.path,'focus.md');
 assert(chosen.some(s=>s.file.path==='fresh.md'));assert.equal(fresh.backlinks,0);
 assert.equal(new Set(chosen.map(s=>s.file.path)).size,80);
});
test('evidence retains distinct exact citations, while resonance groups their source conversation',()=>{
 const p=api.collectStarPassages({file:file('a.md'),note:{atlas_evidence:[evidence(),evidence(),evidence(cafe,'message','thread_same#message_two')]},client,settings});
 assert.equal(p.length,2);assert.equal(p[0].key,p[1].key);assert.notEqual(p[0].id,p[1].id);
 assert.equal(p[0].citation.ref,'thread_same#message_one');assert(p[0].actionable);
});
test('same thread or matter id at different Cafes never creates resonance',()=>{
 const a=item('a.md',{note:{atlas_evidence:[evidence()]}}),b=item('b.md',{note:{atlas_evidence:[evidence('http://other.invalid')]}}),
 c=item('c.md',{note:{atlas_evidence:[evidence()] }});
 const index=api.buildMarauderIndex([a,b,c],[a,b,c]);
 assert.equal(index.globalEdges.length,1);assert.equal(index.peers.get('a.md')[0].path,'c.md');
 assert.equal(index.peers.get('b.md').length,0);assert(!b.passages[0].actionable);
});
test('unknown historical origins stay readable coordinates and cannot match a known Cafe by id alone',()=>{
 const a=item('legacy.md',{frontmatter:{source_thread:'thread_same'}}),b=item('known.md',{note:{atlas_source:'clowder_ai',atlas_source_ref:'thread_same',atlas_source_cafe:cafe}});
 assert.equal(a.passages.length,1);assert(!a.passages[0].actionable);assert(!a.passages[0].key);
 assert(b.passages[0].actionable);assert.equal(api.buildMarauderIndex([a,b],[a,b]).globalEdges.length,0);
});
test('matter identities are isolated from message threads and from same-named matters at another Cafe',()=>{
 const a=item('matter-a.md',{note:{atlas_evidence:[evidence(cafe,'matter','matter:matter_same')]}}),
 b=item('matter-b.md',{note:{atlas_evidence:[evidence(cafe,'matter','matter:matter_same')]}}),
 foreign=item('matter-other.md',{note:{atlas_evidence:[evidence('http://other.invalid','matter','matter:matter_same')]}});
 const index=api.buildMarauderIndex([a,b,foreign],[a,b,foreign]);
 assert.equal(a.passages[0].type,'matter');assert.equal(index.peers.get(a.file.path).length,1);
 assert.equal(index.peers.get(foreign.file.path).length,0);
});
test('explicit local request bindings carry their own Cafe and exact note paths',()=>{
 const local={...settings,passageRequests:{x:{cafe,threadId:'thread_same',messageIds:['u1'],passages:[{path:'a.md'}]},
  y:{cafe,threadId:'thread_same',messageIds:[],path:'b.md'}}};
 assert.equal(api.collectStarPassages({file:file('a.md'),client,settings:local}).length,1);
 assert.equal(api.collectStarPassages({file:file('b.md'),client,settings:local}).length,0);
});
test('template coordinates and human names do not become stars sources or cat footprints',()=>{
 const f=file('a.md');assert.equal(api.collectStarPassages({file:f,note:{atlas_source_ref:'{{source_ref}}'},frontmatter:{source_thread:'{{thread}}'},client,settings}).length,0);
 for(const name of ['','{{agent_name}}','co-creator','user','大当家'])assert.equal(api.resolveFootprintCat(name,client),null);
 assert.equal(api.collectStarFootprints({file:f,frontmatter:{author:'Kimiko Author'},client,settings}).length,0);
});
test('custom cats have deterministic valid colors; roster aliases use one stable identity',()=>{
 const a=api.resolveFootprintCat('Mochi',client),b=api.resolveFootprintCat('custom-id',client);
 assert.equal(a.catKey,b.catKey);assert.equal(a.color,'#73DACA');
 const x=api.resolveFootprintCat('Neo',null),y=api.resolveFootprintCat('Neo',null);
 assert.equal(x.color,y.color);assert.match(x.color,/^#[0-9a-f]{6}$/i);
});
test('footprints come from authored metadata or explicit current-Cafe thread activity, not an unrelated live thread',()=>{
 const f=file('a.md'),note={atlas_authors:['Mochi'],atlas_source:'clowder_ai',atlas_source_cafe:cafe,atlas_source_ref:'thread_same'};
 const local=api.collectStarFootprints({file:f,note,client,settings,now:100,liveCatsByThread:new Map([['thread_other',['custom-id']]])});
 assert.equal(local.length,1);assert.equal(local[0].live,false);
 const live=api.collectStarFootprints({file:f,note,client,settings,now:100,liveCatsByThread:new Map([['thread_same',['custom-id']]])});
 assert.equal(live.length,1);assert(live[0].live);assert(live[0].sources.includes('author'));
});
test('large shared threads have no global complete graph, bounded selected edges, and a complete peer list',()=>{
 const many=Array.from({length:30},(_,i)=>item('a'+i+'.md',{mtime:i,note:{atlas_evidence:[evidence()]}}));
 const index=api.buildMarauderIndex(many,many);
 assert.equal(index.globalEdges.length,0);assert.equal(index.peers.get('a0.md').length,29);
 assert(index.edgesFor('a0.md').length<=8);
});
test('the inspector peer index includes notes outside the 80 visible stars',()=>{
 const a=item('a.md',{note:{atlas_evidence:[evidence()]}}),b=item('b.md',{note:{atlas_evidence:[evidence()]}});
 const index=api.buildMarauderIndex([a,b],[a]);assert.equal(index.peers.get('a.md')[0].path,'b.md');assert.equal(index.globalEdges.length,0);
});
test('coauthor trails are ordered by note modification time and contain at most five visible notes',()=>{
 const now=Date.now(),many=Array.from({length:9},(_,i)=>item('a'+i+'.md',{mtime:now-i*1000,note:{atlas_authors:['Mochi']}}));
 const trail=api.buildMarauderIndex(many,many,{now}).trails[0];
 assert.equal(trail.paths.length,5);
 assert.deepEqual(Array.from(trail.paths),['a4.md','a3.md','a2.md','a1.md','a0.md']);
});
async function asyncTest(name,fn){try{await fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.stack);}}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
await asyncTest('live project reader requires a connected known anchor, strips payloads, and tolerates unsupported routes',async()=>{
 const c=Object.create(api.CatCafeClient.prototype);c.connected=false;c.threads=[{id:'a /b'}];let paths=[];
 c._sessionRequest=async path=>{paths.push(path);return {executions:[{kind:'live_invocation',threadId:'a /b',catId:'cat1',content:'private'}, {kind:'managed_command',threadId:'other',catId:'cat2'}]};};
 assert.equal((await c.fetchProjectActiveExecutions('a /b')).length,0);c.connected=true;
 assert.equal((await c.fetchProjectActiveExecutions('missing')).length,0);assert.equal(paths.length,0);
 const rows=await c.fetchProjectActiveExecutions('a /b');assert.equal(paths[0],'/api/threads/a%20%2Fb/executions/active');
 assert.equal(JSON.stringify(rows),'[{"threadId":"a /b","catId":"cat1","kind":"live_invocation"}]');
 c._sessionRequest=async()=>{throw Error('404');};assert.equal((await c.fetchProjectActiveExecutions('a /b')).length,0);
});
await asyncTest('selection changes discard an old citation answer and stop its remaining bounded queue',async()=>{
 const v=Object.create(api.StarChartView.prototype);let release,calls=0;
 const p=i=>({id:'cite'+i,cafe,citation:{ref:'thread_same#m'+i},actionable:true});
 v.plugin={cafeClient:client,citationStanding:()=>{calls++;return new Promise(r=>release=r);}};
 v._stars=[{file:file('a.md'),passages:[p(1),p(2),p(3),p(4)]}];v._selectedPath='a.md';v._selectGeneration=1;
 v._chartCanvas={isConnected:true};v._citationStates=new Map();v._paintStarCitation=()=>{};
 // Three in-flight reads can settle late, but cannot start the fourth or paint a different selection.
 const releases=[];v.plugin.citationStanding=()=>{calls++;return new Promise(r=>releases.push(r));};
 const job=v._verifyStarCitations(1);assert.equal(calls,3);v._selectGeneration=2;v._selectedPath='b.md';
 for(const r of releases)r({state:'updated'});await job;
 assert.equal(calls,3);assert([...v._citationStates.values()].every(s=>s.state==='checking'));
});
await asyncTest('live mode is opt-in, sends one project read, filters other threads, and retires late answers',async()=>{
 const timers=new Map();let n=0;box.setTimeout=(fn,ms)=>{timers.set(++n,{fn,ms});return n;};box.clearTimeout=id=>timers.delete(id);
 let reads=0,release;const c={...client,fetchProjectActiveExecutions:()=>{reads++;return new Promise(r=>release=r);}};
 const v=Object.create(api.StarChartView.prototype);
 Object.assign(v,{plugin:{cafeClient:c,isCafeConnected:true},_dataClient:c,_chartCanvas:{isConnected:true,ownerDocument:{hidden:false},getClientRects:()=>[1]},
  _marauderMode:false,_liveCatsByThread:new Map(),_stars:[{passages:[{cafe,threadId:'thread_same',actionable:true}]}],_refreshStarRecords:()=>{}});
 v._syncLiveActivityPoll();assert.equal(reads,0);assert.equal(timers.size,0);
 v._marauderMode=true;v._syncLiveActivityPoll();v._syncLiveActivityPoll();assert.equal(reads,1);
 release([{threadId:'thread_same',catId:'custom-id'},{threadId:'other',catId:'wrong'}]);await flush();
 assert.equal(v._liveCatsByThread.size,1);assert(v._liveCatsByThread.get('thread_same').has('custom-id'));
 assert.equal(timers.size,1);const [id,timer]=[...timers.entries()][0];assert.equal(timer.ms,10000);timers.delete(id);timer.fn();
 assert.equal(reads,2);v._marauderMode=false;v._syncLiveActivityPoll();assert.equal(timers.size,0);
 release([{threadId:'thread_same',catId:'late'}]);await flush();assert.equal(v._liveCatsByThread.size,0);assert.equal(timers.size,0);
 for(const condition of ['hidden','disconnected','detached','new-client']){
  v._marauderMode=true;v._chartCanvas.ownerDocument.hidden=condition==='hidden';v._chartCanvas.isConnected=condition!=='detached';
  v.plugin.isCafeConnected=condition!=='disconnected';v.plugin.cafeClient=condition==='new-client'?{}:c;
  v._syncLiveActivityPoll();assert.equal(reads,2,condition);assert.equal(timers.size,0,condition);
 }
});
await asyncTest('toggling while a project read is pending never overlaps it',async()=>{
 const timers=new Map();let n=0;box.setTimeout=(fn,ms)=>{timers.set(++n,{fn,ms});return n;};box.clearTimeout=id=>timers.delete(id);
 let reads=0,release;const c={...client,fetchProjectActiveExecutions:()=>{reads++;return new Promise(r=>release=r);}};
 const v=Object.create(api.StarChartView.prototype);Object.assign(v,{plugin:{cafeClient:c,isCafeConnected:true},_dataClient:c,
 _chartCanvas:{isConnected:true,ownerDocument:{hidden:false},getClientRects:()=>[1]},_marauderMode:true,_liveCatsByThread:new Map(),
 _stars:[{passages:[{cafe,threadId:'thread_same',actionable:true}]}],_refreshStarRecords:()=>{}});
 v._syncLiveActivityPoll();v._stopLiveActivityPoll();v._syncLiveActivityPoll();assert.equal(reads,1);assert.equal(timers.size,1);
 release([]);await flush();assert.equal(timers.size,1);assert.equal(reads,1);v._stopLiveActivityPoll();assert.equal(timers.size,0);
});
console.log(JSON.stringify({pass,fail}));process.exitCode=fail?1:0;
