# UI UX Pro Max — Policy

## Classification

```yaml
type:
  - ui-ux
  - coding
execution_level: LEVEL_2   # mandatory for UI projects; LEVEL_1 otherwise
default_profile: conditional  # only for projects with UI surface
```

## נימוק

UI UX Pro Max הוא **חלופה מובהקת** ל-frontend-design. כשמותקן בפרויקט UI,
הוא LEVEL 2 — חובה. בפרויקט ללא UI (backend, CLI, library) — לא רלוונטי.

## Composition

```
context-optimization (graphify, RTK)
  ↓
memory (claude-mem)
  ↓
planning (superpowers)
  ↓
coding: ui-ux-pro-max ← L2 כשיש UI
  ↓
SECURITY GATE
  ↓
review
```

## Override Rule

אינו יכול לעקוף security gate. עיצוב שמשפיע על auth/data exposure חייב לעבור
דרך security-review.

## הערת migration

`frontend-design` deprecated — אין להשתמש בו לפרויקטים חדשים.
פרויקטים קיימים שמשתמשים ב-frontend-design: נדרש upgrade.
