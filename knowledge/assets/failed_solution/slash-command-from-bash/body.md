# ניסיון: קריאה ל-/plugin install מ-bash

## מה ניסיתי

```bash
# ניסיון 1 — עם slash
claude /plugin install superpowers@claude-plugins-official

# ניסיון 2 — ללא slash אבל עם marketplace לא-נכון
claude plugin install superpowers@claude-plugins-official
```

## למה לא עבד (ראיה)

- `claude /plugin install` — הפקודה לא קיימת ב-CLI של claude; `/plugin` הוא slash command
  שרץ **בתוך** ממשק Claude Code, לא פקודת מעטפת.
- `claude plugin install superpowers@claude-plugins-official` — שגיאה: `claude-plugins-official`
  אינו marketplace מוכר; superpowers לא מופץ דרך ה-official marketplace.

## מה לבדוק במקום

ראה `lessons-learned/bugs/claude-plugin-programmatic-install.md` — הפתרון הנכון:
```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace
```

**כלל:** לפני כתיבת install command לפלאגין — מצא את ה-marketplace repo שלו ובדוק
את שם ה-marketplace. אל תנחש את שם ה-marketplace.
