# RTK — Policy

## Classification

```yaml
type:
  - context-optimization
execution_level: LEVEL_2   # mandatory — default on every project
default_profile: default   # installed in every standard project
```

## נימוק LEVEL 2

RTK חוסך 60–90% טוקנים על פלטי Bash. אין עלות לשימוש בו (רץ שקוף).
העלות של **אי-שימוש** — עלות טוקנים גבוהה בלי ערך מוסף.
לכן: mandatory ב-**כל פרויקט**, ללא יוצא מן הכלל.

## Composition (מיקום ב-pipeline)

```
context-optimization layer (graphify + RTK)  ← RTK כאן
  └── graphify: שולף subgraph במקום grep
  └── RTK:     מכווץ פלטי Bash
      ↓
memory layer (claude-mem)
      ↓
planning → coding → SECURITY GATE → review
```

RTK ו-graphify הם **שכבת context-optimization**: רצים מתחת לכל ה-pipeline,
לא בשלב ספציפי אחד.

## Override Rule

RTK הוא utility layer — אינו יכול לעקוף סקילים אחרים ואינו יכול להיעקף.
אם RTK מסנן פלט חיוני: `rtk proxy <cmd>` לעקיפה מבוקרת.

## Hook registration

RTK מתווסף כ-PreToolUse hook ב-`.claude/settings.json` (project level):
```json
{"matcher": "Bash", "hooks": [{"type": "command", "command": "rtk hook claude"}]}
```

`rtk init -g` מוסיף גם ל-~/.claude/settings.json (global, עבור כל פרויקט).
