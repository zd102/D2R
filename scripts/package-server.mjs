import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, access, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const destination = resolve(process.env.PACKAGE_DIR || 'release/package');
try { await access(destination); throw new Error(`Package destination already exists: ${destination}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') throw new Error('Packaging requires Windows or Linux x64');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${manifest.version}`) throw new Error('Tag must match package.json version');
await mkdir(join(destination, 'app'), { recursive: true });
await mkdir(join(destination, 'runtime'));
await cp(process.env.D2R_BUILD_DIR || 'dist', join(destination, 'dist'), { recursive: true });
await build({ entryPoints: ['server/deploy.mjs'], outfile: join(destination, 'app/server.mjs'), bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external' });
for (const filename of ['package.json', 'package-lock.json']) await cp(filename, join(destination, filename));
// Install only locked production dependencies, without running dependency lifecycle scripts.
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: destination, stdio: 'inherit', shell: process.platform === 'win32' });
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
await cp(process.execPath, join(destination, 'runtime', nodeName));
await chmod(join(destination, 'runtime', nodeName), 0o755);
async function download(url, filename, digest, cachedFile) {
  let bytes;
  if (cachedFile) bytes = await readFile(cachedFile);
  else {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Download failed: ${url}: ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        break;
      } catch (error) { if (attempt === 2) throw error; }
    }
  }
  if (digest && createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error(`Checksum mismatch: ${url}`);
  await writeFile(join(destination, filename), bytes);
}
await download(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, 'runtime/NODE-LICENSE.txt');
for (const filename of ['server.env', ...(process.platform === 'win32'
  ? ['d2r-server.xml', 'setup-service.ps1'] : ['install.sh', 'd2r-server.service'])]) {
  await cp(join('packaging', filename), join(destination, filename));
}
if (process.platform === 'win32') {
  await download('https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe', 'd2r-server.exe', 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f', process.env.WINSW_FILE);
  await download('https://raw.githubusercontent.com/winsw/winsw/v2.12.0/LICENSE.txt', 'runtime/WINSW-LICENSE.txt');
}
await cp('docs/server-release.md', join(destination, 'README.md'));
console.log(`Packaged D2R Server ${manifest.version}: ${destination}`);
