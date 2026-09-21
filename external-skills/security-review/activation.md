# Security Review — Activation

## Prerequisites

| Requirement | Details |
|---|---|
| `Nemotron_api_key` | **Required for primary path (Option A).** Set as Claude Code secret or env var. Obtain from [build.nvidia.com](https://build.nvidia.com). |
| Claude Code CLI | Required for fallback path (Option B slash command). |
| Repository permissions | `pull-requests: write`, `contents: read` (if using GitHub comment output). |

> **NEVER use Claude Anthropic API for security review.** Option A uses Nemotron (NVIDIA).
> Option B uses the current Claude Code session (no separate API key). No Anthropic API key is
> needed or acceptable for this gate.

---

## Routing — מי מריץ את הביקורת

```
Nemotron_api_key set?
  YES → Option A: mcp__nemotron__nemotron_review_code  (PRIMARY)
  NO  → Option B: /security-review slash command       (FALLBACK — Claude Code session)
```

ה-security gate חייב לרוץ לפני מיזוג ל-main, ללא יוצא מן הכלל. ה-routing אוטומטי —
אם `Nemotron_api_key` מוגדר, Option A מופעל; אחרת, Option B.

---

## Option A: Nemotron MCP (PRIMARY)

**מתי:** כאשר `Nemotron_api_key` מוגדר (recommended — ה-Nemotron model מתמחה בביקורת קוד).

### הפעלה דרך Claude Code

כש-`Nemotron_api_key` מוגדר, הכלי `mcp__nemotron__nemotron_review_code` זמין אוטומטית
בסשן דרך shרת ה-MCP של Nemotron. לא נדרשת כל התקנה נוספת.

**הפעלה (מתוך Claude):**
```
Use mcp__nemotron__nemotron_review_code with the current diff to perform a security review.
```

**הפעלה דרך slash command (אם הותקן `/security-review-nvidia`):**
```bash
/security-review-nvidia
```

### הגדרת Nemotron_api_key

**ב-Claude Code CLI (מומלץ — נשמר בין סשנים):**
```bash
# Add to Claude Code secrets (one-time, persists across sessions):
# Settings → Secrets → Add: Nemotron_api_key = nvapi-...
```

**כמשתנה סביבה (זמני לסשן):**
```bash
export Nemotron_api_key=nvapi-...
```

### מודלים מומלצים

| מודל | ID | הערות |
|---|---|---|
| Nemotron Ultra | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | **ברירת מחדל** — עמוק ביותר |
| Llama 3.1 70B | `meta/llama-3.1-70b-instruct` | מהיר יותר, איכות גבוהה |
| Llama 3.1 8B | `meta/llama-3.1-8b-instruct` | מהיר, tier חינמי |

לעקיפת המודל: `export NVIDIA_MODEL=meta/llama-3.1-70b-instruct`

---

## Option B: Slash Command ב-Claude Code (FALLBACK)

**מתי:** כאשר `Nemotron_api_key` אינו מוגדר. רץ בתוך סשן Claude Code הקיים —
לא דורש API key נפרד; משתמש ב-model context של הסשן הנוכחי.

### התקנה

העתק את קובץ הפקודה לריפו היעד:

```bash
mkdir -p .claude/commands
cp <path-to-engineering-os>/.claude/commands/security-review.md .claude/commands/security-review.md
```

ניתן לקבל זאת אוטומטית דרך `use-in-project.sh` — הסקריפט מעתיק את הפקודה בשלב ה-bootstrap.

### הפעלה

```
/security-review
```

בתוך Claude Code session בריפו — הפקודה מריצה ביקורת אבטחה על כל השינויים הממתינים
ב-branch הנוכחי.

**אימות:** הקלד `/security-review` ב-Claude Code — הפקודה אמורה להתחיל מיד.

---

## Configure Secrets

### Nemotron_api_key (required for Option A)

1. Sign up at [build.nvidia.com](https://build.nvidia.com) and generate an API key (`nvapi-...`).
2. **Claude Code secrets (recommended):** Settings → Secrets → Add `Nemotron_api_key`.
3. **Local env (alternative):** `export Nemotron_api_key=nvapi-...` (add to `.env`, never commit).

### GITHUB_TOKEN (automatic — for PR comment output only)

The default `GITHUB_TOKEN` provided by GitHub Actions is used automatically for posting PR comments when the script is run in CI. No additional configuration needed — the `permissions` block in any workflow YAML grants the required access.

> **No Anthropic API key (`CLAUDE_API_KEY`) is required or used.** If a previous setup had
> `CLAUDE_API_KEY` configured for security review — it can be removed from repository secrets.

---

## Trusted-PR Gating (Mandatory for Public Repositories)

Because the skill is not hardened against prompt injection, external contributor PRs must be
approval-gated before the review runs. Configure this in GitHub:

1. Go to the repository → **Settings** → **Actions** → **General**.
2. Under "Fork pull request workflows from outside collaborators", select
   **"Require approval for first-time contributors"** (minimum) or
   **"Require approval for all outside collaborators"** (recommended for security-sensitive repos).

---

## Verify Installation

```bash
# Verify Nemotron_api_key is set:
echo ${Nemotron_api_key:0:8}...   # should show nvapi-xx...

# Verify nemotron MCP tool is available in session:
# (In Claude Code) type: /tools — mcp__nemotron__nemotron_review_code should appear

# Verify fallback slash command:
ls .claude/commands/security-review.md
```

---

## Disable / Uninstall

### Disable Option A (Nemotron)

Unset the API key:
```bash
unset Nemotron_api_key
# Remove from Claude Code secrets: Settings → Secrets → remove Nemotron_api_key
```

The system automatically falls back to Option B (slash command).

### Disable Option B (Slash Command)

```bash
git rm .claude/commands/security-review.md
git commit -m "chore: remove security-review slash command"
```

### Full Removal

Remove the slash command file and unset `Nemotron_api_key`. Note: disabling this skill removes
the LEVEL 2 mandatory gate. Ensure an alternative security review process is in place before
disabling in a production repository.
