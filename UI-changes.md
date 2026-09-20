# UI Changes: Fixing the Flat Feel

## Problem

The app functions correctly but reads as visually flat: no hierarchy between elements, no moments that feel satisfying, and screens tend to blend together rather than feel distinct from one another.

## Color palette status — UNDER ACTIVE TEST (supersedes the lock below)

**The "do not touch the palette" constraint in the next section is no longer current.**
It was written when the color scheme was assumed to be a settled decision. It isn't —
the flatness diagnosis led to reconsidering the palette itself, not just typography and
depth. Leave the section below for historical context (it explains why the four
priorities were originally scoped to avoid color), but do not follow its instruction to
avoid new hues. The plan in this section is what's actually current.

### Two candidates, tested one at a time

**Candidate A — Deep indigo and amber** (test this one first):
| Role | Hex |
|---|---|
| Base (app background) | `#0D1321` |
| Surface (card) | `#2B3A67` |
| Surface-raised (inputs, selected states) | `#374876` |
| Border | `#46538C` |
| Text primary | `#E7E9EE` |
| Text secondary / muted | `#4A4E58` |
| Accent | `#F2A65A` |
| On-accent (text/icons on filled accent) | `#0D1321` (base color) |

**Candidate B — Cinematic cool** (test only if A is vetoed, on its own branch — see below):
| Role | Hex |
|---|---|
| Base (app background) | `#101418` |
| Surface (card) | `#33404D` |
| Surface-raised (inputs, selected states) | `#3D4C5B` |
| Border | `#4A5A6B` |
| Text primary | `#E4E4E0` |
| Text secondary / muted | `#8F9AA5` |
| Accent | `#C98A4B` |
| On-accent | `#101418` (base color) |

**The existing success green (for the PR up-arrow) is unchanged by either candidate.**
Neither palette redefines it — leave it as-is unless told otherwise separately.

### Results log

Both documented candidates were built, loaded onto the phone and vetoed. Their
branches are kept for reference; `main` was never touched.

| Candidate | Branch | Outcome |
|---|---|---|
| A — Deep indigo and amber | `experiment/palette-indigo-amber` | **Vetoed** — the hues themselves, not legibility |
| B — Cinematic cool | `experiment/palette-cinematic-cool` | **Vetoed** — hues again, plus the background colours |

What the two vetoes narrowed down, which is more than either candidate on its own
would have told us:

- **Warm metallic accents are out.** Amber and muted copper failed for the same
  reason at different intensities. The direction is a **cool or neutral accent**.
- **Light, colour-saturated card surfaces are out.** Both candidates lifted the card
  well above the base (`#2b3a67`, `#33404d`) and both read wrong. Depth has to come
  from the tonal ladder inside a dark range, not from lifting surfaces into mid-tone.
- **But `main`'s near-black neutral greys are also too flat.** So the answer is not
  simply reverting: the base should stay as dark as `main`'s while picking up a faint
  cool cast, with wider gaps between the three ladder steps.

### Candidate C — Cool steel (current test)

Not from the original pair — written from what A and B ruled out. Dark as `main`,
cool rather than neutral-grey, with a desaturated steel-blue accent.

| Role | Hex |
|---|---|
| Base (app background) | `#0d0f13` |
| Surface (card) | `#171a20` |
| Surface-raised (inputs, selected states) | `#232830` |
| Border | `#313742` |
| Text primary | `#e9ebf0` |
| Text secondary | `#9aa2af` |
| Text muted | `#6f7784` |
| Accent | `#5b8db8` |
| On-accent (text/icons on filled accent) | `#0d0f13` (base color) |

Two deliberate departures from how A and B were specified:

- **Secondary and muted are separate values.** Both candidates collapsed them into
  one, which is what made A unreadable — one value cannot serve a card's "LAST TIME"
  label and a session list's date at the same contrast. They are split here and
  measured separately (6.9:1 and 3.9:1 on surface).
- **The accent still inverts.** White on `#5b8db8` is 3.6:1; the base colour on it is
  5.4:1, so the hero card and primary buttons take dark ink, the same shape as A and
  B. That is a property of any accent light enough to read on a dark card, not a
  quirk of the warm ones.

If C is accepted, **CLAUDE.md's "Accent is a deep, desaturated blue (`#185FA5`-ish)"
line needs updating** — `#5b8db8` is the same family but lighter and quieter.

### Prerequisite: centralize before testing

Before applying either candidate, confirm every color reference in the codebase reads
from a single theme/tokens file (e.g. `theme.ts` or `constants/colors.ts`) rather than
literal hex strings scattered across components. If colors are already centralized,
skip this. If they aren't, **centralize first, commit that alone**, and only then start
the palette test — this is what makes the rollback below a one-file change instead of a
sprawling diff. This is worth doing regardless of how the test turns out.

### Test procedure (branch-based, so main is never at risk)

1. Confirm the current locked palette is committed and pushed on `main` as a clean
   baseline before starting.
2. Create a new branch for the test: `git checkout -b experiment/palette-indigo-amber`.
3. On that branch, update **only the centralized theme file** to Candidate A's values.
   Do not touch component files directly — if a component needs a hardcoded hex
   changed, that's a sign the centralization step above wasn't finished; fix that
   instead of patching around it.
4. Run the app on-device (not just the simulator/Expo Go on a laptop screen — dark
   palettes read very differently under gym lighting than on a laptop at a desk).
5. Decide:
   - **Accepted** → merge `experiment/palette-indigo-amber` into `main` normally.
   - **Vetoed** → `git checkout main`. Nothing on `main` was touched, so there is no
     cleanup — just leave the branch (or delete it: `git branch -D
     experiment/palette-indigo-amber`).
6. If A is vetoed and Candidate B is worth trying, cut its branch **from `main`**, not
   from the A branch — `git checkout main` first, then `git checkout -b
   experiment/palette-cinematic-cool`. Keeping the two tests independent means a
   half-applied A never leaks into the B test.

Do not make this decision by staring at code diffs or a laptop screenshot. Load the
branch onto the actual phone and look at it at the gym, under real lighting, mid-workout
if possible — that's the whole reason this is a branch-based test rather than a
straight edit.

---

## Constraint — do not touch (SUPERSEDED — see above)

~~The current color palette (deep desaturated blue accent, dark grey/black base, subtle
green for beating a previous best) is a locked decision and is **not** the source of the
flatness. Do not introduce new hues to solve this. The fixes below are about typography,
depth, and motion within the existing palette.~~

This was the original framing. Kept for context only — the section above is current.

## Priority order

### 1. Give numeric data its own type scale

The weight/rep numbers are the core payoff of using this app — they're what the user actually came to see. Right now they likely share visual weight with labels and UI chrome, so nothing pops.

- Introduce a distinct type scale for numeric data (weight, reps, RIR): larger size, heavier weight than surrounding text.
- Use tabular/monospaced numerals so columns of numbers align cleanly across sets.
- Labels, section headers, and secondary text should shrink and/or lighten in contrast, so the eye lands on the numbers first.
- This touches every screen with logging data on it — highest leverage change, do it first.

### 2. Build a tonal depth ladder

If background, card surfaces, and active states are all rendered at the same or very similar tone, the screen reads as one flat plane regardless of layout.

- Define a 3-step tonal ladder within the current base (whichever palette is active): app background (darkest) → card surface (one step lighter) → active/focused state (one step lighter again).
- Whichever palette wins the test above already defines a base/surface/surface-raised progression — reuse that as the ladder rather than inventing a separate one.

### 3. Make the PR moment the app's one animated beat

Currently a static green up-arrow marks a lift beating its previous best. This is the app's most emotionally significant moment and currently has no weight behind it.

- Add a brief scale-up or glow animation on the number itself when a set beats the previous best, paired with a light haptic (Expo Haptics).
- This should be the only deliberate motion moment in the app. Every other transition should stay instant and quiet so this one reads as earned rather than one animation among many.

### 4. Audit for uniform visual weight

- Review card, button, and row styles across all screens for identical border-radius, shadow, and sizing regardless of what they represent.
- Differentiate styling only where it maps to something real — e.g. today's exercise card vs. a completed one — not decoratively.

## Out of scope for this pass

- New screens or features — this is a visual-language pass on existing screens only

~~Any change to the core color palette~~ — **superseded, see "Color palette status" above.**
