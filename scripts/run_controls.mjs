// OM54 — prove the suite can fail (BB18 / F-GREENBLIND).
//
// Re-runs `vitest` with every `CONTROL:` case inverted. Passes only if EVERY
// control goes red (one per test file at least) and nothing else changes —
// i.e. the controls are wired to real assertions, not decoration.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'om54-'));
const out = path.join(dir, 'report.json');
spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], {
    stdio: 'ignore',
    shell: true,
    env: { ...process.env, OM54_INVERT_CONTROLS: '1' },
});
const report = JSON.parse(readFileSync(out, 'utf8'));
rmSync(dir, { recursive: true, force: true });

let bad = 0;
for (const file of report.testResults) {
    const name = path.basename(file.name);
    const controls = file.assertionResults.filter((a) => a.title.startsWith('CONTROL:'));
    const others = file.assertionResults.filter((a) => !a.title.startsWith('CONTROL:'));
    if (!controls.length) { console.log(`FAIL  ${name}: has no CONTROL case`); bad++; }
    for (const c of controls) {
        const red = c.status === 'failed';
        console.log(`${red ? 'RED ' : 'GREEN'}  ${name} :: ${c.title}`);
        if (!red) bad++;
    }
    const brokenOthers = others.filter((a) => a.status !== 'passed');
    if (brokenOthers.length) { console.log(`FAIL  ${name}: ${brokenOthers.length} non-control case(s) changed`); bad++; }
}
console.log(bad ? `\n${bad} problem(s): a control stayed green or is missing.` : '\nAll controls went red when inverted.');
process.exit(bad ? 1 : 0);
