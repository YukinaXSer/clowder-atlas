// Explicit operator-approved local trial only. Touch exactly the three plugin binaries; never copy data.json or notes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['main.js', 'styles.css', 'manifest.json']; // manifest last: version follows the installed code
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const usage = 'Usage: stage-local.mjs [--rollback | --archive <directory>] --vault <vault> [--vault <vault>]';
const args = process.argv.slice(2), vaults = [];
const rollback = args[0] === '--rollback';
if (rollback) args.shift();
let archive = null;
if (args[0] === '--archive') {
  args.shift();
  if (!args[0] || args[0].startsWith('--')) throw Error(usage);
  archive = path.resolve(args.shift());
}
while (args.length) {
  if (args.shift() !== '--vault' || !args[0]) throw Error(usage);
  vaults.push(fs.realpathSync(args.shift()));
}
if (!vaults.length || new Set(vaults).size !== vaults.length) throw Error('Name each target vault once with --vault');
const staging = !rollback && !archive;
const head = staging ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() : null;
if (staging && execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Commit the reviewed candidate before staging');
const candidate = staging ? Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(root, 'dist', name))])) : null;
if (candidate) {
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name === 'manifest.json' ? name : `src/${name}`));
    if (!candidate[name].equals(source)) throw Error(`Build ${name} is stale; run npm run build`);
  }
  if (JSON.parse(candidate['manifest.json']).id !== 'clowder-atlas') throw Error('Unexpected plugin id');
}
// The released build is what `main` holds; a candidate stays on its branch until the operator allows publication. The
// stable backup a rollback returns to is always that build: taken only from a vault that runs it, and good for one
// release cycle only.
const released = staging ? (() => {
  for (const ref of ['origin/main', 'main']) {
    try {
      const show = name => execFileSync('git', ['show', `${ref}:${name === 'manifest.json' ? name : `src/${name}`}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
      const assets = Object.fromEntries(files.map(name => [name, show(name)]));
      return { ref, version: JSON.parse(assets['manifest.json']).version, assets: Object.fromEntries(files.map(name => [name, sha(assets[name])])) };
    } catch {}
  }
  throw Error('Cannot read the released build from origin/main or main');
})() : null;
const atomic = (file, bytes) => {
  const temp = `${file}.atlas-${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, bytes); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
};
const move = (from, to) => {
  try { fs.renameSync(from, to); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    fs.cpSync(from, to, { recursive: true });  // the archive is on another volume
    fs.rmSync(from, { recursive: true });
  }
};
// Serialize installs before taking snapshots; two cats/commands cannot mix a vault's three binaries.
const locks = [];
try {
  for (const vault of [...vaults].sort()) {
    const lock = path.join(vault, '.obsidian/plugins/clowder-atlas/.atlas-local-stage.lock');
    const fd = fs.openSync(lock, 'wx');
    locks.push(lock);
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, head })); }
    finally { fs.closeSync(fd); }
  }
  // Preflight every vault before changing any installation.
  const targets = vaults.map(vault => {
    const dir = path.join(vault, '.obsidian/plugins/clowder-atlas');
    const backup = path.join(dir, '.backup-last-release');
    const receipt = path.join(dir, '.atlas-local-stage.json');
    const baseline = fs.existsSync(path.join(backup, 'backup.json')) ? JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'))) : null;
    if (archive) return { vault, backup, receipt, to: path.join(archive, `${path.basename(vault)}-${baseline?.version ?? 'no-backup'}`) };
    const current = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(dir, name))]));
    if (JSON.parse(current['manifest.json']).id !== 'clowder-atlas') throw Error(`Unexpected plugin id: ${vault}`);
    const previousReceipt = fs.existsSync(receipt) ? fs.readFileSync(receipt) : null;
    if (rollback && !baseline) throw Error(`No stable backup for ${vault}`);
    if (baseline) for (const name of files) {
      if (sha(fs.readFileSync(path.join(backup, name))) !== baseline.assets[name]) throw Error(`Backup ${name} changed in ${vault}`);
    }
    if (staging && baseline && baseline.version !== released.version) {
      throw Error(`The stable backup in ${vault} is ${baseline.version}, from a finished release cycle; the released version (${released.ref}) is ${released.version}. `
        + 'Archive that cycle first: npm run stage:local -- --archive <directory> --vault <vault> [--vault <vault>]');
    }
    if (staging && !baseline && files.some(name => sha(current[name]) !== released.assets[name])) {
      throw Error(`${vault} does not run the released build ${released.version} (${released.ref}), so there is no stable version to back up before a trial. `
        + 'Install the released version there first; if a newer version was released, fetch it (git fetch origin).');
    }
    return { vault, dir, current, backup, receipt, previousReceipt, baseline };
  });
  if (archive) {
    const moves = targets.filter(target => fs.existsSync(target.backup) || fs.existsSync(target.receipt));
    if (new Set(moves.map(target => target.to)).size !== moves.length) throw Error('Two vaults have the same folder name; archive them one at a time, into different directories');
    for (const target of moves) if (fs.existsSync(target.to)) throw Error(`Already archived there: ${target.to}`);
    for (const target of targets) {
      const kept = [];
      if (moves.includes(target)) {
        fs.mkdirSync(target.to, { recursive: true });
        for (const item of [target.backup, target.receipt]) {
          if (!fs.existsSync(item)) continue;
          move(item, path.join(target.to, path.basename(item)));
          kept.push(path.basename(item));
        }
      }
      console.log(JSON.stringify({ vault: target.vault, mode: 'archived', archived: kept, to: kept.length ? target.to : null, installed: 'untouched', settings: 'untouched' }));
    }
  } else try {
    for (const target of targets) {
      const { dir, current, backup, receipt } = target;
      if (!target.baseline) {
        fs.mkdirSync(backup, { recursive: true });
        for (const name of files) atomic(path.join(backup, name), current[name]);
        target.baseline = { version: JSON.parse(current['manifest.json']).version, assets: Object.fromEntries(files.map(name => [name, sha(current[name])])) };
        atomic(path.join(backup, 'backup.json'), JSON.stringify(target.baseline, null, 2));
      }
      const next = rollback ? Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(backup, name))])) : candidate;
      for (const name of files) atomic(path.join(dir, name), next[name]);
      const state = { mode: rollback ? 'rolled_back' : 'local_trial', head, version: JSON.parse(next['manifest.json']).version,
        assets: Object.fromEntries(files.map(name => [name, sha(next[name])])), baseline: target.baseline, at: new Date().toISOString() };
      atomic(receipt, JSON.stringify(state, null, 2));
      console.log(JSON.stringify({ vault: target.vault, ...state, settings: 'untouched', activation: 'reload the plugin or reopen Obsidian' }));
    }
  } catch (error) {
    for (const target of targets) {
      for (const name of files) atomic(path.join(target.dir, name), target.current[name]);
      if (target.previousReceipt) atomic(target.receipt, target.previousReceipt);
      else if (fs.existsSync(target.receipt)) fs.unlinkSync(target.receipt);
    }
    throw error;
  }
} finally {
  for (const lock of locks) fs.unlinkSync(lock);
}
