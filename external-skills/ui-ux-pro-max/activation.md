# UI UX Pro Max — Activation

## Prerequisites

- Claude Code CLI מותקן ופעיל.
- אין API keys, secrets, או שירותים חיצוניים.

---

## Install

### שיטה A — Plugin marketplace (מומלץ)

בתוך Claude Code session:
```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

### שיטה B — npm CLI

```bash
npm install -g uipro-cli
uipro init --ai claude
```

---

## Verify Presence

```
/plugin list
```

הפלט אמור לכלול `ui-ux-pro-max`.

**בדיקה פונקציונלית:** שאל "Design a landing page for a SaaS product."
הסקיל אמור להתפעל אוטומטית ולבחור design system לפי הפרויקט.

---

## Migration מ-frontend-design

1. התקן ui-ux-pro-max (שיטות למעלה).
2. הסר frontend-design אם מותקן:
   ```
   /plugin uninstall example-skills@anthropic-agent-skills
   ```
   (מסיר את כל חבילת example-skills)
3. אמת שui-ux-pro-max מופיע ב-`/plugin list`.

---

## Disable / Uninstall

```
/plugin uninstall ui-ux-pro-max@ui-ux-pro-max-skill
```
