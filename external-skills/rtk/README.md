# RTK — Rust Token Killer

**מה זה:** CLI proxy חד-קובץ (Rust binary, zero dependencies) שמיירט פלטי Bash
ומכווץ אותם לפני שנכנסים ל-LLM context. חיסכון מצוי: **60–90%** על פלטי dev tools.

**מקור:** https://github.com/rtk-ai/rtk (MIT)
**גרסה נוכחית:** `rtk 0.42.2`

---

## מה RTK עושה

ארבע אסטרטגיות אופטימיזציה:
1. **Smart Filtering** — מסיר רעש וboilerplate
2. **Grouping** — מאגד פריטים דומים (קבצים לפי ספרייה, errors לפי סוג)
3. **Truncation** — שומר קונטקסט רלוונטי, גוזר חזרות
4. **Deduplication** — קורס שורות חוזרות עם מונה

**פקודות נתמכות (100+):** `git`, `find`, `grep`, `ls`, `cat`, `diff`, build tools
(cargo, tsc, eslint, ruff), test runners (pytest, jest, go test), containers
(docker ps, kubectl).

---

## מה RTK לא מכסה

Claude Code built-in tools — **Read**, **Grep**, **Glob** — לא עוברים דרך Bash
ולכן אינם מסוננים. RTK פועל רק על Bash tool calls.

---

## התקנה בקצרה

```bash
# macOS
brew install rtk
# Linux / WSL / כל מקום עם cargo
cargo install --git https://github.com/rtk-ai/rtk
# רישום hook גלובלי (חד-פעמי)
rtk init -g
```

לפרטים מלאים: [`activation.md`](./activation.md).
