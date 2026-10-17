// Downloads the prebuilt libvosk (Windows x64) into src-tauri/vendor/vosk. Plain Node, no dependencies.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ZIP =
  'https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-win64-0.3.45.zip';
const SHA256 = 'f1dcc9cca460630f81ea8f71794f69c80bed6556d2a4e6237b5785e1d2dff34b';
const dest = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'vendor', 'vosk');

if (existsSync(join(dest, 'libvosk.lib'))) {
  console.log('libvosk already present, skipping');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'vosk-'));
try {
  const res = await fetch(URL_ZIP, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== SHA256) throw new Error(`SHA-256 mismatch: expected ${SHA256}, got ${sha}`);
  const zip = join(tmp, 'vosk.zip');
  writeFileSync(zip, buf);
  mkdirSync(dest, { recursive: true });
  // Windows' own bsdtar (not a GNU tar from PATH) ships with Windows 10+ and reads zip files; --strip-components drops the vosk-win64-0.3.45/ prefix.
  execFileSync(
    join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'),
    ['-xf', zip, '-C', dest, '--strip-components=1'],
    { timeout: 120_000, stdio: 'inherit' },
  );
  if (!existsSync(join(dest, 'libvosk.lib')))
    throw new Error('libvosk.lib missing after extraction');
  console.log(`libvosk extracted to ${dest}`);
} catch (e) {
  console.error(`fetch-vosk: ${e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
