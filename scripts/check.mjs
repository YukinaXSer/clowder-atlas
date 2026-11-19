import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(resolve(root, name), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const pkg = JSON.parse(await read('package.json'));
const versions = JSON.parse(await read('versions.json'));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'));
assert.match(manifest.name, /^[A-Za-z0-9 ()+-]+$/);
assert.match(manifest.version, semver);
assert.match(manifest.minAppVersion, semver);
assert.equal(manifest.version, pkg.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.match(manifest.description, /^[\x20-\x7e]+$/);
assert.equal(manifest.isDesktopOnly, true);
for (const name of ['README.md', 'README.zh-CN.md', 'LICENSE', 'PRIVACY.md', 'RELEASE_NOTES.md']) assert((await read(name)).trim());
assert((await read('LICENSE')).startsWith('MIT License'));
const assets = ['main.js', 'manifest.json', 'styles.css'];
assert.deepEqual((await readdir(resolve(root, 'dist'))).sort(), assets.toSorted());
for (const name of assets) {
  assert.equal(await read(`dist/${name}`), await read(name), `dist/${name} differs`);
  if (name !== 'manifest.json') assert.equal(await read(name), await read(`src/${name}`));
}
const src = await read('main.js');
assert(!/(?:\/Users\/|\/var\/folders\/|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,})/.test(src), 'private path or credential-shaped literal');
assert(!/\b(?:eval\s*\(|new\s+Function\s*\(|import\s*\(|innerHTML\s*=|outerHTML\s*=)/.test(src), 'dynamic code or raw HTML sink requires review');
const imports = [...src.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
assert.deepEqual([...new Set(imports)], ['obsidian']);
// Zero-emoji UI: icons are Obsidian's own line icons (setIcon), labels are plain text. Comments are held to it too.
const decorative = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}★☆◆◇✦✧✓✔✗✘✕＋↻↩↗↖←⬆⬇]/u;
// The gate, checked on itself: a pictograph, a flag (two regional indicators), a keycap and a tick are caught; the
// punctuation the UI text does use is not.
for (const symbol of ['\u{1F43E}', '\u{1F1E8}\u{1F1F3}', '1\u{FE0F}\u{20E3}', '\u{2713}']) assert(decorative.test(symbol), `the emoji gate misses ${JSON.stringify(symbol)}`);
assert(!decorative.test('透镜 · 对话 — 「引用篮」 #1 + 引用篮 → 第 3–5 行 × … ›'), 'the emoji gate rejects plain punctuation');
for (const name of ['src/main.js', 'src/styles.css']) {
  const hits = (await read(name)).split('\n').flatMap((line, i) => decorative.test(line) ? [`${name}:${i + 1}: ${line.trim().slice(0, 80)}`] : []);
  assert.deepEqual(hits, [], `emoji or decorative symbols in the plugin UI:\n${hits.join('\n')}`);
}
const host = { Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} };
const sandbox = { module: { exports: {} }, require: name => { assert.equal(name, 'obsidian'); return host; }, URL, Set, Map, console, setTimeout, clearTimeout, setInterval, clearInterval };
vm.runInNewContext(src + '\nmodule.exports.__defaults = DEFAULT_SETTINGS;', sandbox);
assert.equal(sandbox.module.exports.__defaults.catCafeEnabled, false);
assert.equal(typeof sandbox.module.exports, 'function');
const defaults = sandbox.module.exports.__defaults;
assert.equal(defaults.failedSends.length, 0);
assert.equal(Object.keys(defaults.revisionTargets).length, 0);
console.log('PASS metadata, deterministic assets, clean install defaults, runtime import, and release allowlist');
console.log('Static checks are local preflight checks, not the official directory scanner or a complete security audit.');
