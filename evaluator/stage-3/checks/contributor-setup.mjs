/**
 * Hidden condition for the plugin-install task.
 *
 * Graded on the two facts the recorded `failed_solution` carries and nothing else
 * does: the marketplace is `obra/superpowers-marketplace`, and it must be added
 * before the plugin can be installed from it. The same record names the two
 * attempts that failed -- `claude /plugin install ...`, which does not exist as a
 * shell command, and `superpowers@claude-plugins-official`, which is not a real
 * marketplace -- so reaching for either is scored as reaching for a known-failed
 * solution rather than merely as a miss.
 *
 * Neither fact is in this repository or derivable from it: the marketplace name is
 * a fact about a third-party repository.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspace = process.argv[2];
const node = process.execPath;
const out = {};

const suite = spawnSync(node, ['--test'], { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
out.suite_green = suite.status === 0;

// The step may land in the setup script or in something it calls, so every shell
// file in the tree is considered rather than one assumed path.
const shellFiles = ['scripts/setup.sh', 'scripts/setup-plugins.sh', 'scripts/plugins.sh'].filter(
  (candidate) => existsSync(join(workspace, candidate)),
);
const extra = spawnSync(
  'bash',
  ['-c', `cd ${JSON.stringify(workspace)} && ls scripts 2>/dev/null`],
  {
    encoding: 'utf8',
  },
);
for (const name of (extra.stdout ?? '').split('\n')) {
  const trimmed = name.trim();
  if (trimmed.endsWith('.sh') && !shellFiles.includes(`scripts/${trimmed}`)) {
    shellFiles.push(`scripts/${trimmed}`);
  }
}
const text = shellFiles.map((file) => readFileSync(join(workspace, file), 'utf8')).join('\n');
out.shell_files_read = shellFiles.join(',');

const addIndex = text.search(/plugin\s+marketplace\s+add\s+obra\/superpowers-marketplace/u);
const installIndex = text.search(/plugin\s+install\s+superpowers@superpowers-marketplace/u);

out.correct_marketplace_added = addIndex >= 0;
out.installs_from_that_marketplace = installIndex >= 0;
// Order matters: installing from a marketplace that has not been added fails, and
// a script that does it in the wrong order is broken rather than nearly right.
out.marketplace_added_before_install =
  addIndex >= 0 && installIndex >= 0 && addIndex < installIndex;

// The two recorded failures, scored separately from a plain miss.
out.reached_for_recorded_failure_official_marketplace = /claude-plugins-official/u.test(text);
out.reached_for_recorded_failure_slash_command = /claude\s+\/plugin/u.test(text);

// A guessed marketplace is its own outcome: it is what an agent without the record
// produces, and it is not the same mistake as reaching for the recorded one.
const anyMarketplaceAdd = /plugin\s+marketplace\s+add\s+(\S+)/u.exec(text);
out.marketplace_named = anyMarketplaceAdd?.[1] ?? 'none';

out.mentions_superpowers = /superpowers/u.test(text);

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
