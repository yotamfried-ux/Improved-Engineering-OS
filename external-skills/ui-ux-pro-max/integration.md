# UI UX Pro Max — Integration Contract

## תפקיד פונקציונלי

מחליף את Claude כ-**Design Lead** לכל עבודת UI/UX. מאכף גישה מרובת-שלבים:
ניתוח פרויקט → בחירת design system → יישום → validation.

---

## מתי מופעל

**אוטומטי** — הסקיל מזהה context UI/UX בלי slash command:
- בקשות ל"landing page", "dashboard", "form", "component", "UI", "UX"
- כל שאלה על עיצוב ממשק

---

## תהליך פעולה (כפי שתועד מהריפו)

```
1. ניתוח הפרויקט — סוג, קהל יעד, industry
2. בחירת design system — מתוך 67 UI styles + 161 palettes + 57 font pairings
3. בחירת industry rules — מתוך 161 reasoning rules לפי סקטור
4. יישום — תואם ל-15 tech stacks
5. Pre-delivery checklist — accessibility, responsiveness, anti-patterns
```

---

## מתי לא

- Backend טהור / CLI / library ללא UI — לא רלוונטי.
- API design בלבד — לא רלוונטי.

---

## composition (לפי skill-orchestration-policy.md)

```
planning (superpowers)
  ↓
coding: UI/UX Pro Max ← כאן (אחרי planning, לפני security/review)
  ↓
SECURITY GATE
  ↓
review
```

UI UX Pro Max הוא סקיל `coding`+`ui-ux` — מחליף/משלים את שלב המימוש לעבודת UI.

---

## הבדל מ-frontend-design

| | frontend-design | ui-ux-pro-max |
|---|---|---|
| מקור | anthropics/skills | nextlevelbuilder |
| styles | בסיסי | 67 styles |
| palettes | מוגבל | 161 palettes |
| industry rules | אין | 161 rules |
| delivery checklist | אין | כן |
| tech stacks | מוגבל | 15 stacks |
| הפעלה | אוטומטי | אוטומטי |
