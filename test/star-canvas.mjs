import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const host={Plugin:class{},ItemView:class{},PluginSettingTab:class{},Modal:class{}};
const box={module:{exports:{}},require:()=>host,console,URL,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8')+'\nmodule.exports.canvas={view:StarChartView,title:typeof starPassageTitle==="function"?starPassageTitle:null,layout:typeof starOrbitLayout==="function"?starOrbitLayout:null,overlap:typeof starRectOverlap==="function"?starRectOverlap:null};',box);
const a=box.module.exports.canvas;let fail=0,pass=0;
const test=(name,f)=>{try{f();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);}};
test('canvas sources never show raw source ids, while human titles remain available',()=>{
 assert.equal(a.title({label:'thread_unknown123',type:'thread',actionable:false}),'旧研讨出处');
 assert.equal(a.title({label:'研究归位',type:'matter',actionable:true}),'研究归位');
 assert(!a.title({label:'研讨 · thread_abc123',type:'message',actionable:true}).includes('thread_'));
});
test('long source titles have a bounded measurement cost per frame',()=>{
 let calls=0;const v=Object.create(a.view.prototype),ctx={measureText:t=>{calls++;return {width:t.length*8};}};
 const text=v._clipStarText('source '.repeat(1000),96,ctx);assert(text.length<=12);assert(calls<=14,'measurements: '+calls);
});
for(const [width,height] of [[1200,700],[390,549],[320,549],[640,246],[640,219],[320,219]])test(width+'x'+height+' orbit provides bounded, nonoverlapping labels and reachable off-chart peers',()=>{
 const ps=Array.from({length:13},(_,i)=>({id:'s'+i,key:'k'+i})),peers=Array.from({length:30},(_,i)=>({path:'offchart'+i,keys:['k'+i%13]}));
 const l=a.layout({width,height,passages:ps,peers,cats:Array.from({length:8},(_,i)=>({catKey:'c'+i}))});
 assert(l.portals.length<=6&&l.peers.length<=6);assert(l.portals.length>0&&l.peers.length>0);
 for(const p of [...l.portals,...l.peers])assert(p.x>=12&&p.x<=width-12&&p.y>=12&&p.y<=height-12);
 for(const b of l.labels)assert(b.x>=0&&b.y>=0&&b.x+b.w<=width&&b.y+b.h<=height);
 for(const b of l.labels)assert(l.reserved.every(r=>!a.overlap(b,r)),'a label overlaps the hero or a ribbon');
 for(const r of l.ribbons)assert(l.heroBoxes.every(b=>!a.overlap(r.rect,b)),'a ribbon overlaps the hero/open action');
 for(let i=0;i<l.labels.length;i++)for(let j=0;j<i;j++)assert(!a.overlap(l.labels[i],l.labels[j]));
 assert(l.peers.every(p=>p.peer.path.startsWith('offchart')));
 const seen=new Set();for(let page=0;page<Math.ceil(ps.length/l.sourceLimit);page++)for(const p of a.layout({width,height,passages:ps,peers,sourcePage:page}).portals)seen.add(p.passage.id);
 assert.equal(seen.size,13);
});
console.log(JSON.stringify({pass,fail}));process.exitCode=fail?1:0;
