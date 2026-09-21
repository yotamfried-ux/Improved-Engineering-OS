# nvidia-nemotron — External System Reference (Engine)

> תיעוד ספק/מנוע. נטען לפי הצורך, לא אוטומטית.
> Nemotron הוא **engine / LLM backend**, לא skill — ראה הבחנה ב-
> [`../README.md`](../README.md).
> נוהל האינטגרציה והתזמור: [`./orchestration.md`](./orchestration.md) ·
> התקנה ואימות: [`./activation.md`](./activation.md)

---

## סקירה

Nvidia Nemotron הם מודלי LLM חינמיים (free tier) עם endpoint OpenAI-compatible.
חזקים במיוחד ב-coding, reasoning, ו-instruction following.

| מאפיין | ערך |
|---|---|
| Endpoint | `https://integrate.api.nvidia.com/v1` |
| Auth | Bearer token (`Nemotron_api_key`) |
| API format | OpenAI-compatible (chat completions) |
| SDK | `openai` Python/JS (עם `base_url` override) |
| Free tier | כן — rate limits מוגבלים (ראה docs) |
| Registration | [build.nvidia.com](https://build.nvidia.com) |

---

## מודלים

| Model ID | גודל | חזק ב | אידיאלי ל |
|---|---|---|---|
| `nvidia/nemotron-ultra-253b-v1` | 253B | coding, reasoning, instruction | generation, review, brainstorm |
| `nvidia/nemotron-super-49b-v1` | 49B | speed, summarization, explanation | summarize, explain |
| `nvidia/nemotron-mini-4b-instruct` | 4B | very fast | classification, routing (לא בשימוש כאן) |

---

## שימוש (Python)

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["Nemotron_api_key"],
)

response = client.chat.completions.create(
    model="nvidia/nemotron-ultra-253b-v1",
    messages=[
        {"role": "system", "content": "You are an expert software engineer."},
        {"role": "user", "content": "Generate a Python function to validate email addresses."},
    ],
    max_tokens=1024,
    temperature=0.2,
)
print(response.choices[0].message.content)
```

---

## יכולות

| יכולת | נתמך |
|---|---|
| Chat completions | ✅ |
| Streaming | ✅ (`stream=True`) |
| Tool calling (function calling) | ✅ Ultra בלבד |
| JSON mode | ✅ |
| System messages | ✅ |
| Max context (Ultra) | 128K tokens |
| Max context (Super) | 32K tokens |
| Vision/multimodal | ❌ |
| Embeddings | ❌ (דרך endpoint זה) |

---

## Rate Limits (Free Tier)

Rate limits משתנים — בדוק תמיד ב-[build.nvidia.com/docs](https://build.nvidia.com/docs).
ב-2024: ~50 requests/minute, ~10K tokens/request לUltra.

**Error handling:** שגיאות `429 Too Many Requests` מוחזרות עם `[Nemotron unavailable]` prefix.
קלוד ממשיך לבצע בעצמו.

---

## אינטגרציה ב-Engineering OS

- **MCP Server:** `scripts/nemotron-mcp-server.py` (uv inline deps)
- **Session Setup:** `scripts/session-setup.sh` — מגדיר `OPENAI_API_KEY` + `OPENAI_BASE_URL`
- **graphify:** משתמש ב-`OPENAI_API_KEY` לחילוץ non-code content (אפס שינוי קוד)
- **Runtime adapters:** `.claude/agents/nemotron-coder.md`, `.claude/agents/nemotron-code-reviewer.md`
- **Orchestration / policy:** [`./orchestration.md`](./orchestration.md)
- **Activation / verify:** [`./activation.md`](./activation.md)

---

## קישורים

- API Console: [build.nvidia.com](https://build.nvidia.com)
- Model catalog: [build.nvidia.com/explore/reasoning](https://build.nvidia.com/explore/reasoning)
- Nemotron paper: [arxiv.org/abs/2402.16819](https://arxiv.org/abs/2402.16819)
