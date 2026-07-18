# Eki

A website generation platform for African businesses — describe your
business, tick the sections you need, pick from three recommended designs,
fill in your content, and launch.

## What's in this build

- `index.html` — landing page
- `signup.html`, `login.html`, `verify.html`, `verify-info.html`,
  `reset-password.html` — full Appwrite auth flow
- `dashboard.html` — lists your websites, trial/subscription status, PIN
  activation
- `create.html` — the 6-step creation wizard (category → subcategory →
  sections + single/multi-page choice → recommendation → content →
  launch). Recommendations vary section layouts and components, not just
  color.
- `preview.html` — renders the generated website live, honoring whichever
  theme, layouts, components, and page structure were chosen
- `admin.html` — gated to the `admins` Team, with tabs for the Catalog
  (categories/sections/themes), Layouts (variants per section), Components
  (reusable toggles), and bulk Subscription PIN management
- `functions/subscription-manager/` — Appwrite Function that owns every
  trial/PIN write; the client only ever reads subscription status
- `functions/site-export/` — Appwrite Function that renders a project into
  a static site (one page, or several, matching its site structure) and
  publishes it to a GitHub repo with Pages enabled

## Before it runs

Open `js/config.js` and fill in your own Appwrite project ID, endpoint, and
database ID. Then follow **README-APPWRITE.md** to create the required
collections, the `admins` Team, both Functions, and the storage bucket —
nothing will save until those exist.

## Design

Brand: **Eki**, the Edo (Benin) word for market — and home ground of the
coral bead, the strand worn by Benin royalty where every bead is hand-strung
and no two strands ever come out the same. Type: Space Grotesk (display) +
Inter (body) + IBM Plex Mono (labels/steps). Color: coral red (the bead)
with a brass/bronze accent on an ivory background. The dot texture in the
hero echoes a strung bead strand, and the same mini "site preview" card
component appears on the landing page, in the wizard's recommendation step,
and implicitly in the live preview — one visual thread through the whole
product.
