// Local staging on a throwaway repository and two throwaway vaults. As in the real project, `main` is the released line
// and the candidate is committed on a branch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-stage-test-'));
const repo=path.join(dir,'repo'), names=['main.js','styles.css','manifest.json'];
const write=(p,text)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
const read=p=>fs.readFileSync(p,'utf8');
const manifest=version=>JSON.stringify({id:'clowder-atlas',version});
const git=(...args)=>execFileSync('git',args,{cwd:repo,stdio:'pipe'});
const script=path.join(repo,'scripts/stage-local.mjs');
const a=path.join(dir,'A'),b=path.join(dir,'B');
const plugin=v=>path.join(v,'.obsidian/plugins/clowder-atlas');
const run=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:repo,encoding:'utf8'});
const args=['--vault',a,'--vault',b];
// Commit `code` as `version` on the current branch and build it, as `npm run build` does.
const commit=(version,code,message)=>{
 for(const n of names)write(path.join(repo,n==='manifest.json'?n:'src/'+n),n==='manifest.json'?manifest(version):code);
 git('add','.');git('-c','user.name=Test','-c','user.email=test@invalid','commit','-qm',message);
 for(const n of names)write(path.join(repo,'dist',n),fs.readFileSync(path.join(repo,n==='manifest.json'?n:'src/'+n)));
};
const backup=v=>path.join(plugin(v),'.backup-last-release'), receipt=v=>path.join(plugin(v),'.atlas-local-stage.json');
try {
 write(script,fs.readFileSync(new URL('../scripts/stage-local.mjs',import.meta.url)));
 write(path.join(repo,'.gitignore'),'dist/\n');
 git('init','-q','-b','main');
 commit('0.0.6','stable','release 0.0.6');
 git('checkout','-q','-b','feature');
 commit('0.0.7','candidate-v1','candidate');
 for(const v of [a,b]){
  for(const n of names)write(path.join(plugin(v),n),n==='manifest.json'?manifest('0.0.6'):'stable');
  write(path.join(plugin(v),'data.json'),'private settings '+v);
 }
 const settings=read(path.join(plugin(a),'data.json'));
 const lock=path.join(plugin(a),'.atlas-local-stage.lock');
 write(lock,JSON.stringify({pid:process.pid}));
 const blocked=run(...args);
 assert.notEqual(blocked.status,0,'concurrent staging must not write over a vault owned by another staging operation');
 assert.equal(read(path.join(plugin(a),'main.js')),'stable');
 fs.unlinkSync(lock);
 let result=run(...args);assert.equal(result.status,0,result.stderr);
 assert.equal(read(path.join(plugin(a),'main.js')),'candidate-v1');
 assert.equal(read(path.join(backup(a),'main.js')),'stable');
 assert.equal(read(path.join(plugin(a),'data.json')),settings);
 commit('0.0.7','candidate-v2','iterate');
 result=run(...args);assert.equal(result.status,0,result.stderr);
 assert.equal(read(path.join(backup(a),'main.js')),'stable','repeated trial must retain the stable rollback baseline');
 fs.unlinkSync(path.join(plugin(b),'styles.css'));
 result=run(...args);assert.notEqual(result.status,0);
 assert.equal(read(path.join(plugin(a),'main.js')),'candidate-v2','an invalid second vault cannot partly update the first');
 write(path.join(plugin(b),'styles.css'),'candidate-v1');
 write(path.join(plugin(a),'data.json'),'settings edited while testing');
 result=run('--rollback',...args);assert.equal(result.status,0,result.stderr);
 for(const v of [a,b]) assert.equal(read(path.join(plugin(v),'main.js')),'stable');
 assert.equal(read(path.join(plugin(a),'data.json')),'settings edited while testing','rollback must not restore old settings');
 write(path.join(backup(b),'main.js'),'corrupt');
 result=run('--rollback',...args);assert.notEqual(result.status,0);
 assert.match(result.stderr,/Backup main.js changed/);
 assert.equal(read(path.join(plugin(a),'main.js')),'stable');
 write(path.join(backup(b),'main.js'),'stable');

 // The cycle ends: the candidate is released (main moves to it) and both vaults run the release. Its backup, of the
 // release before, was not archived. A trial of the next version must not start on it: rolling that trial back would
 // return the vaults to 0.0.6, a release older than the one they were running.
 result=run(...args);assert.equal(result.status,0,result.stderr);
 git('branch','-f','main','feature');
 commit('0.0.8','candidate-v3','next candidate');
 result=run(...args);
 assert.notEqual(result.status,0,'a backup from a finished release cycle must stop the next trial');
 assert.match(result.stderr,/0\.0\.6/);assert.match(result.stderr,/0\.0\.7/);assert.match(result.stderr,/--archive/);
 for(const v of [a,b]){
  assert.equal(read(path.join(plugin(v),'main.js')),'candidate-v2','a refused staging changes no installed file');
  assert.equal(read(path.join(backup(v),'main.js')),'stable','…and keeps the old backup as it was');
  assert.equal(fs.existsSync(path.join(plugin(v),'.atlas-local-stage.lock')),false,'…and leaves no lock behind');
 }
 // Archiving moves that cycle's backup and receipt out of the vaults, and nothing else.
 const archive=path.join(dir,'archive');
 const edited=read(path.join(plugin(a),'data.json'));
 result=run('--archive',archive,...args);assert.equal(result.status,0,result.stderr);
 for(const v of [a,b]){
  assert.equal(fs.existsSync(backup(v)),false,'the finished backup leaves the vault');
  assert.equal(fs.existsSync(receipt(v)),false,'…with its receipt');
  assert.equal(read(path.join(plugin(v),'main.js')),'candidate-v2','archiving changes no installed file');
  const kept=path.join(archive,path.basename(v)+'-0.0.6');
  assert.equal(read(path.join(kept,'.backup-last-release/main.js')),'stable');
  assert.equal(JSON.parse(read(path.join(kept,'.backup-last-release/backup.json'))).version,'0.0.6');
  assert.equal(JSON.parse(read(path.join(kept,'.atlas-local-stage.json'))).version,'0.0.7');
 }
 assert.equal(read(path.join(plugin(a),'data.json')),edited,'archiving does not touch settings');
 result=run('--archive',archive,...args);
 assert.equal(result.status,0,'with nothing left to archive, archiving again is not an error: '+result.stderr);
 // The next trial then starts from the release the vaults run, and rolls back to it.
 result=run(...args);assert.equal(result.status,0,result.stderr);
 for(const v of [a,b]){
  assert.equal(read(path.join(plugin(v),'main.js')),'candidate-v3');
  assert.equal(JSON.parse(read(path.join(backup(v),'backup.json'))).version,'0.0.7');
 }
 result=run('--rollback',...args);assert.equal(result.status,0,result.stderr);
 for(const v of [a,b]) assert.equal(read(path.join(plugin(v),'main.js')),'candidate-v2','rollback returns to the release the trial started from');

 // A vault that does not run the released build has no stable version to back up: a development build must never
 // become the baseline a rollback returns to.
 result=run('--archive',path.join(dir,'archive-2'),...args);assert.equal(result.status,0,result.stderr);
 write(path.join(plugin(b),'main.js'),'some development build');
 result=run(...args);
 assert.notEqual(result.status,0,'a vault not running the release cannot start a trial');
 assert.match(result.stderr,/released/);
 assert.equal(read(path.join(plugin(a),'main.js')),'candidate-v2','…and the other vault is left alone');
 assert.equal(fs.existsSync(backup(a)),false,'…with no backup made of anything');
 console.log('PASS two-vault staging, stable iterative backup, all-target preflight, rollback, untouched user settings, and one release cycle per backup');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
