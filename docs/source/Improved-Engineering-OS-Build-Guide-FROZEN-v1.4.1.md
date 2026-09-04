# Improved-Engineering-OS — End-to-End Build Guide

| Field | Value |
|---|---|
| Document status | `1.4.1 — FINAL, FROZEN for Stage 0` — execution guide layered on the owner's `Architecture Baseline 1.0` report. Architecture phase closed after five review rounds plus one consistency patch. Further gaps are discovered through Stages 0–3, not through more design rounds. |
| Source report | "Improved-Engineering-OS — דוח ארכיטקטורה סופי ותוכנית מימוש מבוססת ראיות" (4 Sep 2026) |
| Supersedes | `1.4`, `1.3`, `1.2`, `1.1`, `1.0-review` (same file, PR #288 history) |
| Written from | Engineering-OS repository, branch `claude/engineering-os-project-guide-roj911` |
| Verified against | this repository's lessons and Project 8 findings; official docs via Context7 for Supabase, MCP `2026-07-28`, Node.js, pnpm, better-sqlite3, Zod 4, GitHub releases/attestations/Apps, Claude Code and Codex CLI (Appendix B) |
| Consumers | (1) the owner, for the review verdict and the decisions to approve; (2) the coding agent that builds the new repository |
| Precedence | Architecture Constitution in the report > this guide > agent judgment. Where this guide changes the report, the change is marked `CHANGED` and explained. |

---

## 0. הקדמה למשתמש (עברית)

המסמך הזה עושה שלושה דברים:

1. **ביקורת** — עובר על 17 ההחלטות ועל תוכנית ה-Stages ומכריע לכל אחת: `CONFIRMED`, `CONFIRMED+CHANGE` או `GAP`. כל פער שעלול להפוך לחוב טכני מקבל מזהה `TD-xx`, חומרה, ופתרון קונקרטי (סעיף 1).
2. **השלמות** — מוסיף החלטות D18–D36 שהדוח לא סגר אבל אי אפשר לבנות בלעדיהן. כל אחת מסומנת `PROPOSED` עד שתאשר, עם ברירת מחדל מומלצת כדי שהסוכן לא ייתקע (סעיף 2).
3. **מדריך בנייה** — מבנה הריפו, ואז לכל Stage: מה בונים, באילו נתיבים, אילו ממשקים, אילו בדיקות/סימולציות, ומה שער היציאה (סעיפים 3–7).

**מה השתנה בגרסה 1.1.** סבב הביקורת השני (סעיף 1.4) זיהה שהמדריך בגרסה 1.0 גלש בכמה מקומות לכיוון המערכת הישנה ורחוק מהעקרונות של הדוח. השינויים המהותיים:

- **ה-vertical slice של סוכן אמיתי עבר מ-Stage 8 ל-Stage 3.** בונים רק את המינימום שנדרש כדי שסוכן אמיתי ישתמש במערכת, מוכיחים שזה טבעי, ורק אז מרחיבים. זה בדיוק הלקח מהכשל של המערכת הישנה.
- **הסוכן לא מקבל יותר את הזהות שלך.** במקום refresh token של ה-owner, כל installation מקבלת credential צר שמאפשר רק `telemetry.insert`, `observation.insert` וקריאה מינימלית דרך Edge Function. ה-Curator וה-admin הם זהויות נפרדות בצד השרת (D22, D31).
- **אין יותר fallback של טלמטריה דרך Git.** אם ingest נכשל אחרי retries, ה-run מסומן `telemetry_state: INCOMPLETE` ואינו כשיר ל-qualification. אובדן טלמטריה לעולם לא נראה כ-run שנמדד (D23).
- **אין `candidate` בתוך `knowledge/` הקנוני.** Observations ו-Candidates חיים ב-Supabase staging; ל-Git נכנס רק ידע שאושר. הייבוא מהמערכת הישנה הוא Bulk Import Promotion PR (D19, Stage 5).
- **Assurance ו-Evidence לא תלויים ב-Supabase.** ה-domain מדבר עם ports; `store-supabase` מיישם אותם (סעיף 3).
- **Supabase managed בלבד ב-v1.** אין abstraction לשני backends (D30).
- **Derivation reproducible:** מזהי Evidence דטרמיניסטיים, `input_snapshot_hash`, ו-supersession במקום overwrite (D32).
- **Holdout לא מזהם את עצמו:** Active Holdout לעולם אינו input לאופטימיזציה (D33).
- **תיקונים קטנים:** dependency selectors ל-staleness, `context_snapshot_id` ב-Agent Contract, `emitter_id` בטלמטריה, SQLite ב-WAL במקום החלפת קבצים, Node 24 LTS ו-pin של pnpm, ריכוך ה-governance (ADR רק לגבולות ארכיטקטוניים; מטריצת CI מלאה אחרי ה-slice).

**מה השתנה בגרסה 1.2.** סבב הביקורת השלישי (סעיף 1.5) סגר את הפערים האחרונים בחוזים ובגבולות האמון:

- **Champion מוצמד ל-release.** Scores חיים ומתעדכנים; ההמלצה הקנונית משתחררת. Evidence חדש מסמן `challenge_state: challenged` ופותח Promotion Proposal, אבל ברירת המחדל מתחלפת רק אחרי PR ו-release חדש (D34).
- **D31 פוצל.** Curator עם סמכות Supabase בלבד מייצר Promotion Proposal מאומת; Promoter נפרד, שרץ ב-GitHub Actions של הריפו הקנוני, מחזיק רק סמכות GitHub ופותח את ה-PR. אף רכיב אחד לא מחזיק את שתי הסמכויות.
- **Stage 2 כולל evidence kernel מינימלי ו-investigation גולמי**, כדי ש-Stage 3 יוכל לדרוש telemetry → evidence → investigation בלי implementation זרוק. Stage 7 מרחיב, לא מחליף.
- **Stage 3 הוא סוכן ראשי בלבד.** parity בין Claude ל-Codex עוברת ל-Stage 8.
- **`observe` הוא idempotent באמת:** `observation_id` נוצר בצד הקורא ו-UNIQUE בשרת. **`context_snapshot_id`** הוא רשומה דטרמיניסטית, durable, שנשמרת local-first ומסתנכרנת; `inspect` מקבל handle מסוג.
- **תיקון עובדתי על MCP:** שרתים חייבים לממש `server/discover`; לקוחות אינם חייבים לקרוא לו. IEOS מיישם אותו ולא הופך אותו לדרישת תאימות.
- **ה-launcher לא ממציא verifier קריפטוגרפי.** digest SHA-256 חובה בתוך ה-launcher; אימות attestation דרך `gh release verify` / `gh attestation verify` או ספרייה מוכחת, נדרש ב-qualification.
- **Installation token:** invariants מפורשים (אנטרופיה, השוואה בזמן קבוע, מגבלות קצב וגודל, scopes מדויקים, והשרת בלבד קובע `origin_class` ו-`installation_id`).
- **`main` תמיד releasable**, לא "release-only"; releases הם tags ו-artifacts immutable.

**מה השתנה בגרסה 1.3 (סופית).** סבב הביקורת הרביעי (סעיף 1.6) היה ניקוי חוזים, לא redesign:

- **D21 מיושר ל-D31:** Curator → Promotion Proposal חתום → Promoter → branch + PR. ה-Curator לא נוגע ב-Git.
- **D24 עובד גם לפני שיש Evidence Plane:** Stages 0–1 מייצרים `scores.snapshot.json` דטרמיניסטי במצב `UNPROVEN`; snapshot אמיתי רק מ-Stage 2.
- **Run Classification Authority (D36):** רק service principal (ה-harness) רושם מראש `run_id → origin_class`; ה-ingest חותם `origin_class` מרשומת ה-Run בלבד; run לא רשום = `operational`.
- **Hashing Contract (D35):** RFC 8785 (JCS) ל-JSON, UTF-8, נרמול LF לטקסט, קבצים לפי נתיב יחסי בסדר לקסיקוגרפי, SHA-256. אותו כלל ל-`content_hash`, `context_snapshot_id`, `input_snapshot_hash` וחתימות proposal.
- **Champion אחד מלפנים:** `resolve` מחזיר רק את ה-Champion עם סטטוס תצוגה אחד; פרטי ה-Challenger רק ב-`inspect`/`expand`.
- **Score view קבוע ל-qualification:** `ranking_mode: live_overlay | recorded` ו-`score_view_id`; replay ו-qualification משתמשים ב-view מוקלט ובלתי-משתנה.
- **Principals:** `principal_kind: installation | service`; Promoter ו-harness הם service principals עם scopes משלהם; מפתח ה-GitHub App נשמר כ-Actions secret בריפו הקנוני.
- **חתימת ה-Curator מנוסחת ביושר:** מוכיחה שה-proposal הגיע מה-Evidence Plane המאושר, לא בידוד בין processes באותו פרויקט Supabase.
- **Stage 2 בונה hooks של הסוכן הראשי בלבד;** D29 מנוסח ללא תלות בכלי מחקר ספציפי; יישור F1–F11 ו-D18–D36 בכל הטקסט.

**מה השתנה בגרסה 1.4 (patch סופי לפני Stage 0).** סבב חמישי מצא סתירה אחת אמיתית ושלושה חיזוקים; אף אחד מהם אינו שינוי ארכיטקטורה:

- **Solution Set יכול להיות `unresolved` (בלוקר שתוקן).** D34 דרש Champion לכל Solution Set, Stage 5 אסר על ה-importer לבחור Champion, ו-D19 אסר להמציא Champion בלי Evidence. שלושתם לא יכלו להתקיים יחד. עכשיו `champion_id: null` חוקי, עם מכונת מצבים `unresolved → pinned → challenged → pinned`. כשאין Champion, `resolve` מחזיר `unresolved_solution_set` ולא בוחר מנצח זמני.
- **דרגות אמינות לראיה.** `integrity.source_authority` ו-`integrity.verification` בחוזה ה-Evidence, עם הכלל שטלמטריה תפעולית שמקורה בלקוח לבדה לעולם אינה `directly_verified`. סוכן שנפרץ יכול להטות משקל קטן, לא להכריע promotion.
- **`effective_score_view_id`.** ה-context snapshot שומר את קלטי הדירוג שבאמת השפיעו על אותה החלטה, לא רק digest. חקירה אחרי חודש יכולה לשחזר למה הוצע נכס מסוים, בלי לשמור עותק של כל הקטלוג בכל `resolve`.
- **מסגור עץ ב-D35.** hash לכל קובץ, manifest ממוין, JCS, ואז SHA-256 אחד. בלי שרשור דו-משמעי של נתיבים ובתים.
- **שני תיקוני ניסוח:** rotation של holdout לפי צריכה/חשיפה ולא לפי "שימוש בהחלטת release", ו-D34 מדויק יותר: release מוצמד מקבע את ה-Champion לכל Solution Set, לא את כל סדר התוצאות.

**מה השתנה ב-1.4.1 (patch עקביות, בלי שינוי ארכיטקטורה).** ארבע נקודות בטקסט התנגשו זו בזו, ועוד דיוק אחד בסף ההכרעה:

- **`champion_state` היו לו שני בעלים.** אותו שדה נשלט גם ב-Git/release וגם ב-Evidence Plane, בניגוד ל-State Ownership Constitution. עכשיו הוא מפוצל: `canonical_state: unresolved | pinned` בבעלות Git ו-release, ו-`challenge_state: none | challenged` שהוא ערך נגזר ב-runtime. ה-UX ב-`resolve` נשאר פשוט.
- **D35 היה רחב מדי** והתנגש עם F5 (ה-launcher לא מייבא core) ועם D22 (hash של token). עכשיו מבחינים בין שלושה סוגים: canonical structured hashing ב-`hashing.ts`, שלמות artifact גולמי ב-launcher, ואימות credential במודול האימות. רק הראשון מגדיר זהויות קנוניות.
- **D32 השתמש בפורמט hash שאינו D35.** `evidence_id` עובר ל-JCS כמו כל מזהה דטרמיניסטי אחר.
- **Bootstrap Promotion סתר את D21 ו-F3.** לפני Stage 10 אין Promoter, ולכן ה-importer מייצר bundle מקומי בלבד וה-owner פותח את ה-PR. ה-importer לעולם לא עושה push. מ-Stage 10 ואילך: Curator → Promoter.
- **סף ההכרעה דויק:** `reported` הוא אות ניקוד בלבד, `observed` הופך מועמד לראוי-ראיה, `corroborated` ומעלה נדרש להצעת promotion, ורק promotion מאושר עם release הופך set ל-`pinned`. אין מסלול נסתר מ-`unresolved` ל-`pinned`.

**איך להשתמש:** פתח ריפו חדש, הכנס לתוכו את הדוח המקורי כ-`ARCHITECTURE.md` ואת המסמך הזה כ-`BUILD-GUIDE.md`, אשר או שנה את D18–D36 (טבלה בסעיף 2.0), ואז תן לסוכן את ההנחיה בסעיף 6.1. השאר כתוב באנגלית בכוונה: זו השפה שבה הסוכן מפרש מפרט בצורה הכי חד-משמעית.

---

## 1. Review verdict

### 1.1 Decision-by-decision

| Decision | Verdict | Note |
|---|---|---|
| D1 Personal system | CONFIRMED | Keep `owner_id` in every durable row from day one anyway (RLS needs it; costs nothing). |
| D2 Claude + Codex first, neutral core | CONFIRMED | Enforced mechanically by fitness test F1 (Section 4, Stage 0). Both agents now expose lifecycle hooks (Appendix B), so adapters can stay thin. |
| D3 Central canonical repo | CONFIRMED | Monorepo layout fixed in Section 3. |
| D4 Thin project footprint | CONFIRMED+CHANGE | The footprint must be *generated*, never hand-edited, and must include the agent bootstrap files. See D18.4 and TD-07. |
| D5 Dynamic Project Profile | CONFIRMED | `spec` in Git, `status` in Evidence Plane as written. Add `installation_id` to observations (TD-05). |
| D6 Asset model | CONFIRMED+CHANGE | Schema is metadata only; body storage, identity minting and legacy IDs were unspecified. Closed by D19, D20. Canonical lifecycle no longer contains `candidate` (R-04). |
| D7 Evidence-based catalog, Champion | CONFIRMED+CHANGE | Requires an offline score snapshot in the release or `resolve` fails without network (D24). Holdout evidence may never select a Champion (D33). **Champion is release-pinned; scores are live** (D34). |
| D8 Observation → Curation → Admission | CONFIRMED+CHANGE | Promotion needs a concrete mechanism: a validated Promotion Proposal produced by a Curator (Supabase authority only) and a pull request opened by a separate Promoter (GitHub authority only). Closed by D21, D31. |
| D9 `resolve / inspect / expand` | CONFIRMED+CHANGE | Read-only contract has no write side. Add `observe`; add `context_snapshot_id` so every recommendation is explainable. Closed by D25. |
| D10 Adaptive Assurance | CONFIRMED+CHANGE | Staleness must be scoped by paths *and* dependency selectors, not by "any commit". Closed by D27. Assurance must not depend on the storage backend (Section 3). |
| D11 Telemetry / Evidence | CONFIRMED+CHANGE | Correct for a persistent machine; ephemeral remote sessions need a direct-ingest strategy with an honest `INCOMPLETE` state, never a Git detour. Closed by D23, D26. |
| D12 Pinned releases, launcher | CONFIRMED+CHANGE | Launcher runtime unspecified; also not needed for the first vertical slice. Closed by D18.2 and the new Stage 4. |
| D13 Future-adaptive agent integration | CONFIRMED | MCP `2026-07-28` verified: stateless core, servers must implement `server/discover` (clients need not call it; requests are self-describing), handles as tool arguments. The EOS MCP adapter is stateless by construction. |
| D14 Verification, evals | CONFIRMED+CHANGE | Evaluator isolation needs a physical mechanism; agent trials need headless drivers (`claude -p` / Agent SDK with `setting_sources=[]`, `codex exec --json`). Holdout policy formalized (D33). |
| D15 Dynamic external ecosystem | CONFIRMED | Freshness classes need a TTL policy file from Stage 11; no change to design. |
| D16 Reuse knowledge, rebuild system | CONFIRMED | Import corpus and exclusion list in Appendix A; import now goes through a promotion PR, not directly into `knowledge/`. |
| D17 Simulation-gated implementation | CONFIRMED+CHANGE | Stage *order* changed so the first real-agent slice is proven at Stage 3, before bulk import, releases, assurance and scoring (R-01). |

### 1.2 Technical-debt findings (first review round)

Severity: **S1** = would force a redesign or data migration later; **S2** = would cause recurring friction or silent wrong behavior; **S3** = cleanup cost only.

| ID | Sev | Finding | Why it becomes debt | Resolution |
|---|---|---|---|---|
| TD-01 | S1 | No implementation language, runtime, package layout or supported platforms are decided. | The first agent session decides them implicitly and every later stage inherits the accident. | D18 |
| TD-02 | S1 | Telemetry design assumes a persistent local machine with a durable SQLite outbox. Claude Code on the web / cloud sessions run in ephemeral containers; the outbox dies with them. This exact failure produced `telemetry_events_count: 0` in two real Project 8 runs. | Stage 5 passes on a laptop and the real canary silently produces no evidence. | D23 |
| TD-03 | S1 | Asset Score is derived in the Evidence Plane but `resolve` must work offline and must not block coding. | Either `resolve` grows a hidden network dependency or scores are duplicated ad hoc. | D24 |
| TD-04 | S1 | Asset schema has no body/content model, no identity-minting rule, no rename rule, no legacy ID mapping. | Import invents a layout under time pressure; retrieval then depends on it. | D19, D20 |
| TD-05 | S2 | Telemetry envelope lacks `installation_id`, `session_kind` and a per-process writer identity. | Dedupe and causal ordering break with two environments or two processes on one Work Item. | D26 |
| TD-06 | S2 | `attributes: key: value` is free-form. This repository already learned that only an allowlist reconstruction is safe. | Secrets/prompt fragments end up in Supabase. | D26 |
| TD-07 | S2 | "Optional minimal agent bootstrap" in the target project is undefined. | Agent never discovers EOS, or the bootstrap drifts from the pin. | D18.4 |
| TD-08 | S2 | Promotion approval has no mechanism. | Approval state ends up in a side database. | D21, D31 |
| TD-09 | S2 | `stale_after_revision_change: true` at repository granularity. | Every commit invalidates every Control. | D27 |
| TD-10 | S2 | Agent Contract is read-only. | Attribution has to be guessed from traces. | D25 |
| TD-11 | S2 | Supabase plan tier, backups and export undecided; Free plan pauses after 7 idle days and has no downloadable backups (verified). | Evidence Plane pauses during a quiet fortnight. | D30 |
| TD-12 | S2 | Credential boundary described but not concretized. | Someone puts a secret key in `.env` "temporarily". | D22 |
| TD-13 | S2 | Retrieval mechanism unspecified; vendor embeddings would couple the core to a provider. | Provider lock-in inside the resolver. | D20.3 |
| TD-14 | S2 | Problem/capability taxonomy has no owner or growth rule. | "One Champion per equivalent problem" becomes undecidable. | D28 |
| TD-15 | S2 | No dependency policy for EOS itself. | The pinned release is reproducible but its inputs are not. | D29 |
| TD-16 | S3 | Evaluator workspace isolation is a principle without a mechanism. | Hidden fixtures leak into the agent checkout. | Stage 0 layout + harness `setting_sources=[]`. |
| TD-17 | S3 | Report citations are unresolved placeholders (`citeturn…`). | The document cannot be audited or refreshed. | Replace with URLs from Appendix B before committing the report as `ARCHITECTURE.md`. |
| TD-18 | S3 | The 17 decisions exist only inside one large report. | No per-decision history. | Stage 0: one baseline ADR referencing the report; individual ADRs only for D18+ (softened in 1.1, see R-12). |
| TD-19 | S3 | Named real projects appear in stage manifests. | Core or fixtures acquire project-specific paths. | Fitness test F6 (scoped); canaries live in `qualification/targets/*.yaml`. |
| TD-20 | S3 | Agent trial cost is unbudgeted. | Stages get skipped "for now". | Stage 0 budget record; Section 7 item 9. |

### 1.3 Corrections to the report text

- Replace every `citeturn…` token with a real URL (Appendix B has the verified ones).
- "MCP moved to a stateless core in July 2026": verified. Add: protocol-level sessions and session headers were removed from Streamable HTTP; **servers must implement** `server/discover`, while clients are not required to call it because every request carries protocol version and capabilities in `_meta` (a mismatch yields error `-32022`); list results carry `ttlMs`/`cacheScope`; HTTP+SSE is deprecated. Consequence for D13: the EOS MCP adapter keeps no per-connection state, implements `server/discover`, and never treats a client's discover call as a compatibility requirement.
- "Supabase migrates from anon/service_role to publishable/secret keys by end of 2026": verified. Add: Edge Functions reserve the `Authorization` header for Supabase Auth JWTs and the `apikey` header for project keys; a custom installation token must therefore travel in its own header (D22).
- "Database backups do not include Storage objects": verified. Add: Free plan has no automated daily backups and pauses after 7 idle days; Pro has daily backups retained 7 days, PITR is an add-on (D30).
- Stage 1 of the report ("OS/runtime combinations supported") must reference the platform list in D18.3, otherwise the gate is unfalsifiable.
- The report's Stage 8 hidden condition "no instruction saying to call `resolve`" is clarified in the new Stage 3: the generated bootstrap may *describe* EOS tools generically; it may not contain task-specific coaching.

### 1.4 Second review round (R-01 … R-12) and disposition

| ID | Finding | Disposition in 1.1 |
|---|---|---|
| R-01 | Real-agent vertical slice arrived at Stage 8, after seven infrastructure layers; this repeats the failure mode that motivated the rebuild. | **Accepted, S1.** Stage order rewritten: minimal contracts → run-from-source runtime → seed knowledge + minimal resolver + minimal telemetry → **real agent slice at Stage 3**. Pinning, bulk import, full evidence, assurance, scoring follow only after the slice is natural. |
| R-02 | D22 handed the agent the owner's refresh token; too broad even under RLS and contradicts "scoped ingestion identity". | **Accepted, S1.** D22 rewritten: installation-scoped token → Edge Function `ingest` → insert-only paths; curator/deriver/admin are separate server-side identities (D31). |
| R-03 | D23 used a Git branch as telemetry fallback, violating "Git = intent, Supabase = what happened" and creating privacy/tampering/cleanup problems. | **Accepted, S1**, with one addition: cloud environments have configurable network access (verified), so the ingest endpoint must be allowed there and `doctor` verifies reachability at session start, declaring eligibility up front. Telemetry loss must never look like a measured run. |
| R-04 | Stage 2 wrote `status: candidate` assets straight into canonical `knowledge/`, bypassing Observation → Candidate → Promotion. | **Accepted, S1.** Canonical lifecycle: `active | restricted | quarantined | deprecated | superseded`; staging states live in Supabase; legacy import becomes a Bulk Import Promotion PR. Imported assets are `active` but carry `evidence: none`, and the resolver shows that. |
| R-05 | `assurance → evidence → store-supabase` gave Assurance a transitive Supabase dependency, contradicting "local evaluation continues when the Evidence Plane is down". | **Accepted.** Ports/adapters: `core` owns contracts and ports; `evidence-derivation` and `assurance` depend on `core` only and receive an `EvidenceSnapshot`; `store-supabase` implements the ports. |
| R-06 | "Supabase Pro or self-hosted Postgres with the same schema" is not one backend; the design uses Auth, RLS, Edge Functions, Storage and key semantics. | **Accepted.** Managed Supabase is the v1 Evidence Plane; domain ports stay provider-neutral; no second backend is built. |
| R-07 | Derivation keyed on `(run_id, deriver_version)` is not reproducible once late CI evidence changes the inputs; replay with fresh ULIDs cannot be compared. | **Accepted.** D32: deterministic evidence ids, `input_snapshot_hash`, `supersedes_derivation_id`, replay comparison ignoring identity/timestamps. |
| R-08 | Holdout evidence was allowed to change the Champion, so the holdout stops being a holdout. | **Accepted.** D33: Active Holdout is never an optimization input; retiring a holdout reclassifies it and requires a new holdout set. |
| R-09 | Staleness by paths + max age misses dependency, Profile, provider and infra changes. | **Accepted.** D27 gains dependency selectors. |
| R-10 | Resolver output is not tied to the repo state and inputs it was computed from. | **Accepted.** D25 adds `context_snapshot_id` (repo SHA, Profile status digest, change scope, capability snapshot hash, score snapshot/overlay digest). |
| R-11 | `installation_id + source.type + sequence` is not unique with concurrent processes; SQLite "atomic file replace" is the wrong tool. | **Accepted.** D26 adds `emitter_id`; SQLite uses WAL + transactions + busy timeout + unique `event_id` (verified against better-sqlite3 docs). |
| R-12 | Governance creeping back: ADR for any directory, docs on every stage, 30 ADRs at Stage 0, four-platform CI before the slice. | **Accepted with one reservation.** ADR only for a new architectural boundary or top-level subsystem; docs only when a public contract or runbook changes; one baseline ADR for D1–D17. CI: Linux primary plus one Windows smoke from Stage 0 (the owner works on Windows and CRLF/path bugs are cheap early), full matrix after the slice. Node 24 LTS (verified) with `packageManager`/`devEngines` pinning. |

One item the second round opened without closing: with R-02 and R-04, the component that turns Candidates into promotion PRs cannot be the agent or the owner's laptop. It is specified as D31 and, after the third round, split into a Curator and a Promoter.

### 1.5 Third review round (T-01 … T-10) and disposition

| ID | Sev | Finding | Disposition in 1.2 |
|---|---|---|---|
| T-01 | S1 | A live score could change the Champion without a release, so a pinned release could recommend A today and B tomorrow. | **Accepted.** D34: scores are live; canonical recommendations are released. New evidence yields `challenger_ready` and a Promotion Proposal; the default changes only after PR + release. Connects D7, D8, D12, D24. |
| T-02 | S1 | D31 gave one Curator both the Supabase secret key and the GitHub App key: one compromise = Evidence Plane admin + canonical Git writer. | **Accepted.** D31 split: Curator (Supabase authority only, produces a signed Promotion Proposal) and Promoter (GitHub authority only, runs in the canonical repo's Actions, validates the proposal, opens the PR, never merges). Edge Function secrets are project-wide, so the split is across systems, not across two functions in one project. |
| T-03 | S1 | Stage 3 demanded telemetry → evidence → investigation while Stage 2 built no evidence at all. | **Accepted.** Stage 2 gains a minimal evidence kernel (attribution from events, D32 ids) and a raw investigation timeline; Stage 7 extends them. |
| T-04 | S2 | `observe` declared `idempotentHint: true` without an idempotency key. | **Accepted.** Client-generated `observation_id` (ULID) is the key; `UNIQUE` server-side; a retry returns the same id. |
| T-05 | S2 | `context_snapshot_id` had no lifecycle. | **Accepted.** Deterministic hash id over its inputs; durable record written local-first and synced through `ingest`; `inspect` takes a typed handle `{kind: asset \| snapshot, id}`. |
| T-06 | S2 | Guide said `server/discover` is mandatory. | **Accepted with precision** (re-verified): servers must implement it; clients need not call it because requests are self-describing. IEOS implements it and does not depend on clients calling it. |
| T-07 | S2 | Stage 3 required a second agent, making the "minimal slice" not minimal. | **Accepted.** Stage 3 is primary-agent only; Claude/Codex parity is Stage 8. |
| T-08 | S2 | Launcher planned to reproduce `gh release verify` semantics in TypeScript. | **Accepted.** Digest verification is mandatory and in-launcher; attestation verification uses the official `gh` CLI (`gh release verify`, `gh release verify-asset`, `gh attestation verify`) or a proven Sigstore library, never a home-grown verifier; required in qualification, best-effort offline. |
| T-09 | S2 | Installation-token invariants incomplete. | **Accepted.** D22.6: ≥ 256-bit random tokens, constant-time hash comparison, rate and body-size limits, exact RPC scopes, server-stamped `installation_id`, `origin_class` never client-settable. |
| T-10 | S3 | "main is release-only" reintroduces governance. | **Accepted.** `main` is always releasable; releases are immutable tags and artifacts; small PRs land on `main` throughout a stage. |

---

### 1.6 Fourth review round (Q-01 … Q-11) and disposition — final

| ID | Sev | Finding | Disposition in 1.3 |
|---|---|---|---|
| Q-01 | must | D21 still said the Curator creates the branch/PR; D31 gives Git authority to the Promoter. | **Fixed.** D21 and its table row: Curator → signed Promotion Proposal → Promoter → branch + PR. |
| Q-02 | must | D24 had source builds in Stage 0–1 reading `scores.snapshot.json` from an Evidence Plane that does not exist yet. | **Fixed.** Stage 0–1 emit a deterministic `UNPROVEN` snapshot; real snapshots only from Stage 2. |
| Q-03 | must | D33 forbade clients from setting `origin_class` but named no trusted authority that sets it. | **Fixed.** D36 Run Classification Authority: service-principal `register_run` records `run_id → origin_class`; ingest stamps from that record; unregistered runs are `operational`. |
| Q-04 | must | "Canonical JSON" was used in four hashes without a definition. | **Fixed.** D35 Hashing Contract (RFC 8785 JCS, UTF-8, LF normalization, sorted relative paths, SHA-256) applied everywhere. |
| Q-05 | important | `resolve` listed challengers alongside the Champion, against "one solution in front". | **Fixed.** `resolve` returns the Champion with `champion_state`; challenger detail only in `inspect`/`expand`. |
| Q-06 | important | Live scores could reorder `resolve` results, hurting eval reproducibility. | **Fixed.** `ranking_mode: live_overlay \| recorded` and `score_view_id`; qualification and replay use an immutable recorded score view. |
| Q-07 | important | Promoter and harness were treated as installations; the App private key location was unstated. | **Fixed.** `principals` table with `principal_kind`; service principals have their own scopes; App private key lives only in the canonical repo's Actions secrets. |
| Q-08 | important | The Curator signature was described as if it isolated the Curator from other functions in the same Supabase project. | **Fixed.** Described as an Evidence-Plane signature; isolation level to be revisited before any auto-merge. |
| Q-09 | cleanup | Stage 2 built hooks for both agents although Stage 3 is primary-agent only. | **Fixed.** Stage 2 builds the primary agent's adapter only; the second agent's adapter is Stage 8. |
| Q-10 | cleanup | D29 hard-wired a specific research tool into the dependency policy. | **Fixed.** "Verify against current official documentation; the retrieval mechanism is replaceable." |
| Q-11 | cleanup | Residual inconsistencies (F1–F10 vs F11, ADR range, D21 row). | **Fixed** throughout. |

### 1.7 Fifth review round (P-01 … P-06) and disposition — final patch

| ID | Sev | Finding | Disposition in 1.4 |
|---|---|---|---|
| P-01 | **blocker** | D34 required a Champion per Solution Set, Stage 5 forbade the importer from choosing one, and D19 forbids inventing one without evidence. A freshly imported set of three unproven auth assets satisfies none of the three. | **Fixed before Stage 0.** `champion_id` is nullable; `champion_state: unresolved \| pinned \| challenged` with an explicit state machine; `resolve` reports `unresolved_solution_set` instead of picking a temporary winner (D34, Section 5.10). |
| P-02 | important | D36 stops a compromised agent from claiming `qualification`/`holdout`, but client-originated `operational` evidence still feeds optimization, so fabricated events could poison scores. | **Fixed by contract fields, not a new subsystem.** Evidence carries `integrity.source_authority` and `integrity.verification`; client-reported telemetry alone can never be `directly_verified`, and the scorer caps its weight (D32, Section 5.4). |
| P-03 | important | In `live_overlay` mode the context snapshot kept only an `overlay_digest`, which proves an overlay existed but does not reconstruct it. | **Fixed.** `effective_score_view_id` records the assets considered, their effective scores, the scoring and evidence versions and `computed_at`; in `recorded` mode it is the global immutable view, in `live_overlay` mode a small per-decision view (D24, D25). |
| P-04 | important | D35 said "sorted paths + normalized bytes", which allows ambiguous concatenation. | **Fixed as an implementation rule.** Per-file SHA-256 → sorted JCS manifest → one SHA-256. No new decision. |
| P-05 | wording | Open parameter 17 said "rotate when > 20% used for a release decision", contradicting D33's reported-only rule for active holdouts. | **Fixed.** Rotate on consumption/exposure in evaluation cycles, or on suspected contamination. |
| P-06 | wording | D34 said a pinned release "always recommends the same default for the same inputs", which overstates the guarantee under `live_overlay`. | **Fixed.** A pinned release fixes the Champion per Solution Set; ordering and relevance across other assets may still move in `live_overlay`, and qualification uses `recorded`. |

### 1.8 Consistency patch (C-01 … C-05) — 1.4.1

| ID | Finding | Disposition |
|---|---|---|
| C-01 | `champion_state` was owned by both the release index and the Evidence Plane, violating the State Ownership Matrix. | Split into `canonical_state` (Git and release) and `challenge_state` (derived at runtime from the score view). `resolve` still presents one simple status. |
| C-02 | D35 said all hashing goes through `hashing.ts`, which cannot hold together with F5 (launcher imports nothing) and D22 (`token_hash`). | Three hashing kinds distinguished: canonical structured hashing (core, defines EOS identities), raw artifact integrity (launcher), credential verification (auth). F12 and the Never list reworded accordingly. |
| C-03 | `evidence_id` used pipe concatenation instead of the D35 canonical form. | `evidence_id = "evd_" + base32(sha256(JCS({ run_id, deriver_id, deriver_version, input_snapshot_hash })))`. Same rule for every deterministic id. |
| C-04 | Stage 2 and Stage 5 imports enter through a PR, but F3 said only the Promoter produces branches, and the Promoter does not exist before Stage 10. | Bootstrap phase defined explicitly: before Stage 10 the import tool writes a local promotion bundle and the owner opens and reviews the PR; the tool never pushes. From Stage 10 machine-generated promotions go Curator → Promoter. F3 reworded. |
| C-05 | Evidence thresholds allowed an implicit `unresolved → pinned` path at `observed`. | `reported` is a scoring signal only; `observed` makes a candidate or challenger evidence-worthy; `corroborated` or better is required for a Champion Promotion Proposal; only an approved promotion plus a release sets `canonical_state: pinned`. The exact numeric threshold stays an open parameter for Stage 10. |

**Design freeze.** With 1.4.1 the architecture phase is closed and the guide is frozen for Stage 0. Remaining unknowns are expected to surface through contract and property tests in Stage 0, composition in Stages 1–2, and above all the Stage 3 real-agent run, and are handled as stage findings rather than as further guide revisions before implementation.

## 2. Added decisions (D18–D36)

### 2.0 Owner approval table

Each row is `PROPOSED` with a recommended default. The coding agent proceeds with the default unless the owner changes the row. Record the outcome in `docs/adr/` at Stage 0.

| Decision | Recommended default | Alternative kept as Challenger |
|---|---|---|
| D18 Stack & platforms | TypeScript, **Node 24 LTS**, pnpm with `packageManager` pin, one language for core and launcher; Linux primary + Windows smoke at Stage 0, full matrix (Linux, macOS, Windows native, WSL2) after Stage 3 | Go launcher if the "Node is always present" assumption breaks |
| D19 Identity & canonical lifecycle | Opaque ULID ids + mutable slugs + `content_hash` as addressing key; canonical statuses `active | restricted | quarantined | deprecated | superseded`; staging statuses only in Supabase | Path-derived ids (rejected) |
| D20 Asset storage & retrieval | One directory per asset; deterministic retrieval (capability graph + SQLite FTS5) shipped as an index in the release | Embeddings behind a `Retriever` port only if Stage 14 proves deterministic recall insufficient |
| D21 Promotion mechanism | Curator emits a signed Promotion Proposal; Promoter opens the pull request; owner approval = merge; low-risk auto-merge gated by CI only after Stage 10 | Custom approval UI (rejected) |
| D22 Credential boundary | Installation-scoped high-entropy token → Edge Function `ingest` → insert-only RPCs with explicit invariants (D22.6); no owner token and no Supabase key with authority on agent machines; secret key only inside Edge Functions | Supabase Auth anonymous users per installation (kept as alternative if custom tokens prove awkward) |
| D23 Remote/ephemeral sessions | Buffered direct ingest, retries at boundaries, else `telemetry_state: INCOMPLETE` and `qualification_eligible: false`; coding continues; no Git fallback | Rejected: telemetry via branch commits |
| D24 Offline reads | Release carries `knowledge.sqlite` + `scores.snapshot.json`; live overlay when reachable; `score_source` reported | Rejected: network-required resolve |
| D25 Agent Contract | `resolve`, `inspect`, `expand`, `observe`; every response carries a durable `context_snapshot_id`; `observe` idempotent via client-generated `observation_id`; `inspect` takes a typed handle | Rejected: infer everything from traces |
| D26 Telemetry registry & envelope | Attribute allowlist with sensitivity; envelope gains `installation_id`, `emitter_id`, `session_kind` | Rejected: denylist scanning as primary control |
| D27 Evidence staleness | Path scope + dependency selectors + max age | Rejected: any-commit staleness |
| D28 Taxonomy governance | `contracts/capabilities.yaml` seeded from this repo's `core/capability-registry.yaml`; growth only via promotion PR | Rejected: free-form tags |
| D29 EOS dependency policy | Exact pins, lockfile, `pnpm ci` in CI, weekly update PR, verification against current official documentation per new dependency (retrieval tool replaceable), SBOM per release | — |
| D30 Evidence Plane hosting | **Managed Supabase Pro only** for v1; weekly `pg_dump` export; restore drill each RC; Storage exported separately if adopted | Self-hosted Postgres (rejected for v1: not a drop-in for Auth/RLS/Edge Functions) |
| D31 Curator / Promoter split | Curator = scheduled Edge Function with Supabase authority only, emits signed Promotion Proposals; Promoter = GitHub Actions workflow in the canonical repo with a GitHub App installation token only (`contents: write`, `pull_requests: write`, single repo), validates the proposal and opens the PR | One component with both authorities (rejected: single compromise = plane admin + Git writer) |
| D32 Derivation reproducibility | Deterministic evidence ids from `(run_id, deriver_id, deriver_version, input_snapshot_hash)`; supersession; replay comparison ignores identity/timestamps | Rejected: fresh ULID per derivation |
| D33 Holdout policy | Active Holdout is never an optimization input; retirement reclassifies it as historical qualification evidence and requires a replacement set | Rejected: holdout results feed Champion selection |
| D34 Release-pinned Champion | Canonical Champion per Solution Set is part of the release index as `champion_id` + `canonical_state` (`unresolved \| pinned`); `challenge_state` (`none \| challenged`) is derived at runtime and never stored in Git; `resolve` returns only the Champion with one presentation status; challenger detail in `inspect`/`expand` | Rejected: live score swaps the Champion, lists alternatives in `resolve`, or writes state into Git |
| D35 Hashing Contract | One project-wide rule: RFC 8785 (JCS) for JSON, UTF-8, LF-normalized text, files sorted by relative path, SHA-256; used by `content_hash`, `context_snapshot_id`, `input_snapshot_hash`, proposal signatures | Per-subsystem "canonical serialization" (rejected) |
| D36 Run Classification Authority | Only a service principal (harness) may pre-register `run_id → origin_class, eval_set_version`; ingest stamps `origin_class` from the Run record; unregistered runs are `operational` | Client-declared origin (rejected) |

### D18 — Implementation stack and platforms (PROPOSED)

**D18.1 Language and runtime.** TypeScript, strict mode, **Node 24 LTS** (LTS since 24.11.0, supported through April 2028; Node 22 leaves active LTS and is in maintenance until April 2027), pnpm workspaces, ESM. Rationale unchanged: the MCP SDK, `supabase-js`, Claude Code and Codex are Node-based, so Node is present wherever the agents run.

**D18.2 Launcher.** Published as its own npm package (`@ieos/launcher`) with zero runtime dependencies, invoked as `npx @ieos/launcher@<exact-version> <command>`. It downloads release artifacts, **verifies the SHA-256 digest itself (mandatory, offline-capable)**, and delegates attestation verification to the official GitHub CLI (`gh release verify`, `gh release verify-asset`, `gh attestation verify`) or, where `gh` is absent, to a proven Sigstore verification library; it never implements signature verification itself (T-08). Attestation verification is required for qualification and release rings and best-effort for offline installs, which are marked `attestation: unverified`. It manages the version cache and never imports core packages (fitness F5). **It is not built until Stage 4**; Stages 0–3 run from a source checkout.

**D18.3 Supported platforms.** Target: Linux x64, macOS arm64, Windows 11 native (PowerShell), Windows WSL2. Sequencing (R-12): Stage 0–3 CI runs Linux as primary plus one Windows smoke job (path handling, CRLF, spawn); the full matrix becomes a gate at Stage 4. Rules from day one: no shell scripts in runtime paths (TypeScript only); `path.join` everywhere; `.gitattributes` with `* text=auto eol=lf`.

**D18.4 Generated project footprint.** `ieos init` writes exactly: `.ieos/installation.json` (pin + digest + `installation_id`), `.ieos/profile.yaml` (`spec` only), an entry in `.mcp.json` (Claude Code project scope, verified) and a `[mcp_servers.ieos]` block for Codex (`codex mcp add` or `.codex/config.toml`, verified), and one generated paragraph in `AGENTS.md` and `CLAUDE.md` between `<!-- ieos:begin -->` / `<!-- ieos:end -->` markers. `ieos doctor` fails if the generated block differs from the pinned release's template. Nothing else lands in the project.

**D18.5 Tooling.** `vitest`; `eslint` + `prettier`; **Zod 4** as schema source of truth with `z.toJSONSchema(..., { target: "draft-2020-12", unrepresentable: "throw" })` emitted to `contracts/schemas/` (verified: dates/maps/transforms are unrepresentable, so contracts use ISO strings and plain objects); `better-sqlite3` with `journal_mode = WAL`, `timeout` (busy timeout) and `.transaction()` (verified); `@modelcontextprotocol/sdk` pinned to a version implementing `2026-07-28`; Supabase CLI for migrations and functions; `dependency-cruiser` for fitness rules.

**D18.6 Toolchain pinning (R-12).** `package.json` carries `packageManager: "pnpm@<exact>"` and `devEngines.packageManager` (verified pnpm fields), `engines.node: "24.x"`, `engineStrict: true` in `pnpm-workspace.yaml`; CI installs with `pnpm ci` (clean + frozen lockfile, pnpm 11).

### D19 — Identity, content addressing and canonical lifecycle (PROPOSED)

- Every canonical object gets an opaque, immutable id: `asset_01J...` (ULID with type prefix). Slugs and titles are mutable metadata.
- `content_hash = sha256(D35 canonical bytes of body.md + files/)` is an addressing key, not a merge rule. The importer merges two assets only when `content_hash` is equal **and** recommendation-relevant metadata is equivalent (`type`, `problem.id`, `applicability`, `compatibility`, `risk`). Equal hash with different metadata yields `related_to` and a report entry. `failed_solution` is never merged with any other type.
- `legacy_ids[]` records old Engineering-OS paths so provenance survives. Renames never change ids; supersession is a relationship.
- **Canonical lifecycle (R-04).** Assets in `knowledge/` are `active | restricted | quarantined | deprecated | superseded`. `observation`, `candidate` and `promotion_proposal` exist only in Supabase staging tables. An `active` asset with no Evidence is explicitly "admitted, unproven": `inspect` shows `evidence: none`, and Champion selection never rests on legacy popularity. A Solution Set whose members are all unproven stays `unresolved` (D34); it does not get a Champion by default.

### D20 — Asset storage layout and retrieval (PROPOSED)

**D20.1 Layout.** `knowledge/assets/<type>/<slug>/asset.yaml` (metadata, Section 5.1), `body.md`, optional `files/`. `inspect` returns metadata + body; `resolve` returns metadata + `summary` only.

**D20.2 Index.** At release build time (and at Stage 0–3 via `pnpm build:index` from source) the knowledge tree compiles into `knowledge.sqlite` (FTS5 over title/summary/tags/body plus capability and solution-set tables). Rebuild is deterministic (fitness F8).

**D20.3 Retrieval v1.** Deterministic ranking: capability/problem match → FTS5 BM25 → Project Fit filter → Champion per Solution Set → Asset Score tie-break. Embeddings are an optional `Retriever` port implementation added only if Stage 14 proves deterministic recall insufficient.

### D21 — Promotion is a pull request (PROPOSED)

The Curator (D31, Supabase authority only) turns a Candidate into a **signed Promotion Proposal** (`promotion_proposals` row: asset diff, evidence ids, `input_snapshot_hash`, risk class, trust vector, signature per D35). The Promoter (D31, GitHub authority only) validates the proposal and materializes it as a branch containing the asset change plus `promotion.yaml`, then opens the pull request. CI validates schemas, fitness rules and evidence references. Owner approval is the merge. `contracts/promotion-policy.yaml` (empty until Stage 10) may later enable auto-merge for low-risk categories. Git history is the audit log; the Curator never touches Git.

### D22 — Credential boundary, concretized (PROPOSED, rewritten in 1.1)

```text
Agent process / EOS runtime on any machine or container
        │  X-IEOS-Installation-Token: <opaque, per installation, revocable>
        ▼
Edge Function `ingest`  (deployed --no-verify-jwt; validates token hash itself)
        │  admin client from SUPABASE_SECRET_KEYS, calls SECURITY DEFINER RPCs only:
        │    ingest_events(jsonb)      → raw_events insert
        │    ingest_observations(jsonb)→ observations insert
        │    read_minimal(kind)        → health, score overlay, own-run status
        ▼
Supabase Evidence Plane
```

1. **Installation token.** `ieos auth enroll` (run once per machine by the owner, authenticated as the owner) creates a row in `installations` with `token_hash = sha256(token)`, `scopes = ['telemetry.insert','observation.insert','read.minimal']`, `expires_at` (90 days, renewable) and stores the token in the OS keychain, with `~/.ieos/credentials.json` mode `0600` as fallback. Remote environments receive the token as an environment secret. `ieos auth rotate|revoke` exist from Stage 2.
2. **Header discipline (verified).** Supabase reserves `Authorization` for Supabase Auth JWTs and `apikey` for project keys; the installation token travels in `X-IEOS-Installation-Token` and the function is deployed with `--no-verify-jwt` so the platform does not reject the request before the function validates it.
3. **What the agent cannot do.** No evidence mutation, no candidate promotion, no score mutation, no admin, no reads of other installations' sensitive records. The RPCs are the whole surface; the function never exposes a general query.
4. **Other identities.** Owner (Supabase Auth user, used only by `ieos auth enroll` and the read-only investigation CLI), Curator and Deriver (server-side, D31), CI (a separate installation row with `ci` scope). The secret key exists only in Edge Function secrets and the owner's password manager. Fitness F9 fails any commit containing a secret-shaped value.
5. **Invariants (T-09).** Tokens are ≥ 256 bits from a CSPRNG and shown once; the function compares `sha256(token)` to `token_hash` in constant time; per-installation rate limits and request body-size limits are enforced in the function; each RPC accepts only the fields of its contract; the function stamps `installation_id`, `ingested_at` and `origin_class` server-side (clients can never set `origin_class`, so no client observation can pose as `qualification` or `holdout` evidence); revoked or expired tokens fail closed with a distinct error the runtime surfaces in `doctor`.
6. **Honest limit.** An agent with shell access can still read the installation token. Its blast radius is now: inserting telemetry or observations as that installation, and minimal reads. Every insert is attributable to the installation and revocable. That is the accepted residual risk for D1.

### D23 — Remote and ephemeral sessions (PROPOSED, rewritten in 1.1)

- The runtime classifies each Run: `session_kind: local_persistent | remote_ephemeral | ci`, detected from environment markers and overridable.
- `local_persistent`: SQLite outbox (WAL), background sync.
- `remote_ephemeral`: outbox for batching; synchronous flush at every terminal boundary (`Stop`, `SessionEnd`) and every N minutes with a short timeout and bounded retries.
- **If all retries fail:** the run is marked `telemetry_state: INCOMPLETE` and `qualification_eligible: false`; coding continues; nothing is written to Git. Telemetry loss must never look like a measured run.
- **Eligibility is declared up front.** Cloud environments have configurable network access (verified), so `ieos doctor` at SessionStart checks that the ingest endpoint is reachable and marks the run's eligibility before work starts, not after.
- Hook semantics (verified): in Claude Code, exit code 2 from `Stop` *prevents termination* and from `SessionStart`/`PostToolUse` cannot block; therefore the terminal telemetry hook never uses exit 2 to signal failure. It writes `telemetry_state` and reports via stderr/JSON output. Codex hooks (`SessionStart`, `SessionEnd`, `Stop`, `PostToolUse` in `config.toml` or `hooks.json`) use the same emitter.
- Stage 2 carries the mandatory scenario: container killed right after the last tool call → either events arrive via the boundary flush or the run is `INCOMPLETE`, never silently "complete".

### D24 — Offline reads (PROPOSED)

- **Bootstrap (Q-02).** In Stages 0–1 there is no Evidence Plane. The source build emits a deterministic `scores.snapshot.json` with `state: UNPROVEN`, every asset at the uniform prior, `evidence_count: 0`, `computed_at: null`, `scoring_policy_version: "0"`. Its hash is stable (D35) so Stage 0 fitness F8 already covers it.
- **From Stage 2.** The release build (and the source build) queries the Evidence Plane through the `read.minimal` RPC and writes `scores.snapshot.json` (Asset Score, evidence counts, derived `challenge_state` per Solution Set, `computed_at`, `scoring_policy_version`, `score_view_id`). The **Champion and its `canonical_state` are not in this snapshot**: they are part of the release index (D34, C-01).
- **Ranking modes (Q-06).** `ranking_mode: live_overlay` (default for ordinary work) overlays live scores when reachable within a budget and otherwise falls back to the snapshot with `score_source: snapshot`. `ranking_mode: recorded` (mandatory for qualification, evals and replay) uses an immutable recorded score view identified by `score_view_id`; the harness pins it per simulation. In both modes the Champion comes from the release.
- **Effective Score View (P-03).** Every `resolve` records the ranking inputs that actually affected it, not just a digest:

  ```yaml
  effective_score_view_id: "esv_<base32(sha256(JCS(view)))>"     # D35
  view:
    mode: "live_overlay" | "recorded"
    parent_score_view_id: "sv_…"        # the global view this was derived from, when recorded
    scoring_policy_version: "…"
    evidence_watermark: "…"             # latest ingested_at reflected in these scores
    computed_at: "…"
    assets:                             # only the assets considered for this decision
      - { id: "asset_…", effective_score: 0.0, evidence_count: 0, source: "overlay" | "snapshot" }
  ```

  In `recorded` mode the view is the global immutable one and is stored once. In `live_overlay` mode it is a small per-decision view, synced through `ingest` with the context snapshot, so an investigation a month later can answer "why did EOS propose asset X in this run?" without storing a copy of the whole catalogue per call.

### D25 — Agent Contract (PROPOSED, extended in 1.1)

Tools: `resolve`, `inspect`, `expand`, `observe`.

- **Context snapshot (T-05).** `context_snapshot_id = "ctx_" + base32(sha256(JCS({ repo_sha, profile_status_digest, change_scope, capability_snapshot_hash, index_digest, ranking_mode, effective_score_view_id, eos_release })))` per D35. The snapshot references an Effective Score View (D24, P-03) rather than an opaque overlay digest, so the ranking inputs of that decision are recoverable. The runtime writes the snapshot record to the local outbox before answering, and it syncs through `ingest` as a `context_snapshots` row keyed by the same id; the id is therefore stable across machines and replayable. `inspect` accepts a typed handle `{ kind: "asset" | "snapshot" | "solution_set", id }`.
- **Idempotent observe (T-04).** The caller mints `observation_id` (ULID) and sends it with the request; the server enforces `UNIQUE(observation_id)` and returns the existing row on retry. `observe` writes to staging only (fitness F3).
- **MCP surface.** `readOnlyHint: true` on the three reads, `idempotentHint: true` on `observe`; the server implements `server/discover` (a server obligation in `2026-07-28`) and advertises `ttlMs`/`cacheScope` on lists. The CLI, harness and adapters never require a client to call `server/discover`; requests are self-describing via `_meta` (T-06).

### D26 — Telemetry attribute registry and envelope fields (PROPOSED)

- `contracts/telemetry-attributes.yaml`: every allowed attribute with `type`, `sensitivity: public | internal | never`, `max_length`. Exporter and ingest function reconstruct events from this allowlist; unknown keys are dropped and counted.
- Envelope gains `installation_id`, `emitter_id` (unique per process/run emitter), `session_kind`; ordering key is `(installation_id, emitter_id, sequence)`.
- Strict UTF-8 decoding before any scanning.
- **SQLite outbox (R-11):** `journal_mode = WAL`, `timeout` ≥ 5000 ms, all writes inside `.transaction()`, `UNIQUE(event_id)`; no file-level atomic replacement.

### D27 — Evidence staleness scope (PROPOSED, extended in 1.1)

Evidence carries `scope: { paths: [globs], depends_on: [selectors], max_age_days }`. Selectors: `dependency:<package>`, `profile:<field>`, `provider:<id>`, `infra:<path or key>`. Evidence is `STALE` when a commit since `repo_sha` touched a path in scope, any selector's observed value changed (lockfile entry, Profile field, provider version, infra file), or `max_age_days` elapsed. Otherwise `VALID (revision drift)`.

### D28 — Taxonomy governance (PROPOSED)

`contracts/capabilities.yaml` is versioned, seeded from `core/capability-registry.yaml` in this repository, and grows only via promotion PRs. A Solution Set is `problem.id` + compatibility key.

### D29 — Dependency policy for EOS itself (PROPOSED)

Exact pins, committed `pnpm-lock.yaml`, `pnpm ci` in CI, weekly automated update PR, verification of each new dependency against its current official documentation recorded in the PR (the retrieval mechanism is replaceable and not part of the architecture), CycloneDX SBOM emitted per release and referenced from the release manifest.

### D30 — Evidence Plane hosting (PROPOSED, narrowed in 1.1)

Managed **Supabase Pro** is the v1 Evidence Plane (no inactivity pause; daily backups retained 7 days; PITR available as an add-on). Domain code depends on ports, not on Supabase, so another backend remains possible later, but none is built now. Independent of plan: weekly `pg_dump` to owner-controlled storage via a scheduled job, and a restore drill into a scratch project at every RC. If Supabase Storage is adopted for cold telemetry, its objects are exported separately (database backups exclude them, verified).

### D31 — Server-side Deriver, Curator and Promoter identities (NEW in 1.1, split in 1.2)

| Component | Runs where | Holds | Does | Never |
|---|---|---|---|---|
| **Deriver** | Supabase Edge Function on pg_cron | Supabase secret key | reads `raw_events`, writes `evidence`, `investigations` (D32) | touches Git |
| **Curator** | Supabase Edge Function on pg_cron | Supabase secret key + a proposal-signing key (Ed25519, private half in Supabase function secrets, public half committed to the canonical repo) | turns Candidates into **Promotion Proposals** (`promotion_proposals` row with asset diff, evidence ids, `input_snapshot_hash`, risk class, trust vector, signature over the D35 canonical bytes) | holds any GitHub credential; touches Git |
| **Promoter** | GitHub Actions scheduled workflow in the canonical repo | GitHub App installation token (1 h, `contents: write`, `pull_requests: write`, this repo only; the App private key lives only in the canonical repo's Actions secrets) + a **service principal** token (`principal_kind: service`, scopes `proposal.read`, `proposal.ack`) | fetches open proposals through the ingest function's read RPC, verifies the signature against the committed public key, re-validates schemas and evidence references, pushes a branch and opens the PR, acknowledges the proposal | holds the Supabase secret key; merges |

Rationale (T-02): Edge Function secrets are project-wide, so two functions in one Supabase project do not separate authority. Placing the Promoter in GitHub Actions puts the trust boundary between systems: a compromised Curator can propose but not write Git; a compromised Promoter can open PRs but not touch the Evidence Plane. Owner approval remains the merge.

**What the signature proves (Q-08).** The proposal signature proves that the proposal came from the approved Evidence Plane project, whose secrets are shared by all its functions. It does **not** prove that only the Curator process could have produced it. That is sufficient while owner merge is mandatory; before any auto-merge category is enabled (D21, Stage 10+), the isolation level of the signing key must be revisited (separate Supabase project or an external signer).

### D32 — Derivation reproducibility (NEW in 1.1)

- `evidence_id = "evd_" + base32(sha256(JCS({ run_id, deriver_id, deriver_version, input_snapshot_hash })))` per D35 (C-03). Every deterministic id in the project is formed the same way; no pipe or path concatenation.
- `input_snapshot_hash` = hash over the ordered set of source event ids and external inputs (CI conclusions, review states) consumed by the derivation; `input_watermark` = latest `ingested_at` consumed.
- Late input (CI failure a day later) produces a **new** derivation with a new `input_snapshot_hash` that `supersedes_derivation_id` the previous one; nothing is deleted.
- Replay test: rerun the same deriver over the same snapshot → identical `evidence_id` and identical payload after stripping `derived_at`.
- **Integrity grading (P-02).** Every Evidence row carries:

  ```yaml
  integrity:
    source_authority: agent_runtime | deterministic_test | ci | review | external
    verification:     reported | observed | corroborated | externally_verified
  ```

  | Situation | authority | verification |
  |---|---|---|
  | the agent states in an observation that tests passed | `agent_runtime` | `reported` |
  | the EOS runtime observed the test process exit 0 | `deterministic_test` | `observed` |
  | CI passed independently on the same repo SHA | `ci` | `corroborated` |
  | a GitHub check result for that exact SHA | `external` | `externally_verified` |

  Rule: **client-originated operational telemetry alone can never produce `directly_verified` attribution or `externally_verified` integrity.** The deriver stamps both fields from the event source and the Run record (D36), never from event content. `scoring-policy.yaml` applies the eligibility ladder (C-05):

  | Integrity reached | What it may do |
  |---|---|
  | `reported` | contribute a capped scoring signal only |
  | `observed` | make a candidate or challenger evidence-worthy |
  | `corroborated` or `externally_verified` | make a Solution Set eligible for a Champion Promotion Proposal |
  | approved promotion + release | actually set `canonical_state: pinned` |

  There is no path from `unresolved` to `pinned` that skips a promotion. A compromised installation can nudge a score slightly; it cannot move or create a Champion.

### D33 — Holdout policy (NEW in 1.1)

| Origin class | Allowed use |
|---|---|
| `development` | optimization allowed |
| `operational` | optimization allowed |
| `qualification` | release decisions allowed |
| `holdout` (active) | **never** an optimization input; never selects a Champion; reported only |
| `holdout` (retired) | reclassified as historical `qualification`; a new holdout set must replace it |
| `external_attestation` | provenance only |

`evidence_policy.eligible_origins` on an Asset may therefore never include active `holdout`.

### D34 — Release-pinned Champion (NEW in 1.2)

```text
Evidence Plane → live Asset Scores → challenge_state: challenged (derived, per Solution Set)
      → Qualification → Promotion Proposal (Curator) → PR (Promoter) → owner merge
      → new canonical Champion in knowledge/solution-sets/*.yaml → next EOS release
```

- The canonical Champion of each Solution Set is a field in `knowledge/solution-sets/<id>.yaml` and is compiled into the release index. **A pinned release fixes the Champion of every resolved Solution Set** (P-06). It does not freeze the whole result list: under `ranking_mode: live_overlay` ordering and relevance across other assets and sets may still move; qualification and replay use `ranking_mode: recorded`.
- **A Solution Set may legitimately have no Champion (P-01), and its state has two owners kept apart (C-01).**

  | Field | Owner | Values | Changes when |
  |---|---|---|---|
  | `champion_id` | Canonical Git, compiled into the release | `null` or an asset id | a promotion merges and a release is cut |
  | `canonical_state` | Canonical Git, compiled into the release | `unresolved \| pinned` | same |
  | `challenge_state` | Evidence Plane, derived at runtime into the score view | `none \| challenged` | live scores cross the challenger threshold |

  ```text
  canonical_state:  UNRESOLVED ──promotion proposal + owner merge + release──▶ PINNED
                        ▲                                                       │
                        │  withdrawal / quarantine promotion                     │ promotion of a challenger
                        └───────────────────────────────────────────────────────┘

  challenge_state:  NONE ⇄ CHALLENGED        (derived; never written to Git, never changes canonical_state)
  ```

  Freshly imported sets whose members are all unproven start `unresolved`; the Stage 5 importer groups sets and never chooses a Champion, which is consistent with this contract. Leaving `unresolved` requires the C-05 ladder: evidence at `corroborated` or better, a promotion proposal, an owner merge and a release.
- **What `resolve` does with an unresolved set.** It does not pick a temporary winner. It returns `coverage: { unresolved_solution_set: true, solution_set_id, member_count }` and a handle to the problem, so the agent knows EOS has relevant knowledge but no canonical answer. The candidates, their evidence state and the reason the set is unresolved appear in `inspect` of the set handle or in `expand(beyond: "solution_set")`. One solution in front, only when there is a real justification that it is the canonical one.
- Live scores never replace the Champion at runtime. They may set `challenge_state: challenged` in the score view, never in Git. **`resolve` returns only the Champion** (one solution in front, Q-05) with a single presentation status derived from both owners (`pinned`, `pinned (challenged)`, or an unresolved-set coverage entry); the challenger's identity, live score, margin and evidence difference appear only in `inspect` of the Champion or in `expand(beyond: "solution_set")`. Knowledge keeps learning behind the scenes without handing the agent a list of maybes.
- A Champion change is a promotion: Curator proposal → Promoter PR → owner merge → release. `contracts/promotion-policy.yaml` may later allow auto-merge for this category once Stage 10 has data.
- Fitness rule F11 (from Stage 2): the resolver's Champion selection reads `champion_id` and `canonical_state` only from the release index, never from the score overlay; `challenge_state` may come only from the score view and may never be written to `knowledge/`. F11 also fails any code path that substitutes a highest-scoring asset when `champion_id` is null.

### D35 — Hashing Contract (NEW in 1.3)

One rule for **canonical structured hashing**: no subsystem defines its own canonical serialization or its own domain-identity hash. Two narrow exceptions are named explicitly below (C-02).

```text
JSON records      → RFC 8785 JSON Canonicalization Scheme (JCS), then UTF-8 bytes
Strings           → UTF-8, NFC normalization
Text assets       → line endings normalized to LF before hashing; no trailing-whitespace changes
File sets         → per-file SHA-256 of normalized bytes, collected into a manifest
                    { "files": [ { "path": "body.md", "sha256": "…" }, … ] } whose entries are
                    sorted lexicographically by relative POSIX path (UTF-8 byte order); the
                    manifest is then JCS-serialized and hashed once. No direct concatenation
                    of paths and bytes, which would be ambiguous (P-04) and hard to debug.
Hash              → SHA-256; textual form "sha256:<lowercase hex>"; ids use base32 (RFC 4648, no padding) of the digest
Signatures        → Ed25519 over the SHA-256 of the JCS bytes of the signed object
```

Applies to `content_hash`, `context_snapshot_id`, `effective_score_view_id`, `input_snapshot_hash`, `evidence_id`, `score_view_id`, `index_digest`, `champions_digest`, `bootstrap_template_hash` and Promotion Proposal signatures. `packages/core/src/hashing.ts` is the single implementation.

**Three kinds of hashing, only the first canonical (C-02):**

| Kind | Where | What it hashes | May define an EOS identity |
|---|---|---|---|
| Canonical structured hashing | `packages/core/src/hashing.ts` | JCS records, tree manifests, ids, snapshots, proposals | yes |
| Raw artifact integrity | `packages/launcher` | SHA-256 over the raw bytes of a downloaded release artifact | no |
| Credential verification | the auth module and the `ingest` function | SHA-256 of a random opaque token (D22) | no |

The two exceptions hash opaque bytes, never a structured domain object, so they cannot invent a canonical identity and do not require the launcher to import `core` (F5). Cross-platform fixture: the same asset tree hashed on Linux and Windows CI must yield identical digests (Stage 0 exit gate).

### D36 — Run Classification Authority (NEW in 1.3)

```text
Eval harness / qualification runner   (service principal, scope run.register)
        │  register_run(run_id, origin_class, eval_set_version, holdout_state?, simulation_id?)
        ▼
runs table (Evidence Plane)  ── trusted record ──▶  ingest stamps origin_class on every event of that run
        ▲
        │  no record → origin_class = operational
Agent / installation (cannot call register_run; cannot send origin_class)
```

- `register_run` is an RPC exposed by the `ingest` function to **service principals only** (`principal_kind: service`, scope `run.register`). It must be called before the run's first event; late registration is rejected.
- The Deriver reads `origin_class`, `eval_set_version` and `holdout_state` from the Run record, never from events. A compromised agent or installation can therefore only ever produce `operational` evidence.
- `holdout_state: active` is settable only through `register_run` with an `eval_set_version` that the scorer treats per D33.
- Schema in Section 5.9; the runs contract exists from Stage 0 so no migration is needed later.

---

## 3. Target repository layout

Repository name: `Improved-Engineering-OS`. Monorepo, pnpm workspaces. A new top-level directory or a new package needs an ADR only when it introduces an architectural boundary (R-12); ordinary files do not.

```text
Improved-Engineering-OS/
  ARCHITECTURE.md                 # the owner's report, citations fixed (TD-17)
  BUILD-GUIDE.md                  # this document
  SECURITY.md                     # threat model, identities (D22, D31), residual risks
  README.md
  docs/
    adr/                          # ADR-0001 baseline (D1–D17 by reference) + ADRs for D18–D36 and later boundaries
    runbooks/                     # install, doctor, enroll/rotate, restore, rollback, backup drill
    budgets.md                    # overhead baselines and versioned budgets
  contracts/
    schemas/*.schema.json         # emitted from packages/core (Zod 4 → draft-2020-12)
    capabilities.yaml             # D28
    telemetry-attributes.yaml     # D26
    freshness-policy.yaml         # Stage 11
    promotion-policy.yaml         # D21, empty until Stage 10
    scoring-policy.yaml           # Stage 10
  packages/
    core/                         # contracts, ids, ports (interfaces), pure domain logic; NO I/O, NO vendor, NO agent names
    evidence-derivation/          # derivers, attribution, investigation; depends on core + EvidenceRepository port
    assurance/                    # controls engine; depends on core only; consumes EvidenceSnapshot
    resolver/                     # resolve/inspect/expand over KnowledgeIndex port
    curator/                      # observations → candidates → promotion PR (runs server-side, see supabase/functions)
    telemetry/                    # envelope, allowlist sanitizer, session_kind, flush strategies; uses Outbox + Ingest ports
    releases/                     # release manifest, index build, score snapshot
    store-sqlite/                 # implements Outbox, KnowledgeIndex (read), LocalCache ports
    store-supabase/               # implements Ingest, EvidenceRepository, Staging ports (client side of Edge Functions)
    adapters/
      mcp/                        # stateless MCP server exposing the Agent Contract
      cli/                        # `ieos` command: same contract over a CLI
      claude-code/                # hook + bootstrap templates for Claude Code
      codex/                      # hook + bootstrap templates for Codex
    launcher/                     # @ieos/launcher, zero deps, never imports other packages (built at Stage 4)
  knowledge/
    assets/<type>/<slug>/         # admitted assets only (D19)
    solution-sets/*.yaml
    controls/*.yaml
  supabase/
    migrations/                   # Supabase CLI migrations
    functions/
      ingest/                     # D22: validates installation token, insert-only RPCs + proposal read/ack for the Promoter
      derive/                     # D31 Deriver
      curate/                     # D31 Curator: signed Promotion Proposals (no GitHub credential)
  .github/workflows/promote.yml   # D31 Promoter: GitHub authority only, opens promotion PRs
  simulations/
    manifests/*.yaml
    fixtures/
  evaluator/                      # hidden conditions, expected outputs, graders; never inside an agent sandbox
  qualification/
    targets/*.yaml                # real target projects: paths, SHAs, rollback (TD-19)
    reports/                      # harness-generated stage reports
  fitness/                        # dependency-cruiser + custom rules, allowlist.yaml, exclusions.yaml
  tools/
    import-legacy/                # Stage 5 importer → promotion PR
    harness/                      # sandbox, agent drivers, graders, artifact collection, budgets
  .github/workflows/              # ci.yml, fitness.yml, release.yml (from Stage 4), weekly-deps.yml
```

**Ports (in `packages/core/src/ports/`)** — the only way domain code reaches I/O (R-05):

```text
KnowledgeIndex        read assets, solution sets, controls from the compiled index
Outbox                append/ack telemetry events locally
Ingest                send events/observations; minimal reads
EvidenceRepository    read evidence, write derivations (server-side only)
Staging               observations, candidates, promotion proposals (server-side only)
Clock, IdMinter       deterministic in tests
```

**Package dependency direction (enforced by `fitness/` from Stage 0):**

```text
launcher             -> (nothing)
core                 -> (nothing)
evidence-derivation  -> core
assurance            -> core
resolver             -> core
telemetry            -> core
curator              -> core
releases             -> core, resolver, evidence-derivation
store-sqlite         -> core
store-supabase       -> core
adapters/*           -> core, resolver, telemetry, assurance, store-sqlite, store-supabase (composition root only)
supabase/functions/* -> core, evidence-derivation, curator, store-supabase
```

No domain package imports a `store-*` package. Composition happens in adapters and functions.

---

## 4. Stage-by-stage build plan

Conventions for every stage:

- **Deliverables** are paths. Ask before creating a new top-level directory or package.
- **Exit gate** is the report's ten-row gate table plus the stage-specific rows below. A stage is closed by a harness-generated report in `qualification/reports/stage-NN-<date>.md`.
- Work on stage N+1 may start while stage N's report is pending; **promotion** into a release may not.
- Documentation is updated in the same PR only when a public contract, command or runbook changes (R-12).

```text
Stage 0  Minimal contracts + minimal harness
Stage 1  Minimal runtime from source (no launcher, no pinning yet)
Stage 2  Seed knowledge (10–20 assets) + minimal resolver + minimal telemetry + installation credential
Stage 3  REAL AGENT VERTICAL SLICE  ← the architectural checkpoint; nothing below is built before it passes
Stage 4  Pinned releases, launcher, restore, rollback
Stage 5  Bulk import of the legacy corpus via promotion PR
Stage 6  Project Profile & onboarding
Stage 7  Full telemetry, evidence derivation, investigation (server-side deriver)
Stage 8  Agent Contract parity: MCP + CLI, Claude Code + Codex adapters
Stage 9  Adaptive Assurance
Stage 10 Scoring, Champion, Curator (server-side) and promotion policy
Stage 11 External ecosystem
Stage 12 Multi-agent & capability dynamics
Stage 13 Resilience, security, scale, full platform matrix
Stage 14 Native vs assisted, ablation, shadow
Stage 15 Project 8 canary
Stage 16 Cross-project qualification
Stage 17 RC → Stable
```

### Stage 0 — Minimal contracts + minimal harness

**Goal.** Enough schema, identity and harness to run one real agent trial honestly. Not the whole contract surface.

**Deliverables.**

- `packages/core/src/contracts/{asset,telemetry,evidence,agent-contract,simulation}.ts` (Zod 4) with the lifecycle block on each; `project-profile`, `control`, `release` contracts are *stubs* with `stability: development` until their stages.
- `packages/core/src/hashing.ts` (D35, the only hashing implementation), `packages/core/src/ids.ts` (ULID + type prefix, `content_hash`, deterministic `evidence_id` per D32), `packages/core/src/ports/*`; `runs` and `principals` contracts (D36, Q-07), the `solution_set` contract with nullable `champion_id`, `canonical_state` and derived `challenge_state` (D34, P-01, C-01), the Evidence `integrity` fields (D32, P-02) and the Effective Score View contract (D24, P-03), so none of them needs a later migration.
- `contracts/capabilities.yaml` seeded from the old repo's `core/capability-registry.yaml`; `contracts/telemetry-attributes.yaml` initial allowlist.
- `docs/adr/ADR-0001-architecture-baseline.md` (accepts D1–D17 by reference to `ARCHITECTURE.md`) and one ADR per D18–D36 with the owner's answers from Section 2.0.
- `tools/harness/`: `sandbox.ts` (fresh temp dir per trial, no inherited env, `evaluator/` never mounted), `drivers/claude-code.ts` (Agent SDK `query()` with `setting_sources=[]` and explicit `allowed_tools`, or `claude -p --output-format stream-json`), `drivers/codex.ts` (`codex exec --json --ephemeral`, optional `--output-schema`), `graders/{deterministic,trace,model}.ts`, `collect.ts`, `report.ts`, `budget.ts`.
- `fitness/` with rules F1–F12 (table below) and `fitness/exclusions.yaml`, `fitness/allowlist.yaml`; `.github/workflows/{ci,fitness}.yml` on Linux plus one Windows smoke job.
- `docs/budgets.md` with an empty baseline table and the measurement method.
- Repo scaffolding: `.gitattributes` (`* text=auto eol=lf`), `.editorconfig`, `pnpm-workspace.yaml` with `engineStrict: true`, `package.json` with `packageManager` and `devEngines`, `SECURITY.md` skeleton.

**Fitness rules (F1–F12).**

| ID | Invariant | Mechanism |
|---|---|---|
| F1 | `packages/core` contains no `claude`, `codex`, `anthropic`, `openai`, `supabase` identifiers and imports nothing outside itself | dependency-cruiser + grep |
| F2 | adapters never own knowledge semantics: nothing under `adapters/` defines ranking or reads `knowledge/` directly | dependency-cruiser |
| F3 | runtime code never mutates canonical knowledge: nothing under `packages/` writes into `knowledge/` at runtime. Before Stage 10, bootstrap imports enter only through an owner-created, reviewed PR and the import tool never pushes. From Stage 10 onward, machine-generated promotions are produced by the Promoter workflow only (C-04) | filesystem-write guard in tests + grep for push/branch calls in `tools/` and `packages/` |
| F4 | `resolver`, `assurance`, `evidence-derivation` import no `store-*` package and no raw telemetry types | dependency-cruiser |
| F5 | `launcher` imports only Node built-ins | dependency-cruiser + dependency count = 0 |
| F6 | no real target-project names or absolute project paths in runtime/configuration paths (`packages/`, `contracts/`, `knowledge/`, `supabase/`, `simulations/`, `fitness/`, `tools/`, `.github/`); `docs/`, root Markdown and `qualification/` excluded via `fitness/exclusions.yaml` | scoped grep |
| F7 | runtime never resolves `latest`: release resolution requires exact version + digest | unit test (from Stage 4) |
| F8 | knowledge index build is deterministic | build twice, compare hashes |
| F9 | no key-shaped secret values anywhere (`sb_secret_[A-Za-z0-9]{20,}`, JWT-shaped, GitHub App private key headers); no privileged client construction outside `supabase/functions`; identifier words allowed in docs and in fixtures listed in `fitness/allowlist.yaml` | secret-value scan + scoped grep |
| F10 | every Simulation Manifest references an evaluator entry that exists outside `simulations/` | manifest linter |
| F11 | Champion selection in `resolver` reads only the release index, never the live score overlay (D34) | unit test + dependency-cruiser on the overlay module |
| F12 | no subsystem defines its own canonical serialization or domain-identity hashing outside `packages/core/src/hashing.ts` (D35). Raw artifact integrity in `packages/launcher` and credential hashing in the auth path are the only permitted `createHash(` sites outside it, are listed in `fitness/allowlist.yaml`, and may not produce an EOS identity (C-02) | grep + dependency-cruiser + allowlist |

**Tests and simulations.** Contract property tests (valid accepted, invalid rejected with reason, unknown enum tolerated where declared). Harness self-test: two trials cannot see each other's state; a trial referencing a non-existent Run is rejected; the agent sandbox contains no `evaluator/` path. Grader validity: each grader has positive, negative and mutation controls. D32 replay test on a synthetic derivation.

**Exit gate additions.** F1–F12 green on Linux + Windows smoke; the D35 cross-platform hashing fixture yields identical digests on both, including an asset tree with nested `files/` entries; a property test proves that a Solution Set with `champion_id: null` never yields a Champion in any resolver path; the `UNPROVEN` bootstrap snapshot hashes identically on both; `contracts/schemas/` regenerated with no diff; ADRs exist for D18–D36.

**Debt watch.** No UI, embeddings, daemon, launcher or full CI matrix here.

### Stage 1 — Minimal runtime from source

**Goal.** `pnpm ieos` runs from a checkout on the owner's machine and in a cloud container, with `doctor`, `init` (footprint per D18.4 pointing at the *source checkout* for now) and `build:index`.

**Deliverables.** `adapters/cli` skeleton (`ieos doctor|init|resolve|inspect|expand|observe|auth`), `adapters/mcp` stateless server exposing the four tools with `server/discover`, `store-sqlite` KnowledgeIndex reader, `releases/build-index.ts`, `releases/scores-snapshot.ts` in bootstrap mode emitting the deterministic `UNPROVEN` snapshot (D24, Q-02).

**Exit gate additions.** `ieos doctor` reports index digest, contracts versions, session kind and ingest reachability; MCP server passes a `2026-07-28` conformance smoke: `server/discover` implemented, self-describing `_meta` on every request accepted, `tools/list` with `ttlMs`, `tools/call`; the smoke also passes without the client ever calling `server/discover`.

### Stage 2 — Seed knowledge + minimal resolver + minimal telemetry + installation credential

**Goal.** Just enough knowledge and observability for one honest real task.

**Deliverables.**

- 10–20 representative assets hand-selected from the legacy corpus (Appendix A), entering through the **bootstrap path** (C-04): the tool writes a local promotion bundle, the owner opens and reviews the PR, and nothing machine-generated pushes a branch. Each asset carries `legacy_ids` and `provenance` (the bulk importer comes at Stage 5). Include at least one `lesson`, one `failed_solution`, two assets in the same Solution Set, one `control_guidance`.
- `resolver` v1 (D20.3) over the index, Champion from the release index (D34, F11) including the `unresolved` path (P-01); `inspect` returning body + `evidence: none`; durable `context_snapshot_id` and Effective Score View (D25, D24).
- **Minimal evidence kernel (T-03):** `evidence-derivation` v0 with one deriver (`attribution`: `EXPOSED | INSPECTED | APPLIED` from `resolve`/`inspect`/`observe` events) producing D32 deterministic ids locally from the outbox; `ieos investigate <run_id>` v0 printing the raw event timeline plus the derived attribution rows. Stage 7 adds the server-side Deriver, more derivers and supersession handling on top of the same contracts; nothing here is throwaway.
- `telemetry` v1: envelope (Section 5.3), allowlist sanitizer, `session_kind`, SQLite WAL outbox, boundary flush; `supabase/migrations/0001_*.sql` (`principals`, `runs`, `raw_events`, `observations` with `UNIQUE(observation_id)`, `context_snapshots`, RLS on, `owner_id`); `supabase/functions/ingest` per D22 including the D22.6 invariants; `ieos auth enroll|rotate|revoke`.
- Adapter hooks for the **primary agent only** (Q-09): `SessionStart`, `PostToolUse`, `Stop`, `SessionEnd` calling the emitter. The second agent's adapter is built at Stage 8.
- `register_run` RPC and the harness service principal (D36) so Stage 3 trials are classified `qualification` by the harness, never by the agent; `scores-snapshot.ts` switches from bootstrap to the real Evidence Plane read.
- Supabase project on Pro (D30) created by the owner; secret key stored only in function secrets.

**Simulations.** Offline mode; duplicate batch; process crash; secret-like value rejected client-side and in the function; **container killed after last tool call in `remote_ephemeral` → events flushed or run `INCOMPLETE`**; token revoked → inserts rejected, coding continues.

**Exit gate additions.** No Supabase key with authority on the client; coding never blocked by ingest outage; `INCOMPLETE` runs visible in `ieos doctor --last-run`.

### Stage 3 — REAL AGENT VERTICAL SLICE

**Goal.** A real agent, in a fresh session, on a realistic disposable repo, performs an ordinary bounded task and uses EOS naturally: `agent → resolve → inspect → work → tests → telemetry → (minimal) evidence → investigation`.

**Hidden condition.** The target repo contains the generated bootstrap block (D18.4), which states that EOS tools exist and what they are for. No task-specific hints, no asset names, no instruction to call any tool.

**Trials (T-07).** At least three independent tasks with the **primary agent only**, each in a fresh sandbox, driven by the harness with `setting_sources=[]` so only the target repo's own files influence the run. The harness pre-registers every run as `qualification` (D36) and pins `ranking_mode: recorded` with a fixed `score_view_id` (D24). One task requires a lesson imported at Stage 2; one includes a misleading clue; one has a test failure mid-task. The second agent is deliberately excluded: Stage 3 answers one question, whether EOS is natural for one real agent end to end; agent neutrality is Stage 8's question.

**Measured.** Task success, whether `resolve` was called unprompted, critical asset recall, returned bytes, tool calls, tokens, wall-clock, resolve latency, telemetry completeness, rescues. These numbers become the first rows of `docs/budgets.md`.

**Exit gate.** No rescue; telemetry → attribution evidence → investigation timeline complete for every trial; the agent used EOS in at least the trials where the imported lesson was needed, or correctly did not need it. **If the slice is not natural, stop here and simplify; nothing from Stage 4 onward is built until this passes.**

### Stage 4 — Pinned releases, launcher, restore & rollback

**Deliverables.** `packages/launcher` (`install|doctor|restore|update|rollback|which`), version cache `~/.ieos/releases/<version>/`, transaction-like activation, mandatory in-launcher SHA-256 verification of `artifact_digest`, plus attestation verification delegated to the official `gh release verify` / `gh release verify-asset` / `gh attestation verify` when `gh` is available or to a proven Sigstore library otherwise, never a home-grown verifier (T-08; immutable releases lock tag and assets and generate a release attestation, verified); `packages/releases` manifest builder (Section 5.7); `.github/workflows/release.yml` publishing an immutable release with SBOM; `ieos init` now points at a pinned release; full platform matrix becomes a CI gate (D18.3).

**Simulations.** Two projects on different versions on one machine; kill during `update`; corrupt cache; tampered artifact; offline restore from cache; Windows path with spaces; clean-machine restore from `installation.json`.

**Exit gate additions.** Tampered artifact never activates; an unattested artifact activates only as `attestation: unverified` and is ineligible for qualification rings; rollback restores exact previous digest; four platforms green.

### Stage 5 — Bulk import of the legacy corpus via promotion PR

**Deliverables.** `tools/import-legacy/`: classifies every file in Appendix A, mints ids, records `legacy_ids`, computes `content_hash`, applies the D19 merge rule, groups Solution Sets and leaves every one of them `unresolved` with `champion_id: null` (D34, P-01), and **writes a local promotion bundle** (`promotion.yaml` + assets) for the owner to open as a PR, never pushing a branch itself (C-04), plus `qualification/reports/import-<date>.md` (inventory before/after, mapping, duplicate groups, exclusions with reasons, manual-classification list). Idempotent re-run produces no diff. The owner approves the batch by merging.

**Simulations.** Full import; import twice; three near-duplicate auth patterns → one Solution Set with two merged duplicates and one distinct-context asset; `failed_solution` never returned by `resolve` (fixture reused by resolver tests).

**Exit gate additions.** Every file accounted for; zero old workflow policies became runtime rules; `integrity: unknown` where provenance cannot be tied to a revision.

### Stage 6 — Project Profile & onboarding

**Deliverables.** `core/profile` (`spec`, `status`, drift `ALIGNED | DRIFT | UNKNOWN`), probes in `assurance/probes` returning `{fact, value, provenance, confidence}`, `ieos profile show|scan|ask`.

**Simulations.** Declared Supabase with live Firebase config → `DRIFT`; `production=false` with deploy workflow → `DRIFT`; re-onboarding an unchanged repo asks zero questions.

### Stage 7 — Full telemetry, evidence derivation, investigation

**Deliverables.** `supabase/functions/derive` (D31 Deriver, pg_cron scheduled), `evidence-derivation` with D32 deterministic ids, `input_snapshot_hash`, supersession, attribution levels, `origin_class`, `independence_group`, staleness scope with selectors (D27); `ieos investigate <run_id|work_id>` as Markdown timeline; `supabase/migrations/0002_evidence.sql`.

**Simulations.** Golden traces; CI failure a day later → new derivation superseding the old, both retained; displayed-only asset never `APPLIED`; replay reproduces identical ids and payloads.

### Stage 8 — Agent Contract parity and adapters

**Deliverables.** Conformance suite run against MCP and CLI with the same fixtures; capability snapshot at run start recorded in Run metadata (never granting permission); **second agent (Codex) adapter and hooks built here and brought to parity with the primary agent, with the Stage 3 task bank re-run through it** (T-07, Q-09); `context_snapshot_id` resolution through both transports.

**Simulations.** MCP server dies mid-run → CLI fallback yields the same semantic object; advertised-but-unauthorized integration reported, never used.

### Stage 9 — Adaptive Assurance

**Deliverables.** `assurance` engine consuming `EvidenceSnapshot` (from the plane when reachable, from the last local snapshot otherwise), Control schema (Section 5.5), states `SATISFIED | MISSING | UNKNOWN | EXEMPT | STALE`, expiring exemptions with `decision_id`, fail-closed only for `critical: true`. Initial Controls seeded from the old repo's quality gates, re-expressed as conditional controls.

**Simulations.** Commit outside scope does not stale; dependency bump matching a selector does; exemption expiry returns `MISSING`; Evidence Plane down → engine still evaluates from snapshot and marks freshness.

### Stage 10 — Scoring, Champion, Curator, promotion policy

**Deliverables.** `contracts/scoring-policy.yaml` (versioned), `evidence-derivation/score.ts` deterministic and replayable, `supabase/functions/curate` (D31 Curator, signed proposals) and `.github/workflows/promote.yml` (D31 Promoter) opening promotion PRs, which is the point at which machine-generated promotions replace the bootstrap path (C-04); Champion changes as promotions setting `canonical_state` (D34), `contracts/promotion-policy.yaml` (everything requires owner merge initially), `releases/scores-snapshot.ts`, D33 holdout enforcement in the scorer (active holdout excluded by construction, with a test).

**Simulations.** 500 correlated repeats discounted; critical failure quarantines; a live score swing never changes `champion_id` or `canonical_state` and never writes to `knowledge/`, only `challenge_state` in the score view; Champion changes only via proposal → PR → release after independent non-holdout evidence; two Champions impossible; a proposal with an invalid signature is rejected by the Promoter; an unresolved set stays unresolved until evidence at `corroborated` or better justifies a proposal, `observed` evidence can at most make a challenger evidence-worthy, and `reported`-only evidence never does either; recompute under previous policy reproduces previous score.

### Stage 11 — External ecosystem

**Deliverables.** `contracts/freshness-policy.yaml`; provider/integration asset types with trust vectors; discovery adapters producing Observations only; live overlay API; runtime health/authorization snapshot.

### Stage 12 — Multi-agent & capability dynamics

**Deliverables.** Handoff of a Work Item between agents preserving Run lineage; concurrency tests on outbox and plane; unknown capability negotiated as `UNKNOWN`.

### Stage 13 — Resilience, security, scale, platform hardening

**Deliverables.** Fault-injection suite (Supabase outage, SQLite lock, full disk, tampered release, prompt-injection fixtures, concurrent runs, token revocation mid-run); synthetic scale (100k assets / 10k controls / 1M events) as stress margin; provisional budgets enforced as thresholds; full four-platform matrix on every PR from here on.

### Stage 14 — Native vs assisted, ablation, shadow

**Deliverables.** Paired-trial runner; ablation switches per subsystem; shadow mode for candidate resolver/scoring versions; vector report as Markdown/CSV. Holdout tasks per D33.

### Stage 15 — Project 8 canary

**Preconditions (from this repository's findings).** Install the pinned candidate in the exact workspace that will run the agent, start a fresh session, run `ieos doctor` and confirm `telemetry: ready` and `qualification_eligible: true` before the task. Never mark this stage from CI artifacts alone.

### Stage 16 — Cross-project qualification

**Deliverables.** A second, materially different target (`qualification/targets/*.yaml`); same release; report of config delta. A core change requested here is a failure of D2/D13, not a task.

### Stage 17 — RC → Stable

**Deliverables.** `1.0.0-rc.N` through Development → Simulation → Shadow → Canary → Cross-project → RC → Stable rings; Evidence Plane restore drill into a scratch Supabase project (D30); rollback proof from RC to previous stable; artifact digest equals tested digest; release attestation verified through the official tooling (T-08), not merely present.

### Continuous evolution

Weekly dependency PR (D29), monthly Champion challenge (Stage 10 suite), native-vs-assisted rerun on every major model change (Stage 14), removal PRs for subsystems that lost their measured benefit, holdout rotation per D33.

---

## 5. Contracts (refined baselines)

Every contract keeps the lifecycle block:

```yaml
schema_version: "1"
stability: development        # development | stable | deprecated | removed
introduced_in: "0.1.0"
deprecated_in: null
replacement: null
migration_path: null
```

Contracts are Zod 4 schemas; `z.toJSONSchema` with `target: "draft-2020-12"` and `unrepresentable: "throw"` emits `contracts/schemas/`. Dates are ISO-8601 strings; no `Date`, `Map`, `Set` or transforms in contract types (unrepresentable in JSON Schema, verified).

### 5.1 Asset (`knowledge/assets/<type>/<slug>/asset.yaml`)

```yaml
id: "asset_01J9Z6Q0K3N6X4R8V2T7M5B1WQ"      # ULID, immutable (D19)
type: "pattern"                             # pattern | skill | template | reference_test | reference_repo | lesson | failed_solution | provider | integration | fact | control_guidance
slug: "oauth-pkce-web"
title: "OAuth 2.1 PKCE for browser apps"
summary: "≤ 400 chars, what `resolve` returns"
status: "active"                            # active | restricted | quarantined | deprecated | superseded  (no staging states here, D19)
content_hash: "sha256:…"
legacy_ids: ["patterns/auth/oauth-pkce.md"]
problem: { id: "problem.auth.browser-login", capabilities: ["auth.oauth.pkce"] }
solution_set_id: "solset_01J…"
applicability: { conditions: [ { fact: "platform", in: ["web"] } ] }
compatibility: { platforms: ["web"], providers: ["auth0", "supabase-auth"], constraints: [] }
provenance:
  - { source_type: "existing_eos", source_identity: "yotamfried-ux/Engineering-OS", source_revision: "<sha>", observed_at: "…", integrity: "verified" }
freshness: { class: "normal", last_verified_at: "…" }
risk: { execution_authority: "data_only", blast_radius: "read_only" }
relationships: { supersedes: [], superseded_by: [], related_to: [] }
evidence_policy: { eligible_origins: ["qualification", "operational"] }   # never active holdout (D33)
body: "body.md"
files: []
```

### 5.2 Project Profile (`.ieos/profile.yaml`)

```yaml
schema_version: "1"
project_id: "proj_01J…"
eos: { pinned_release: "1.0.0", release_digest: "sha256:…" }   # Stage 0–3: { source_checkout: "<path>", index_digest: "…" }
spec:
  lifecycle: "prototype"
  database_provider: "supabase"
  authentication_required: true
  deployment: "vercel"
  architecture_constraints: []
decisions: [ { decision_id: "ADR-0003", subject: "database_provider", status: "accepted" } ]
known_unknowns: ["production_user_count"]
```

### 5.3 Telemetry envelope

```yaml
schema_version: "1"
event_id: "evt_01J…"                        # idempotency key, UNIQUE in outbox and plane
event_type: "tool.call"
project_id: "proj_…"
work_id: "work_…"
run_id: "run_…"
installation_id: "inst_…"                   # D26
emitter_id: "emt_…"                         # unique per process/run emitter (R-11)
session_kind: "remote_ephemeral"            # local_persistent | remote_ephemeral | ci
trace: { trace_id: "…", span_id: "…", parent_span_id: null, links: [] }
time: { occurred_at: "…", observed_at: "…", ingested_at: null }
source: { type: "agent", sequence: 42 }     # ordering key = (installation_id, emitter_id, sequence)
revision: { repo_sha: "…", eos_release: "1.0.0" }
harness: { agent: "claude-code", model: "…", adapter_version: "…", available_capabilities_hash: "…" }
attributes: {}                              # only keys in contracts/telemetry-attributes.yaml
```

Run-level state written by the runtime (not an event): `telemetry_state: COMPLETE | INCOMPLETE`, `qualification_eligible: bool`, `ingest_reachable_at_start: bool` (D23). `origin_class` is never in the envelope; the ingest function stamps it from the Run record (D36).

### 5.4 Evidence (derived, D32)

```yaml
schema_version: "1"
evidence_id: "evd_<base32(sha256(JCS({run_id, deriver_id, deriver_version, input_snapshot_hash})))>"   # D35
subject: { type: "asset", id: "asset_…" }
kind: "success"                             # success | failure | partial | verification | rework
origin_class: "operational"                 # development | qualification | operational | holdout | external_attestation
holdout_state: null                         # active | retired, when origin_class = holdout
independence_group: "ig_…"
strength: { polarity: "positive", weight: 0.0, confidence: 0.0 }
attribution: { exposure: "applied", source_event_ids: ["evt_…"], trace_id: "…" }
integrity:                                  # P-02; stamped by the deriver from source + Run record, never from event content
  source_authority: "agent_runtime"         # agent_runtime | deterministic_test | ci | review | external
  verification: "reported"                  # reported | observed | corroborated | externally_verified
derivation:
  deriver_id: "attribution"
  deriver_version: "3"
  input_snapshot_hash: "sha256:…"
  input_watermark: "…"                      # latest ingested_at consumed
  derived_at: "…"                           # excluded from replay comparison
  supersedes_derivation_id: null
revision: { repo_sha: "…" }
scope: { paths: ["src/auth/**"], depends_on: ["dependency:@supabase/ssr", "profile:authentication_required"], max_age_days: 90 }   # D27
```

### 5.5 Control

```yaml
schema_version: "1"
id: "ctl_01J…"
title: "Auth code paths have a security test"
critical: false
applies_when: [ { fact: "authentication_required", eq: true }, { fact: "lifecycle", in: ["internal", "production"] } ]
satisfied_by: [ { evidence_kind: "verification", subject_type: "control", min_confidence: 0.8 } ]
default_scope: { paths: ["src/auth/**"], depends_on: ["dependency:@supabase/ssr"], max_age_days: 90 }
exemption: { allowed: true, max_days: 30, requires_decision: true }
```

### 5.6 Agent Contract (identical over MCP and CLI)

```text
resolve(request: { task_hint, project_id, run_id, limit?, include_controls?, ranking_mode?: "live_overlay" | "recorded", score_view_id? })
  → { context_snapshot_id, ranking_mode, effective_score_view_id,
      items: [{ id, type, title, summary, project_fit, champion_of?, champion_status?: "pinned" | "pinned_challenged", score, score_source, evidence_count }],   # champion_status is presentation only: canonical_state from the release + challenge_state from the score view (C-01)
      coverage: [{ solution_set_id, unresolved_solution_set: true, member_count, problem_id }],   # P-01: relevant set with no canonical answer
      omitted_count, controls: [...] }   # one Champion per resolved Solution Set, from the release index (D34); no challenger entries

inspect(request: { handle: { kind: "asset" | "snapshot" | "solution_set", id }, run_id })
  → asset: { asset, body, evidence_summary | "none", champion_source: "release", canonical_state, challenge_state, challenger?: { id, title, live_score, margin, evidence_difference, why_not_champion } }
  → solution_set: { id, problem_id, canonical_state, champion_id | null, challenge_state, members: [{ id, title, evidence_state, integrity_best }], why_unresolved }
  → snapshot: { repo_sha, profile_status_digest, change_scope, capability_snapshot_hash, index_digest, ranking_mode, effective_score_view_id, score_source, eos_release }

expand(request: { task_hint, project_id, run_id, reason, beyond: "solution_set" | "type" | "corpus" })
  → same shape as resolve, plus { expansion_reason }

observe(request: { observation_id, run_id, kind, subject, evidence_refs?, note? })   # observation_id minted by the caller (ULID)
  → { observation_id, status: "recorded" | "duplicate" }      # staging only, never canonical; UNIQUE(observation_id) server-side
```

MCP annotations: `readOnlyHint: true` on `resolve`/`inspect`/`expand`; `idempotentHint: true` on `observe` (backed by the caller-minted `observation_id`). Server implements `server/discover`; lists carry `ttlMs` and `cacheScope`; no client is required to call `server/discover`.

### 5.7 Release manifest

```yaml
schema_version: "1"
version: "1.0.0"
tag: "v1.0.0"
source_commit: "…"
artifact_digest: "sha256:…"
index_digest: "sha256:…"
scores_snapshot_digest: "sha256:…"
sbom_ref: "…"
release_attestation: { status: "verified" | "unverified", verifier: "gh" | "sigstore-lib" | null }   # digest is always verified in-launcher; attestation via official tooling (T-08)
champions_digest: "sha256:…"                # hash of the Solution Set champion_id + canonical_state assignments compiled into this release (D34, C-01)
score_view_id: "sv_…"                       # recorded score view shipped with this release (D24, Q-06); all digests per D35
contracts: { asset: "1", project_profile: "1", telemetry: "1", evidence: "1", control: "1", simulation: "1", agent_contract: "1" }
```

### 5.8 Installation manifest (`.ieos/installation.json`)

```json
{ "schema_version": "1", "release": "1.0.0", "artifact_digest": "sha256:…", "bootstrap_template_hash": "sha256:…", "installed_at": "…", "installation_id": "inst_…", "ingest_endpoint": "https://<project>.supabase.co/functions/v1/ingest" }
```

### 5.9 Principals, runs and staging (Evidence Plane side, D22, D36)

```sql
create type principal_kind as enum ('installation', 'service');

create table principals (
  id text primary key,                 -- inst_… or svc_…
  kind principal_kind not null,
  owner_id uuid not null,
  token_hash bytea not null unique,    -- sha256 of the opaque token; token itself never stored
  scopes text[] not null,              -- installation: {'telemetry.insert','observation.insert','read.minimal'}
                                       -- service:      subsets of {'run.register','proposal.read','proposal.ack','ci'}
  label text, created_at timestamptz not null default now(),
  expires_at timestamptz not null, revoked_at timestamptz, last_seen_at timestamptz
);

create table runs (
  run_id text primary key,
  owner_id uuid not null,
  registered_by text references principals(id),   -- null for unregistered (operational) runs, filled on first event
  origin_class text not null default 'operational', -- development | qualification | operational | holdout (D36)
  holdout_state text,                               -- active | retired, only with origin_class = holdout
  eval_set_version text, simulation_id text,
  registered_at timestamptz, first_event_at timestamptz,
  telemetry_state text, qualification_eligible boolean
);

alter table principals enable row level security;  -- owner-only policies; the ingest function uses SECURITY DEFINER RPCs
alter table runs enable row level security;

-- staging (never in Git): observations (UNIQUE observation_id), candidates, promotion_proposals
-- promotion_proposals carry: asset diff, evidence ids, input_snapshot_hash, risk class, trust vector,
-- signature over the D35 canonical bytes (Ed25519; public key committed in the canonical repo), status open|acked|withdrawn
```

RPC surface of the `ingest` function by principal kind:

| RPC | installation | service (`run.register`) | service (`proposal.*`) |
|---|---|---|---|
| `ingest_events(jsonb)` | yes | no | no |
| `ingest_observations(jsonb)` | yes | no | no |
| `ingest_context_snapshots(jsonb)` | yes | no | no |
| `read_minimal(kind)` | yes | yes | yes |
| `register_run(...)` | no | yes | no |
| `read_proposals()`, `ack_proposal(id)` | no | no | yes |

### 5.10 Solution Set (`knowledge/solution-sets/<id>.yaml`, D34)

```yaml
schema_version: "1"
id: "solset_01J…"
problem_id: "problem.auth.browser-login"
compatibility_key: "web|supabase-auth"        # with problem_id defines the equivalence class (D28)
members: ["asset_01J…", "asset_01K…", "asset_01M…"]

# Canonical state: owned by Git, compiled into the release (C-01)
canonical_state: "unresolved"                 # unresolved | pinned
champion_id: null                             # null exactly when canonical_state = unresolved
champion_since_release: null                  # release that pinned the current champion
why_unresolved: "all members unproven at import; no evidence at corroborated or better"

# challenge_state is NOT stored here. It is derived at runtime into the Effective Score View:
#   challenge_state: none | challenged
#   challenger: { asset_id, margin, proposal_id }
```

Invariants, enforced by contract tests at Stage 0 and by fitness F11:

- `champion_id` is non-null exactly when `canonical_state` is `pinned`.
- A transition into `pinned` requires the C-05 ladder: independent evidence at integrity `corroborated` or better, meeting the threshold in `scoring-policy.yaml`, then a Promotion Proposal, an owner merge and a release. There is no runtime transition.
- The release index compiles `canonical_state` and `champion_id` verbatim; `challenge_state` never appears in `knowledge/` or in the index.
- No resolver path may substitute a highest-scoring member for a null champion.

---

## 6. Working conventions for the coding agent

### 6.1 Kickoff instruction (paste into the first session of the new repository)

```text
You are building Improved-Engineering-OS. Read ARCHITECTURE.md (constitution) and BUILD-GUIDE.md fully.
Rules:
1. Work stage by stage in the order of BUILD-GUIDE.md Section 4. Stages 4+ are not started before the
   Stage 3 real-agent slice (primary agent only) has a passing report in qualification/reports/.
2. Section 2.0 decisions (D18–D36) are accepted unless the owner changed the row. Record each in docs/adr/.
3. Deliverables are listed paths. Ask before creating a new top-level directory or package.
4. Never write into knowledge/ from runtime code. Never store or read a secret key, service_role or owner
   credential on a developer machine or agent container; the only client credential is the installation token.
5. Unknown is UNKNOWN. Telemetry loss is INCOMPLETE, never success. Do not change success criteria after a
   failure; revise the manifest and keep the old failure.
6. Before adding a dependency: verify it against its current official documentation, pin exactly, note it in the PR body.
7. Every PR: fitness green, tests green on the CI configuration of the current stage.
8. Stop and report when: a fitness rule must be relaxed, a stage gate cannot be met without changing the
   architecture, a real target project is needed, or a credential/plan decision is required.
Start with Stage 0.
```

### 6.2 Branch, commit and PR flow

- `main` is always releasable, not release-only (T-10): small PRs land on `main` throughout a stage; releases are immutable tags and artifacts cut from `main`. Branch naming: `stage-NN/<topic>`.
- Commits: Conventional Commits plus a trailer `Evidence: <test command or report path>`. Enforced by CI lint, not by a blocking local hook.
- PR body sections: `What`, `Why (ADR/stage)`, `Evidence`, `Contracts touched`, `Debt watch`.
- Merge only when fitness, the stage's CI configuration and the stage-relevant simulation job are green and the owner approved.

### 6.3 Definition of Done per PR

- Tests for new behavior, including at least one negative case.
- Fitness F1–F12 green.
- Contracts regenerated; `contracts/schemas/` has no uncommitted diff.
- README or runbooks updated **only if** a public command, contract or runbook changed.
- No placeholder markers, no commented-out code, no `latest` in runtime paths.

### 6.4 Never list

- Never bypass a failing simulation by editing its criteria in the same PR.
- Never copy code from the old Engineering-OS `scripts/` into `packages/` (reference only; Appendix A).
- Never hard-code an agent, model, provider or project name in `packages/core`.
- Never add a UI, a daemon, embeddings or a marketplace before the stage that justifies it.
- Never commit telemetry, evidence or staging data to any Git repository.
- Never let holdout evidence reach the scorer.
- Never let a live score change the pinned Champion at runtime, and never list challengers in `resolve`; Champion changes are promotions (D34).
- Never define canonical EOS hashing, serialization or domain identities outside `packages/core/src/hashing.ts` (D35); raw artifact integrity and credential hashing are the only exceptions and never produce an identity. Never let a client set `origin_class` (D36) or `integrity` (D32).
- Never invent a Champion for an unresolved Solution Set, in the importer, the resolver or the scorer, and never move a set to `pinned` without a merged promotion and a release (D34, C-05).
- Never let an import tool push a branch; before Stage 10 the owner opens the PR, after it the Promoter does (C-04).
- Never implement signature or attestation verification by hand; digest in-launcher, attestation via official tooling (T-08).

---

## 7. Open parameters register

| # | Parameter | Provisional value | Decided at | From what data |
|---|---|---|---|---|
| 1 | Raw telemetry retention / cold storage | keep all until Stage 13 | Stage 13 | measured growth per run |
| 2 | Evidence Plane RPO / RTO | RPO 24 h (daily backup), RTO 1 working day; PITR if RPO must shrink | Stage 17 restore drill | drill timing |
| 3 | Asset Score prior, weights, decay | uniform prior, no decay | Stage 10 | evidence distribution from Stages 3–9 |
| 4 | Minimum independent evidence to leave `unresolved` or change Champion | 3 independence groups, none holdout, integrity at least `corroborated` for the promotion proposal (`observed` only makes a challenger evidence-worthy) | Stage 10 | Champion challenge runs |
| 5 | Champion replacement margin | not set | Stage 10 | same |
| 6 | Freshness TTLs per class | stable 180 d, normal 60 d, volatile 7 d, live_required 0 | Stage 11 | verification hit/miss log |
| 7 | Auto-mergeable promotion categories | none | Stage 10+ | promotion history |
| 8 | Resolve latency / context budget | ≤ 1.5 s, ≤ 6 KB per resolve (provisional) | Stage 3 | slice measurements |
| 9 | Agent trial budget per simulation | set per manifest; harness aborts at 2× | Stage 3 | trial cost |
| 10 | Trials and stopping rules per eval class | deterministic 1; stochastic 5 minimum | Stage 3 | observed variance |
| 11 | Release bake duration / ring thresholds | not set | Stage 17 | canary history |
| 12 | Reproducibility-critical Evidence retention | indefinite | Stage 13 | storage cost |
| 13 | Scale thresholds | 100k / 10k / 1M stress margin | Stage 13 | measured usage |
| 14 | Owner Defaults scope | none | after Stage 16 | repeated per-project config |
| 15 | Installation token lifetime | 90 days, renewable | Stage 2 | enrol/rotate friction |
| 16 | Ingest flush timeout and retry budget in ephemeral sessions | 5 s per flush, 3 retries | Stage 3 | INCOMPLETE rate |
| 17 | Holdout set size and rotation cadence | ≥ 20 tasks; rotate when more than 20% of the active holdout has been consumed or exposed in evaluation cycles, or whenever contamination or leakage is suspected (P-05) | Stage 14 | overfitting signals |

---

## Appendix A — Import map from the current Engineering-OS repository

Computed on the current checkout of `yotamfried-ux/Engineering-OS`; the importer recomputes counts at run time. **Stage 2** hand-selects 10–20 items from this map; **Stage 5** imports the rest through a Bulk Import Promotion PR.

| Source path | Approx. size | Import as | Notes |
|---|---|---|---|
| `patterns/<domain>/**/*.md` + `patterns/registry.yaml` | 88 registry entries, 28 pattern README documents across 21 domains | `pattern` assets, `status: active`, `evidence: none` | Registry `status/score/used_in` become provenance notes, never scores. Group by `problem.id`. |
| `templates/<type>/` | 27 template directories | `template` assets | `hooks`, `settings`, `commands`, `bypass-control-plane` are old-runtime artifacts: exclude or import as `lesson` references. |
| `external-systems/<service>/` | 49 service directories | `provider` (+ `integration` for `connectors/`) | |
| `external-skills/<skill>/` | 10 skills | `skill` assets, `risk.execution_authority: executable` | Mandatory-activation rules are governance, not knowledge: strip. |
| `docs/architecture-guides/`, `docs/frameworks/`, `docs/api-design/`, `docs/ui-ux/`, `docs/troubleshooting/` | part of 125 docs files | `pattern` or `fact` by content; troubleshooting → `lesson` | |
| `docs/official-docs/`, `docs/reference-repositories/`, `docs/api-references/` | — | `fact` / `reference_repo`, `freshness.class: volatile` | Live verification applies (Stage 11). |
| `lessons-learned/bugs/*.md` | 19 lessons | `lesson` | Several are directly relevant to the new build (telemetry handoff, evidence keyed on mechanism, unit-vs-wiring); tag `applies_to: ieos`. Stage 2 seed candidates. |
| `lessons-learned/postmortems/*.md`, `prevention-strategies/*.md` | 2 + 1 | `lesson` | History, not rules. |
| `failed-solutions/*.md` | 1 | `failed_solution` | Never returned by `resolve`. Stage 2 seed. |
| `architecture-decisions/ADR-*.md` | 2 | `fact` | Provenance only. |
| `core/capability-registry.yaml` | — | seed for `contracts/capabilities.yaml` (D28) | Keep ids; drop enforcement fields. |
| `core/quality-gates.md`, `core/debugging-policy.md`, `core/learning-loop.md` | — | source for Stage 9 Controls and Stage 7 derivers | Conditional controls, not workflow. |
| `evals/engineering-os/*.jsonl` | 1 file | seed cases for `simulations/fixtures/` | |
| `docs/operations/*.md`, `docs/research/*.md` | 27 + 2 | **exclude**, except `project8-first-real-run-findings.md` → `lesson` | |
| `scripts/**`, `.claude/**`, `.github/**`, `telemetry-archive/`, `.checkpoints/`, `graphify-out/`, `experiments/` | — | **exclude** | Old implementation; reference only (D16). |
| `CLAUDE.md`, `CLAUDE.template.md`, `core/workflow.md`, `core/task-router.md`, `core/hooks-policy.md`, `core/precedence.md`, `core/coderabbit-policy.md`, `core/skill-orchestration-policy.md` | — | **exclude** as rules; one `lesson` summarizing the governance-overhead retrospective | The old governance the report does not inherit. |

## Appendix B — External facts: verification status

All rows marked "Verified" were checked in this session through Context7 against the vendor's official documentation.

| Claim used in this guide | Status | Source |
|---|---|---|
| MCP `2026-07-28`: stateless core, initialization handshake removed, servers must implement `server/discover` while every request is self-describing via `_meta` (clients need not call discover; mismatch → error `-32022`), `ttlMs`/`cacheScope`, handles as tool arguments, HTTP+SSE deprecated | Verified (re-checked in 1.2) | https://modelcontextprotocol.io/specification/2026-07-28/changelog · /server/discover · /basic/index · /basic/versioning · /server/tools · /deprecated |
| Supabase publishable/secret keys replace anon/service_role; legacy keys deprecated by end of 2026; secret key bypasses RLS; `SUPABASE_SECRET_KEYS` env in functions | Verified | https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys |
| Edge Functions: `Authorization` reserved for Supabase Auth JWTs, `apikey` for project keys; `--no-verify-jwt` to skip platform JWT check | Verified | https://supabase.com/docs/guides/functions/auth-headers · /guides/functions/function-configuration |
| Supabase Pro: daily backups retained 7 days; Free: no daily backups, pauses after 7 idle days; PITR add-on; Storage objects excluded from database backups; pg_cron scheduling | Verified | https://supabase.com/docs/guides/platform/backups · /guides/deployment/going-into-prod · /guides/cron/quickstart |
| Node.js 24 is LTS (since 24.11.0) supported through April 2028; Node 22 in maintenance until April 2027 | Verified | https://nodejs.org/en/blog/migrations/v22-to-v24 · https://nodejs.org/en/blog/release/v22.11.0 |
| pnpm `packageManager` / `devEngines.packageManager`, `engineStrict`, `pnpm ci` (v11) | Verified | https://pnpm.io/package_json · https://pnpm.io/cli/ci · https://pnpm.io/settings/cli |
| better-sqlite3: `journal_mode = WAL`, `timeout` (busy) option, `.transaction()` | Verified | https://github.com/wiselibs/better-sqlite3/blob/master/docs/api.md · docs/performance.md |
| Zod 4 `z.toJSONSchema`, draft-2020-12 default, unrepresentable types (date, map, set, transform) throw | Verified | https://zod.dev/json-schema |
| GitHub immutable releases lock tag and assets and generate a release attestation; `gh release verify`, `gh release verify-asset`, `gh attestation verify` | Verified | https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases · …/verifying-the-integrity-of-a-release |
| GitHub App installation access tokens expire after 1 hour and can be scoped to repositories and permissions; creating/merging PRs needs `contents` and `pull_requests` permissions | Verified | https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app · https://docs.github.com/en/rest/pulls/pulls |
| Claude Code: `.mcp.json` project scope; hooks `SessionStart`/`Stop`/`PostToolUse`; exit code 2 semantics per event; `claude -p --output-format json|stream-json`; Agent SDK `query()` with `setting_sources=[]`; cloud environments have network access controls | Verified | https://code.claude.com/docs/en/mcp-quickstart · /hooks · /best-practices · /agent-sdk/python · /cloud-environments |
| Codex CLI: `codex exec --json --ephemeral --output-schema`; hooks (`SessionStart`, `SessionEnd`, `Stop`, `PostToolUse`, …) in `config.toml` or `hooks.json`; `AGENTS.md` discovery root→cwd with `AGENTS.override.md`; project `.codex/config.toml` layers with a denylist for credential-affecting keys; `codex mcp add` | Verified | https://github.com/openai/codex (codex-rs/exec, codex-rs/config, codex-rs/core/src/agents_md.rs) |
| MCP Registry preview status; OpenAI Evals timeline; SWE-Bench Pro audit; NIST SSDF; Anthropic deferred tool loading | Not re-verified in this session | informational in the report; no design dependency |

## Appendix C — Glossary additions

| Term | Definition |
|---|---|
| Installation | One machine or container image running an EOS runtime; identified by `installation_id`; holds one revocable installation token. |
| Installation token | Opaque per-installation credential accepted only by the `ingest` Edge Function; scopes `telemetry.insert`, `observation.insert`, `read.minimal`. |
| Session kind | `local_persistent`, `remote_ephemeral`, or `ci`; selects the flush strategy. |
| `telemetry_state` | `COMPLETE` or `INCOMPLETE` per run; `INCOMPLETE` runs are never qualification-eligible. |
| Score snapshot | Release-time export of Asset Scores and Champion state used when the Evidence Plane is unreachable. |
| Context snapshot | The inputs a `resolve` was computed from (repo SHA, profile digest, change scope, capability hash, score digests); addressable by `context_snapshot_id`. |
| Staleness scope | Path globs, dependency selectors and max age that bound when Evidence stops being valid. |
| Derivation | One deterministic run of a deriver over an input snapshot; identified by `evidence_id`; may supersede an earlier derivation. |
| Active / retired holdout | Evidence origin that is never an optimization input while active; retiring it reclassifies it and requires a replacement set. |
| Curator | Server-side function with Supabase authority only that turns Candidates into signed Promotion Proposals. |
| Promoter | GitHub Actions workflow with GitHub authority only that validates a Promotion Proposal and opens the PR; never merges. |
| Release-pinned Champion | The Solution Set default compiled into a release; live scores can only flag a challenger. |
| Unresolved Solution Set | A set with relevant members but no evidence-justified Champion; `resolve` reports it as coverage instead of choosing one. |
| Canonical state / challenge state | `canonical_state` (`unresolved \| pinned`) is owned by Git and the release; `challenge_state` (`none \| challenged`) is derived at runtime and never written to Git. |
| Bootstrap promotion | Before Stage 10, an import tool writes a local promotion bundle and the owner opens the PR; the tool never pushes. |
| Effective Score View | The ranking inputs that actually affected one `resolve`, hash-identified and stored so the decision stays explainable. |
| Evidence integrity | The `source_authority` and `verification` pair that says how strongly a claim was established; client-reported telemetry can never be the strongest grade. |
| Fitness rule | An executable architectural invariant (F1–F12) that runs on every PR. |
| Principal | An authenticated caller of the Evidence Plane: `installation` (an agent machine or container) or `service` (harness, Promoter, CI). |
| Run Classification Authority | The service-principal-only `register_run` path that fixes a run's `origin_class` before its first event (D36). |
| Score view | An immutable, hash-identified set of scores used for `ranking_mode: recorded` in qualification and replay (D24). |
| Hashing Contract | The single project-wide rule for canonical bytes, digests, ids and signatures (D35). |
| Stage report | Harness-generated Markdown in `qualification/reports/` that closes a stage; the only artifact that may claim a gate passed. |
