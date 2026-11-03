// Install the exact distribution assets into a fresh, disposable vault. No user vault or running instance is reused.
// Node 22+; OBSIDIAN_BIN may point to the desktop executable. Default: the usual macOS installation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CDP } from './cdp.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.env.OBSIDIAN_BIN || '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
if (!fs.existsSync(executable)) throw Error('Set OBSIDIAN_BIN to your Obsidian desktop executable');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clowder-atlas-release-'));
const vault = path.join(temp, 'vault'), profile = path.join(temp, 'profile');
const artifacts = path.join(root, 'artifacts/desktop');
const pluginPath = path.join(vault, '.obsidian/plugins/clowder-atlas');
fs.cpSync(path.join(root, 'demo'), vault, { recursive: true });
fs.mkdirSync(pluginPath, { recursive: true });
fs.mkdirSync(profile);
fs.mkdirSync(artifacts, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) fs.copyFileSync(path.join(root, 'dist', name), path.join(pluginPath, name));
fs.writeFileSync(path.join(vault, '.obsidian/community-plugins.json'), JSON.stringify(['clowder-atlas']));
fs.writeFileSync(path.join(vault, '.obsidian/core-plugins.json'), JSON.stringify(['file-explorer', 'switcher', 'backlink', 'canvas']));
fs.writeFileSync(path.join(profile, 'obsidian.json'), JSON.stringify({ vaults: { a1b2c3d4e5f69871: { path: vault, ts: Date.now(), open: true } } }));
const version = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'))).version;
const P = "app.plugins.plugins['clowder-atlas']";
const LENS = 'clowder-atlas-provenance-lens', STARS = 'clowder-atlas-star-chart', CHAT = 'clowder-atlas-cafe-chat';
const results = [];
let cdp, child, log;
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + JSON.stringify(detail) : ''}`); };
const delay = ms => new Promise(r => setTimeout(r, ms));
const until = async (expression, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cdp.eval(expression)) return true; await delay(100); } return false; };
const freePort = async () => { const server = net.createServer(); await new Promise((r,j) => { server.once('error',j); server.listen(0,'127.0.0.1',r); }); const port = server.address().port; await new Promise(r => server.close(r)); return port; };
const launch = async phase => {
  const port = await freePort();
  log = fs.openSync(path.join(artifacts, `obsidian-${phase}.log`), 'w');
  child = spawn(executable, ['--user-data-dir=' + profile, '--remote-debugging-port=' + port, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'], { stdio: ['ignore', log, log] });
  console.log('INSTANCE ' + JSON.stringify({ phase, pid: child.pid }));
  const end = Date.now() + 40000;
  while (Date.now() < end) {
    try { cdp = await CDP.attach(port); if (await cdp.eval('!!app?.workspace?.layoutReady')) break; cdp.close(); cdp = null; } catch { if (cdp) cdp.close(); cdp = null; }
    await delay(300);
  }
  if (!cdp) throw Error('The isolated desktop did not start');
  if (fs.realpathSync(await cdp.eval('app.vault.adapter.basePath')) !== fs.realpathSync(vault)) throw Error('Isolation check failed');
  await cdp.eval("(() => {const w=window.require('@electron/remote').getCurrentWindow();w.setIgnoreMouseEvents(true);w.setOpacity(.01);})()");
};
const quit = async () => {
  if (cdp) { try { await cdp.eval("window.require('@electron/remote').app.quit()"); } catch {} cdp.close(); cdp = null; }
  if (child) await new Promise(r => { if (child.exitCode !== null) return r(); const timeout = setTimeout(() => { child.kill('SIGKILL'); }, 8000); child.once('exit', () => { clearTimeout(timeout); r(); }); });
  if (log !== undefined) { fs.closeSync(log); log = undefined; }
};
const openNote = async name => {
  await cdp.eval(`(async()=>{const leaf=app.workspace.getLeavesOfType('markdown')[0]||app.workspace.getLeaf('tab');await leaf.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(name)}));app.workspace.setActiveLeaf(leaf,{focus:true});return true;})()`);
};
const shot = async name => {
  await cdp.eval('(() => {const notices=document.querySelector(".notice-container");if(notices)notices.style.display="none";return true;})()');
  return cdp.shot(path.join(artifacts, name + '.png'));
};
try {
  await launch('first');
  const trust = "[...document.querySelectorAll('.modal button')].find(b=>/信任仓库作者并启用插件|Trust author and enable plugins/.test(b.textContent))";
  const prompted = await until('!!(' + trust + ')', 5000);
  await cdp.eval(prompted ? '(' + trust + ').click()' : '(async()=>{await app.plugins.setEnable(true);await app.plugins.enablePlugin("clowder-atlas");})()');
  const loaded = await until('!!' + P);
  check('fresh installation loads the distribution', loaded && await cdp.eval(`app.plugins.manifests['clowder-atlas'].version===${JSON.stringify(version)}`));
  if (!loaded) throw Error('Candidate failed to load; check minAppVersion and desktop version');
  const offline = await cdp.eval(`({enabled:${P}.settings.catCafeEnabled,client:!!${P}.cafeClient})`);
  check('fresh installation is offline without a Cat Cafe client', offline.enabled === false && offline.client === false, offline);
  const tabsReady = await until(`app.workspace.getLeavesOfType('${STARS}').length===1&&app.workspace.getLeavesOfType('${LENS}').length===1`);
  check('one star chart and one Lens open', tabsReady);
  await cdp.viewport(1280, 800, 1);
  await cdp.settle(500);
  const chart = await cdp.eval(`(() => {const c=app.workspace.getLeavesOfType('${STARS}')[0].view.containerEl.querySelector('canvas');return c?{width:c.width,height:c.height}:null;})()`);
  check('star chart renders from synthetic notes', chart && chart.width > 0 && chart.height > 0, chart);
  await cdp.eval(`(() => {const c=app.workspace.getLeavesOfType('${STARS}')[0].view.containerEl.querySelector('canvas');for(let i=0;i<3;i++)c.dispatchEvent(new WheelEvent('wheel',{deltaY:-500,bubbles:true,cancelable:true}));return true;})()`);
  await cdp.settle(300);
  await shot('star-chart');
  await openNote('_atlas/pending/graph-memory-insight.md');
  await cdp.eval(P + '.activateLens()');
  const crystalButton = `[...app.workspace.getLeavesOfType('${LENS}')[0].view.containerEl.querySelectorAll('button')].find(b=>b.textContent.includes('点亮结晶'))`;
  const pending = await until('!!(' + crystalButton + ')');
  check('pending note has an explicit crystallize action', pending);
  await shot('provenance-lens');
  if (pending) await cdp.eval('(' + crystalButton + ').click()');
  const moved = await until("!!app.vault.getAbstractFileByPath('_atlas/crystals/graph-memory-insight.md')&&!app.vault.getAbstractFileByPath('_atlas/pending/graph-memory-insight.md')");
  check('explicit crystallization moves only the synthetic pending note', moved);
  await cdp.eval('(async()=>{await ' + P + '.generateCanvas();return true;})()');
  check('Canvas export creates a new file', fs.existsSync(path.join(vault, '_atlas/canvases')) && fs.readdirSync(path.join(vault, '_atlas/canvases')).some(n=>n.endsWith('.canvas')));
  await cdp.eval('(async()=>{await ' + P + '.openCafeChat();return true;})()');
  const chatOffline = await until(`!!app.workspace.getLeavesOfType('${CHAT}')[0]?.view.containerEl.querySelector('.atlas-chat-offline')`);
  check('companion panel stays offline until configured', chatOffline);
  await shot('companions-offline');
  const commands = await cdp.eval(`({single:!!app.commands.commands['clowder-atlas:ask-about-selection'],oldDiscuss:!!app.commands.commands['clowder-atlas:discuss-selection'],oldRevise:!!app.commands.commands['clowder-atlas:revise-selection']})`);
  check('selection has a single command', commands.single && !commands.oldDiscuss && !commands.oldRevise, commands);
  check('no uncaught plugin exception on first use', !cdp.problems.some(p=>/exception:.*(?:clowder|atlas|plugin:)/i.test(p)));
  await cdp.eval('(async()=>{if(typeof app.workspace.saveLayout==="function")await app.workspace.saveLayout();return true;})()');
  await quit();
  await launch('reopen');
  const restored = await until('!!' + P);
  await delay(1000);
  const reopened = await cdp.eval(`({loaded:!!${P},client:!!${P}?.cafeClient,stars:app.workspace.getLeavesOfType('${STARS}').length,lens:app.workspace.getLeavesOfType('${LENS}').length})`);
  check('reopen restores one of each view and remains offline', restored && reopened.loaded && !reopened.client && reopened.stars===1 && reopened.lens===1, reopened);
  check('curated synthetic note survives reopen', fs.existsSync(path.join(vault, '_atlas/crystals/graph-memory-insight.md')));
  check('no uncaught plugin exception on reopen', !cdp.problems.some(p=>/exception:.*(?:clowder|atlas|plugin:)/i.test(p)));
} catch (error) {
  check('desktop smoke completed', false, String(error.stack || error));
} finally {
  await quit();
  const summary = { version, pass: results.filter(r=>r.ok).length, fail: results.filter(r=>!r.ok).length };
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify({ summary, results }, null, 2));
  console.log('SUMMARY ' + JSON.stringify(summary));
  fs.rmSync(temp, { recursive: true, force: true });
  if (summary.fail) process.exitCode = 1;
}
