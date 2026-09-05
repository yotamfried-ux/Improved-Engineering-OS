/**
 * Architecture boundary rules (guide section 3 dependency direction, ADR-0004).
 *
 * This is enforcement mechanism 1 of 3. It catches what the import graph can
 * show: F1a, F2, F4, F5. It cannot show what code *does* -- F3 and F11 -- so
 * those live in the source scans and behavioural tests instead. The research
 * inventory is explicit that a dependency graph cannot prove "runtime never
 * writes knowledge", and this file does not pretend otherwise.
 *
 * Several rules below guard packages that do not exist yet. That is deliberate:
 * the commit that creates `packages/adapters/` or `packages/store-sqlite/` meets
 * an existing rule rather than negotiating with one.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'f1a-core-imports-no-workspace-package',
      comment:
        'F1a: packages/core is the agent-neutral centre. It depends on nothing in this ' +
        'workspace, so nothing in this workspace can leak into it.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^(packages/(?!core/)|tools/)' },
    },
    {
      name: 'f1a-core-imports-no-ieos-package-by-name',
      comment:
        "F1a, by specifier rather than by resolved path. pnpm's strict node_modules means an " +
        'undeclared workspace import does not resolve at all, so it would otherwise surface as ' +
        '"unresolvable" rather than as this rule firing. Catching the specifier makes the rule ' +
        'fire either way.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^@ieos/' },
    },
    {
      name: 'no-unresolvable',
      comment:
        'An import that cannot be resolved is analysed as nothing, which means every boundary ' +
        'rule silently passes over it. Unresolvable is an error, not a gap.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'f1b-core-imports-no-vendor-package',
      comment:
        'F1b: no vendor, agent or backend SDK inside core. MCP, Supabase and agent SDKs ' +
        'belong behind adapters (D2, D13).',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: {
        path: 'node_modules/(@modelcontextprotocol|@supabase|@anthropic-ai|openai|@aws-sdk|@google-cloud)',
      },
    },
    {
      name: 'f1b-core-performs-no-io',
      comment:
        'F1b: core owns contracts and pure domain logic. I/O reaches the domain only through ' +
        'ports (R-05). node:crypto is permitted -- it is pure computation, and D35 needs ' +
        'SHA-256 synchronously.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: {
        path: '^(fs|child_process|net|http|https|dns|worker_threads|cluster)$',
        dependencyTypes: ['core'],
      },
    },
    {
      name: 'f2-adapters-own-no-knowledge-semantics',
      comment:
        'F2: adapters deliver the Agent Contract; they never define ranking or read ' +
        'knowledge/ directly. Armed before packages/adapters/ exists.',
      severity: 'error',
      from: { path: '^packages/adapters' },
      to: { path: '^knowledge/' },
    },
    {
      name: 'f2-adapters-import-only-their-composition-set',
      comment:
        'F2: the guide fixes what an adapter may compose -- core, resolver, telemetry, ' +
        'assurance, store-sqlite, store-supabase. `releases` is deliberately not in that ' +
        'set: an adapter that could reach the index builder could rebuild knowledge on ' +
        'the fly, which is exactly the ownership F2 denies it.',
      severity: 'error',
      from: { path: '^packages/adapters' },
      to: {
        path: '^packages/(releases|curator|evidence-derivation)',
      },
    },
    {
      name: 'f4-domain-imports-no-store',
      comment:
        'F4: resolver, assurance and evidence-derivation talk to ports, not to a storage ' +
        'implementation. This is what keeps local evaluation working when the Evidence ' +
        'Plane is down (R-05). Armed before those packages exist.',
      severity: 'error',
      from: { path: '^packages/(resolver|assurance|evidence-derivation|curator)/' },
      to: { path: '^packages/store-' },
    },
    {
      name: 'f5-launcher-imports-only-node-builtins',
      comment:
        'F5: the launcher has zero runtime dependencies and never imports core (D18.2, C-02). ' +
        'Armed before packages/launcher exists (Stage 4).',
      severity: 'error',
      from: { path: '^packages/launcher' },
      to: { pathNot: '^(packages/launcher|node:)', dependencyTypes: ['npm', 'local'] },
    },
    {
      name: 'no-circular',
      comment: 'A cycle means the boundary it crosses is not a boundary.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'An unreachable module is either dead or a missing wire-up.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)(vitest|tsconfig)\\.',
          '\\.test\\.ts$',
          // This config, and the rule table the status check reads.
          '^fitness/(\\.dependency-cruiser\\.cjs|rules\\.ts)$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs'],
    },
  },
};
