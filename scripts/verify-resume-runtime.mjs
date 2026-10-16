import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Test the files actually traced for a server action, not the developer's full
// node_modules tree. This catches missing native PDF.js and worker dependencies.
const root = resolve(import.meta.dirname, '..');
const tracePath = join(root, '.next/server/app/profile/page.js.nft.json');
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const folder = await mkdtemp(join(tmpdir(), 'roledex-resume-runtime-'));
try {
  const files = trace.files.map(file => resolve(dirname(tracePath), file))
    .filter(file => relative(root, file).startsWith('node_modules/'));
  for (const source of files) {
    const destination = join(folder, relative(root, source));
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
  await cp(join(root, 'tests/fixtures/pilot-resume.pdf'), join(folder, 'resume.pdf'));
  await writeFile(join(folder, 'verify.mjs'), `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { PDFParse } from 'pdf-parse';
    const parser = new PDFParse({data:new Uint8Array(await readFile('./resume.pdf'))});
    try {
      const result = await parser.getText();
      assert.match(result.text,/Implementation Analyst/);
      assert.match(result.text,/SQL/);
      console.log('Traced PDF runtime extracted the real fixture successfully.');
    } finally { await parser.destroy(); }
  `);
  const output = execFileSync(process.execPath, ['verify.mjs'], { cwd: folder, encoding: 'utf8', timeout: 30_000 });
  assert.match(output, /successfully/);
  console.log(output.trim());
} finally { await rm(folder, { recursive: true, force: true }); }
