# frontend-design — Integration

## Functional Role

`frontend-design` shifts Claude from "implement this layout" to "act as design lead." It injects a structured, opinionated design process before any code is written, ensuring visual choices are deliberate rather than default.

## When to Use

- Building a new user-facing UI from scratch (web app, landing page, dashboard, component library).
- Reshaping or redesigning an existing UI where the current look feels generic or templated.
- Any task where aesthetic direction, typography, and token decisions need to be explicit rather than assumed.

## When NOT to Use

- Backend or logic-only tasks (API endpoints, database queries, business rules) — the skill adds overhead with no benefit.
- The brief already pins an exact visual direction with specific colors, typefaces, and layout. In that case the brief's explicit choices take precedence and the multi-pass process would contradict the spec.
- Throwaway internal tooling (admin scripts, internal dashboards used only by engineers) where visual polish is out of scope.
- Non-UI tasks of any kind.

## How it Affects Claude's Workflow

The skill enforces a **multi-pass design process**:

1. **Ground the brief** — identify the concrete subject matter and purpose before touching design decisions.
2. **Brainstorm a compact token system** — produce a named set of:
   - 4–6 named hex colors with semantic roles
   - 2 or more typefaces with usage rationale
   - A layout concept described with ASCII wireframes
   - One "signature" element that makes the design distinctive
3. **Self-critique against generic defaults** — the skill explicitly warns against three over-used "AI-generated" looks:
   - Cream background + serif heading + terracotta accent
   - Near-black background + acid-green/neon accent
   - Broadsheet hairline grid with neutral grays
4. **Build code derived from the plan** — implementation references the token system established in step 2; no unexplained magic values.
5. **Quality floor** — output must be responsive, keyboard-navigable (focus states), and respect `prefers-reduced-motion`.

## Concrete Artifacts

- **Skill invoked:** `frontend-design` (name as registered in the marketplace).
- **Trigger:** Automatic on description match when the skill is installed. No slash command needed; mentioning UI design work is sufficient.

## Composition

- **Phase:** Coding phase, after planning and spec are complete.
- **Pairs with:** [`patterns/ui/`](../../patterns/ui/) in this repo — design tokens, atomic design structure, accessibility patterns, data tables, and theming all align with and extend what `frontend-design` produces.
- **Does not replace:** Security review before production UI goes live. The skill focuses on aesthetics and component structure, not on XSS sanitization, CSP headers, or auth-gated rendering.
