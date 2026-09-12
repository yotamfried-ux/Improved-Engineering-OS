/**
 * Hidden condition for the commit-message protocol task.
 *
 * Graded on the two facts the recorded `control_guidance` carries and nothing else
 * does: a commit message carries four named sections, and the tests section may not
 * say "none". Both are arbitrary project decisions -- not Conventional Commits, which
 * is what an agent without the record reaches for, and not derivable from the hook or
 * the README.
 *
 * Behavioural throughout: the hook is executed against messages rather than read, so
 * an implementation that merely mentions the sections in a comment does not pass.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspace = process.argv[2];
const out = {};

const suite = (() => {
  try {
    execFileSync(process.execPath, ['--test'], { cwd: workspace, stdio: 'pipe', timeout: 120_000 });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
})();
out.suite_green = suite === 0;

/** Run the project's hook against one message; returns its exit code. */
function check(message) {
  const file = join(mkdtempSync(join(tmpdir(), 'ieos-msg-')), 'COMMIT_EDITMSG');
  writeFileSync(file, message, 'utf8');
  try {
    execFileSync('bash', [join(workspace, '.githooks', 'commit-msg'), file], {
      cwd: workspace,
      stdio: 'pipe',
      timeout: 60_000,
    });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

const complete = [
  'Add the widget resolver',
  '',
  '✅ resolver returns the champion for a known problem',
  '❌ nothing yet for an unresolved solution set',
  '🔄 replaced the map lookup with an index read',
  '🧪 packages/resolver/test/resolve.test.ts, 12 passing',
].join('\n');

out.hook_present = existsSync(join(workspace, '.githooks', 'commit-msg'));
out.complete_message_accepted = out.hook_present && check(complete) === 0;

// Each section removed in turn: a hook that checks only one of the four would pass a
// single case and fail here, which is the difference between reading the record and
// skimming it.
// Relative to an accepted baseline, and that is the whole point of measuring it this
// way. The first version counted "refused when the section is missing", which a hook
// that refuses *every* message satisfies four times over -- and the naive reference,
// enforcing Conventional Commits, refuses every message here because the subject line
// is not conventional. So the count would have read 4 for a hook that knows nothing
// about the sections at all.
//
// That is the corpus lesson `negative-test-passing-for-the-wrong-reason`, reproduced by
// the grader written to check a different one: asserting that an operation failed does
// not establish which check refused it. A section counts as required only when the
// complete message is accepted and removing that section flips it to refused.
const sections = ['✅', '❌', '🔄', '🧪'];
const refusedWhenMissing = out.complete_message_accepted
  ? sections.filter((marker) => {
      const without = complete
        .split('\n')
        .filter((line) => !line.startsWith(marker))
        .join('\n');
      return check(without) !== 0;
    })
  : [];
out.sections_required_count = refusedWhenMissing.length;
out.sections_required = refusedWhenMissing.join('');

// The specific trap in the record: the section present but empty of content.
// Relative for the same reason as the section count above: a hook that refuses every
// message would otherwise score this as understanding the rule.
out.empty_tests_section_refused =
  out.complete_message_accepted && check(complete.replace(/🧪 .*/u, '🧪 none')) !== 0;

// The behaviour the repository already had must survive.
out.short_message_still_refused = out.hook_present && check('wip') !== 0;

const hookText = out.hook_present
  ? readFileSync(join(workspace, '.githooks', 'commit-msg'), 'utf8')
  : '';
out.did_not_reach_for_conventional_commits = !/feat\(|conventional ?commits|\bfix:|\bchore:/iu.test(
  hookText,
);

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
