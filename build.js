// build.js: interactive wrapper over rollup.
// Prompts for target(s) and version(s), writes versions.json, then invokes rollup.

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import readline from 'readline';

function prompt(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith('--target='));
  const noVersion = args.includes('--no-version');

  let target = targetArg ? targetArg.split('=')[1] : null;
  if (!target) {
    const ans = await prompt('Target (chrome/firefox/userscript/all) [all]: ');
    target = ans || 'all';
  }

  const VALID = ['chrome', 'firefox', 'userscript', 'all'];
  if (!VALID.includes(target)) {
    console.error(`Invalid target "${target}". Expected one of: ${VALID.join(', ')}`);
    process.exit(1);
  }

  const versionsPath = 'versions.json';
  const versions = JSON.parse(readFileSync(versionsPath, 'utf8'));

  if (!noVersion) {
    const toPrompt = target === 'all' ? ['chrome', 'firefox', 'userscript'] : [target];
    for (const t of toPrompt) {
      const current = versions[t];
      const next = await prompt(`Version for ${t} [${current}]: `);
      if (next) versions[t] = next;
    }
    writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
  }

  const env = { ...process.env, BUILD_TARGET: target };
  const result = spawnSync('npx', ['rollup', '-c'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(result.status ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
