# RTK — Integration Contract

## תפקיד פונקציונלי

RTK הוא **שכבת context-optimization** שמצמצמת את כמות הטוקנים שפלטי Bash
מכניסים ל-LLM context. הוא פועל **שקוף** — אין שינוי בנוהל העבודה.

---

## מתי RTK פועל

RTK מיירט **Bash tool calls** דרך PreToolUse hook:

```
Claude → [Bash: "git status"] → PreToolUse hook → rtk hook claude → compressed output → Claude
```

כל הפקודות שעוברות דרך Bash tool מקבלות אוטומטית את סינון RTK.

---

## מה מכוסה

| כלי | דוגמה | חיסכון טיפוסי |
|---|---|---|
| git | `git status`, `git log`, `git diff` | 70–90% |
| file ops | `find .`, `ls -la`, `grep` | 60–80% |
| tests | `cargo test`, `pytest`, `jest` | 50–70% |
| build/lint | `cargo build`, `tsc`, `eslint` | 60–80% |
| containers | `docker ps`, `kubectl get pods` | 70–85% |

## מה לא מכוסה

| כלי | סיבה |
|---|---|
| Read tool | built-in, לא Bash |
| Grep tool | built-in, לא Bash |
| Glob tool | built-in, לא Bash |
| MCP tools | protocol שונה |

**עצה:** להשתמש ב-`rtk grep`, `rtk find`, `rtk read` ישירות דרך Bash במקום
Claude Code tools — מקבלים סינון RTK.

---

## מתי אסור להשתמש

RTK מסנן פלט. במקרים שבהם **הפלט המלא חיוני** (debugging של parsing מדויק,
אימות exact output), השתמש ב-`rtk proxy <cmd>` לעקיפת הסינון.

---

## השפעה על workflow

- **אין שינוי בנוהל** — RTK שקוף לחלוטין.
- **חיסכון מצטבר** — בסשן של 30 דקות: ~80% פחות טוקנים מפלטי Bash.
- **אימות**: `rtk gain` מציג חיסכון מצטבר; `rtk gain --history` פר-פקודה.

---

## composition (לפי skill-orchestration-policy.md)

RTK הוא `context-optimization` — רץ **לפני הכל** ומשרת את כל שלבי ה-workflow.
ממוקם עם graphify בשכבת ה-context-optimization, לפני planning/coding/security/review.
