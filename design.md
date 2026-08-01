# Design - Yanshi

A locked design system for the desktop study timer. Every app view reads from
this system. Extend it when the product grows; do not create per-view themes.

## Genre

Modern-minimal productivity software: calm, practical, and content-dense.

## Macrostructure Family

- App views: Workbench with a persistent left rail, compact page header, and one
  primary work surface per view.
- Timer view: asymmetric two-column workbench. The timer is primary; today's
  context is a denser secondary rail.
- Data views: stacked analytical sections with hairline separation rather than
  nested cards.

## Theme

- Canvas: warm neutral paper.
- Surfaces: lightly tinted white, never pure white.
- Ink: green-tinted charcoal.
- Brand accent: coral, limited to primary actions and current navigation.
- Functional accent: deep green for completion, progress, and saved state.
- Subject colours: coral, green, amber, and blue; always paired with labels.

The canonical values live in `tokens.css` and must be consumed through named
custom properties.

## Typography

- Wordmark: Song-style display serif, weight 700, used only for the brand.
- Interface: Microsoft YaHei UI / Noto Sans SC, weight 400-700.
- Timer and data: Cascadia Mono fallback stack with tabular numerals.
- Letter spacing: 0 throughout.
- Headings stay compact and upright; no motivational display copy.

## Spacing

Four-point rhythm with named tokens. Dense controls use 8-16 px gaps; page
sections use 20-32 px. Raw spacing values are not introduced in view styles.

## Motion

- Motion stance: motion-cut.
- Button press: 100-150 ms transform feedback.
- Dropdown: 180 ms opacity and scale from its trigger.
- Modal: 220 ms opacity and 6 px vertical entrance.
- Saved status: short opacity entrance.
- No chart drawing, page transition, continuous pulse, or list stagger.
- Reduced motion collapses spatial motion to a short opacity change.

## Microinteractions

- Silent success when the result is already visible.
- Task deletion is immediate with an Undo action.
- Menus close on outside click and Escape.
- Dialogs close on backdrop, close button, and Escape.
- Every interactive element has visible hover, active, focus, and disabled states.

## CTA Voice

- Primary: coral fill, 6 px radius, direct verb labels.
- Secondary: neutral outline or dark ink fill for explicit commands.
- Icon-only tools use Lucide icons with accessible names and native tooltips.

## Per-View Allowances

- App views do not use decorative enrichment by default. The timer dashboard may
  use one functional companion mascot inside the Today Status panel. Its
  expression and copy must reflect real study, task, overload, or recovery
  events; it is not repeated elsewhere as decoration.
- The immersive timer may use the existing study-desk photograph as a full-bleed
  background because it represents the focus state directly.

## Shared Rules

- Sidebar, top bar, accent placement, control height, type system, and state
  behaviour remain consistent across all views.
- Card radius never exceeds 8 px.
- No card-in-card layouts, gradients, glass panels, invented metrics, emojis, or
  generic encouragement slogans in the main application chrome. Companion copy
  must describe the user's current, locally derived state.
