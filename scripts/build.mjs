// The runtime is handwritten CommonJS JavaScript. Copy the reviewed source; no transpiler or downloaded code.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw Error('package and manifest versions differ');
await mkdir(resolve(root, 'dist'), { recursive: true });
const hashes = {};
for (const name of ['main.js', 'styles.css', 'manifest.json']) {
  const bytes = await readFile(resolve(root, name === 'manifest.json' ? name : `src/${name}`));
  if (name !== 'manifest.json') await writeFile(resolve(root, name), bytes);
  await writeFile(resolve(root, 'dist', name), bytes);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
}
console.log(JSON.stringify({ version: manifest.version, assets: hashes }, null, 2));
