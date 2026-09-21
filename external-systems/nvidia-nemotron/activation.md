# nvidia-nemotron — activation.md

> התקנה, אימות, ומחיקה של מנוע Nemotron (MCP server + env). Nemotron הוא engine,
> לא skill — אך נרשם כשרת MCP מקומי שקלוד יכול לאצול אליו.

---

## דרישות מוקדמות

- `uv` מותקן (בדוק: `uv --version`) — נדרש להרצת ה-MCP server
- `Nemotron_api_key` מוגדר כ-Claude Code secret (Settings → Secrets → `Nemotron_api_key`)
- `session-setup.sh` מריץ בכל SessionStart (מוגדר ב-`.claude/settings.json`)

---

## רישום (חד-פעמי)

ה-`.mcp.json` בשורש הפרויקט רושם את השרת אוטומטית. אם לא קיים:

```bash
# אפשרות 1: project-scoped (מומלץ — משותף לצוות דרך git)
claude mcp add --scope project nemotron -- uv run scripts/nemotron-mcp-server.py

# אפשרות 2: ידני — צור .mcp.json בשורש הפרויקט:
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "nemotron": {
      "command": "uv",
      "args": ["run", "scripts/nemotron-mcp-server.py"]
    }
  }
}
EOF
```

---

## הגדרת ה-API Key

הסיקרט `Nemotron_api_key` צריך להיות מוגדר ב-Claude Code:
- Web: claude.ai → Code → ⚙ Default Cloud Environment → Environment variables → Add: `Nemotron_api_key=nvapi-...`
  (⚠️ זה **לא** GitHub Settings → Secrets — אין סעיף Secrets נפרד בממשק; משתמשים ב-Environment variables)
- CLI: `claude config set secrets.Nemotron_api_key <your-key>`

המפתח זמין ב: [build.nvidia.com](https://build.nvidia.com) (free tier).

**לא לשים את המפתח ב-`.env` הפרויקט** — הוא secret אישי, לא משותף.

---

## אימות

```bash
# 1. בדוק שהסיקרט זמין בסביבה
echo "Key set: ${Nemotron_api_key:+yes}${Nemotron_api_key:-NO}"

# 2. בדוק שה-server עולה
uv run scripts/nemotron-mcp-server.py --help 2>&1 | head -3

# 3. בסשן Claude Code — הרץ /mcp
# צפוי: nemotron server עם 5 כלים

# 4. בדיקה פונקציונלית מהירה
python3 -c "
from openai import OpenAI; import os
c = OpenAI(base_url='https://integrate.api.nvidia.com/v1', api_key=os.environ['Nemotron_api_key'])
r = c.chat.completions.create(model='nvidia/nemotron-super-49b-v1',
    messages=[{'role':'user','content':'Reply: OK'}], max_tokens=5)
print('Nemotron OK:', r.choices[0].message.content)
"
```

---

## Detection (לשימוש skill-bootstrap.sh)

המנוע נחשב present אם השרת רשום או שהמפתח קיים — `detect_nemotron()` ב-
`scripts/skill-bootstrap.sh` בודק זאת בזמן ריצה:

```bash
# המנוע נחשב present אם:
# 1. .mcp.json קיים עם nemotron server, OR
# 2. Nemotron_api_key קיים בסביבה (+ קובץ ה-server קיים)
[ -f ".mcp.json" ] && grep -q '"nemotron"' .mcp.json && return 0
[ -n "${Nemotron_api_key:-}" ] && return 0
return 1
```

---

## הסרה

```bash
# הסר את השרת מ-Claude Code
claude mcp remove nemotron --scope project 2>/dev/null || rm -f .mcp.json

# הסר env vars (session-setup.sh)
# מחק את בלוק ה-Nemotron מ-scripts/session-setup.sh

# הסר את ה-runtime adapters
rm -f .claude/agents/nemotron-coder.md .claude/agents/nemotron-code-reviewer.md
```

---

## Secrets & Security

- `Nemotron_api_key` — נקרא מ-environment בלבד. לא נכתב לקבצים, לא ל-git.
- Context שנשלח ל-Nvidia API: קוד ו-specs בלבד. **אל תשלח secrets, credentials, PII.**
- Rate limits של Nvidia free tier: בדוק ב-[build.nvidia.com](https://build.nvidia.com/docs).
