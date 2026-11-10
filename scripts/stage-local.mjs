// Explicit operator-approved local trial only. Touch exactly the three plugin binaries; never copy data.json or notes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['main.js', 'styles.css', 'manifest.json']; // manifest last: version follows the installed code
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2), vaults = [];
const rollback = args[0] === '--rollback';
if (rollback) args.shift();
while (args.length) {
  if (args.shift() !== '--vault' || !args[0]) throw Error('Usage: stage-local.mjs [--rollback] --vault <vault> [--vault <vault>]');
  vaults.push(fs.realpathSync(args.shift()));
}
if (!vaults.length || new Set(vaults).size !== vaults.length) throw Error('Name each target vault once with --vault');
const head = rollback ? null : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!rollback && execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) throw Error('Commit the reviewed candidate before staging');
const candidate = rollback ? null : Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(root, 'dist', name))]));
if (candidate) {
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name === 'manifest.json' ? name : `src/${name}`));
    if (!candidate[name].equals(source)) throw Error(`Build ${name} is stale; run npm run build`);
  }
  if (JSON.parse(candidate['manifest.json']).id !== 'clowder-atlas') throw Error('Unexpected plugin id');
}
const atomic = (file, bytes) => {
  const temp = `${file}.atlas-${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, bytes); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
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
    const current = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(dir, name))]));
    if (JSON.parse(current['manifest.json']).id !== 'clowder-atlas') throw Error(`Unexpected plugin id: ${vault}`);
    const backup = path.join(dir, '.backup-last-release');
    const receipt = path.join(dir, '.atlas-local-stage.json');
    const previousReceipt = fs.existsSync(receipt) ? fs.readFileSync(receipt) : null;
    const baseline = fs.existsSync(path.join(backup, 'backup.json')) ? JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'))) : null;
    if (rollback && !baseline) throw Error(`No stable backup for ${vault}`);
    if (baseline) for (const name of files) {
      if (sha(fs.readFileSync(path.join(backup, name))) !== baseline.assets[name]) throw Error(`Backup ${name} changed in ${vault}`);
    }
    return { vault, dir, current, backup, receipt, previousReceipt, baseline };
  });
  try {
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
