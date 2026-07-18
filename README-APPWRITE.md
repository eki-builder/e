# Eki — Appwrite Setup Guide

This mirrors the pattern from your `ng-main` project (Account for auth, Databases
for data, one client-side `config.js`). Create these in your Appwrite console,
then paste the IDs into `js/config.js`.

## 1. Project & Auth

1. Create a new Appwrite project. Copy the **Project ID** and your region's
   **API endpoint** into `js/config.js` (`APPWRITE_PROJECT`, `APPWRITE_ENDPOINT`).
2. In **Auth → Settings**, enable the **Email/Password** method.
3. In **Auth → Settings → Security**, add your site's URL (and `localhost` while
   testing) to the allowed redirect origins so `createVerification` /
   `createRecovery` links work.

## 2. The `admins` Team

Create this before the database collections below, since several of their
permissions reference it.

1. In the Appwrite console, go to **Auth → Teams → Create team**.
2. Name and ID it `admins` (the ID must match `ADMIN_TEAM_ID` in
   `js/config.js` — change one or the other if you'd rather use a different ID).
3. Add yourself (and anyone else who should manage the catalog or generate
   PINs) as a member. Membership is what `admin.html` checks client-side,
   and — more importantly — what Appwrite itself checks on every
   `platform_config` / `subscription_pins` write below.

## 3. Database

Create one Database, copy its ID into `DB_ID` in `js/config.js`. Then create
these collections (use the exact IDs below, or update the constants in
`config.js` to match what you choose):

### `profiles` (Document ID = user's `$id`)
| Attribute     | Type    | Notes                  |
|---------------|---------|------------------------|
| userId        | string  | required               |
| displayName   | string  |                        |
| email         | string  |                        |
| theme         | string  | default `"light"`      |

Permissions: user can read/update **their own document only**
(Document security, or a rule matching `userId == $user.$id`).

### `projects` (one document per generated website)
| Attribute               | Type    | Notes                              |
|--------------------------|---------|-------------------------------------|
| userId                  | string  | required, indexed                  |
| businessName            | string  |                                     |
| category                | string  |                                     |
| subcategory             | string  |                                     |
| features                | string  | JSON array, e.g. `["about","faq"]` |
| theme                   | string  | theme key, e.g. `"indigo"`         |
| themeName               | string  | e.g. `"Modern Indigo"`             |
| pages                   | string  | JSON array of page names           |
| siteStructure           | string  | `single` \| `multi` — chosen in the wizard's Sections step |
| sectionLayouts          | string  | JSON object, e.g. `{"gallery":"carousel","faq":"accordion"}` — set when a recommendation is picked |
| components              | string  | JSON array of component ids, e.g. `["sticky_nav","gallery_lightbox"]` |
| publishedUrl            | string  | nullable — set by `site_export` after a successful publish |
| repoUrl                 | string  | nullable — the GitHub repo `site_export` created |

Permissions: owner-only read/write via `userId` (Document security). Note
there's no subscription data here on purpose — see `subscriptions` below.
`publishedUrl`/`repoUrl` are technically owner-writable too (same as every
other field here) — that's fine, since a fake link can't grant anyone
anything; `site_export` is what actually creates the repo.

### `website_content` (Document ID = matching `projects.$id`)
| Attribute | Type | Notes |
|-----------|------|-------|
| projectId | string | matches the project document ID |
| data      | string (large) | the full content form as JSON |

Permissions: owner-only, same as above.

### `subscriptions` (Document ID = matching `projects.$id`)
| Attribute    | Type     | Notes                             |
|--------------|----------|-------------------------------------|
| projectId    | string   | matches the project document ID   |
| userId       | string   | owner, indexed                    |
| status       | string   | `trial` \| `active` \| `expired`  |
| plan         | string   | nullable, e.g. `"30 days"`        |
| trialEndsAt  | datetime | nullable                          |
| expiresAt    | datetime | nullable — set when `status: active` |

**Permissions: owner can READ their own document only. No one gets CREATE
or UPDATE permission here — not even the owner, not even `team:admins`.**
Appwrite has no field-level permissions, only document-level ones, so if
the client had write access to this collection at all, a user could set
`status: "active"` on their own document directly via
`databases.updateDocument()` and skip payment entirely. Every write to this
collection happens through the `subscription_manager` Function below,
using its dynamic API key, which bypasses document permissions by design.

### `subscription_pins`
| Attribute        | Type     | Notes                          |
|-------------------|----------|----------------------------------|
| code             | string   | e.g. `EKI-9A82-HG63`, unique   |
| plan             | string   | e.g. `"30 days"`                |
| durationDays     | integer  |                                  |
| status           | string   | `unused` \| `used` \| `disabled` |
| activatedAt      | datetime | nullable                        |
| usedByProjectId  | string   | nullable                        |
| usedByUserId     | string   | nullable                        |

**Permissions: `team:admins` gets Create + Read + Update. No other role
gets anything.** Regular users never touch this collection — PIN lookup
and burning happen inside `subscription_manager` via its dynamic API key,
which bypasses these permissions entirely, same as before. The
`team:admins` grant is new: it's what lets `admin.html` generate PINs in
bulk and list/disable them directly through the Databases API, without
needing a dedicated Function for something Appwrite's own team-role
permissions already handle safely.

### `platform_config` (Document ID = `"catalog"`, single document)
| Attribute | Type | Notes |
|-----------|------|-------|
| data      | string (large) | the whole catalog as JSON — see `js/catalog.js`'s `SEED_CATALOG` for the shape |

This one document holds four things, all editable from `admin.html`:
`generalFeatures` (sections offered for every category), `categories`
(subcategories, category-specific sections, and each category's 3 theme
options), `sectionLayouts` (layout variants per section — e.g. Gallery as
Grid or Carousel — which is what makes the wizard's 3 recommendations
structurally different, not just differently colored), and `components`
(reusable toggles like a sticky nav or gallery lightbox).

Permissions: **Read** for `any` (or `users`, if you'd rather require login
just to load the wizard) — the create-website wizard needs this before a
user has done anything else. **Create + Update** for `team:admins` only.
Document Security **off** (collection-level permissions are enough here;
there's only ever one document).

If this document doesn't exist yet, the app isn't broken — `js/catalog.js`
ships the same data as a hardcoded `SEED_CATALOG` fallback, and admin.html
loads that same fallback as its starting point the first time you open the
Catalog tab. Hitting **Save catalog** there creates the real document.

## 4. The `subscription_manager` Function

This is what actually enforces the `subscriptions` rule above. It lives in
`functions/subscription-manager/` in this project and handles two actions,
both called from the client via `functions.createExecution()`:

- `ensure_trial` — creates the trial `subscriptions` doc for a new project,
  the first (and only) time it's called for that project. Anchored to the
  project's own `$createdAt`, so calling it again later can't extend a trial.
- `activate_pin` — validates a PIN code, checks it's unused, checks the
  caller owns the project, marks the PIN used, and activates the
  subscription.

### Deploy it

1. In the Appwrite console, go to **Functions → Create function**.
2. Runtime: **Node.js** (18.0 or newer). Entrypoint: `src/main.js`.
3. Either connect this as a Git repo and point it at the
   `functions/subscription-manager` folder, or zip that folder's contents
   (not the folder itself) and upload manually — `src/main.js` and
   `package.json` should be at the root of the archive.
4. Set the **Function ID** to `subscription_manager` (matches
   `FUNC_SUBSCRIPTION_MANAGER` in `js/config.js`).
5. **Execute access**: add the `users` role only — not `any`.
6. **Scopes**: enable `databases.read` and `databases.write`.
7. **Variables**: add `EKI_DB_ID`, same value as `DB_ID` in `js/config.js`.
8. Deploy, then activate the deployment.

### Test it

From the dashboard, create a website (this calls `ensure_trial`) and confirm
a `subscriptions` document appears with `status: "trial"`. Then try
activating a PIN you've generated from `admin.html` — confirm the PIN's
`status` flips to `used` and the `subscriptions` doc flips to `active`.

## 5. The `site_export` Function (static export + GitHub push)

Lives in `functions/site-export/`. Takes `{ projectId }`, checks the caller
owns the project and has an active trial/subscription, renders the
project's content into a static site — one `index.html` if the project's
site structure is Single page, or `index.html` plus `about.html` /
`gallery.html` / `pricing.html` / `blog.html` / `downloads.html` / `faq.html`
/ `contact.html` (whichever sections apply) if it's Multiple pages — and
pushes it to a dedicated GitHub repo with GitHub Pages enabled, so
publishing gives back a live URL immediately. Section layouts (e.g.
Gallery as Grid vs Carousel, FAQ as a list vs an accordion) and components
(sticky nav, gallery lightbox) carry over from whatever the wizard's
recommendation step picked — this rendering logic is ported from
`js/preview.js`, kept in sync by hand.

**Scope of this version** — worth knowing going in:
- Images, gallery photos, and downloadable files are **linked back to
  Appwrite Storage**, not copied into the GitHub repo. The exported HTML
  still displays them fine as long as the `uploads` bucket allows public
  read — it just means the site isn't fully self-contained in the repo.
  Mirroring binary assets into GitHub (base64-encoding every file through
  the Contents API) is the natural next step if you want that.
- Only a handful of sections have more than one layout variant out of the
  box (Gallery, FAQ, Testimonials) — everything else always renders the
  same way regardless of which recommendation was picked. Add more
  variants from admin.html's Layouts tab, but note that a new variant
  needs matching CSS (and, for anything interactive, matching markup) added
  to `css/preview.css` / `functions/site-export/src/style.css` and the
  relevant `*Block()` function in both `js/preview.js` and
  `functions/site-export/src/main.js` before it actually renders
  differently — adding it to the catalog alone changes what's *offered*,
  not what's *drawn*.
- One GitHub repo per project, named from a slug of the business name plus
  part of the project ID, created under whichever account/org
  `GITHUB_OWNER` points to.

### Deploy it

1. Generate a GitHub **personal access token** (classic, `repo` scope, or
   a fine-grained token with Contents + Pages + Administration read/write
   on repos it can create) for the account/org that should own these repos.
2. **Functions → Create function**. Runtime: **Node.js 18+**. Entrypoint:
   `src/main.js`. Deploy from `functions/site-export/` the same way as
   `subscription_manager` above (Git connection, or zip the folder's
   *contents*).
3. Set the **Function ID** to `site_export` (matches `FUNC_SITE_EXPORT` in
   `js/config.js`).
4. **Execute access**: `users` only.
5. **Scopes**: `databases.read` and `databases.write` (needed to read the
   project/content/subscription docs and write back `publishedUrl`).
6. **Variables**:
   - `EKI_DB_ID` — same value as `DB_ID`.
   - `GITHUB_TOKEN` — the token from step 1.
   - `GITHUB_OWNER` — the GitHub username or org repos should be created under.
7. Deploy, then activate the deployment.

### Test it

From the dashboard, a project with an active trial or subscription shows a
**Publish to GitHub** button. Click it, confirm a new repo appears under
`GITHUB_OWNER`, and that `https://{GITHUB_OWNER}.github.io/{repo}/` loads
the site within a minute or two (GitHub Pages' first build always takes a
little while — if it 404s immediately, give it a moment and retry).

## 6. Storage

Create a bucket named `uploads` (or update `BUCKET_UPLOADS` in `config.js`).
Set file size limits and allowed extensions (images, PDFs) as needed.
Permissions: authenticated users can create files; **read should be
public** (`any`) so both `preview.html` and any published GitHub Pages
site can load images without an Appwrite session.

## 7. What's built vs. what's next

This stage delivers: the landing page, full auth flow, a dashboard with
trial/subscription status and PIN activation, the 6-step creation wizard
(now backed by a live, admin-editable catalog, with a recommendation
engine that varies section **layouts** and **components** per option, not
just color, and a Single page / Multiple pages choice), `preview.html` as
a live in-browser render of all of that, an **admin panel** (`admin.html`,
gated by the `admins` Team) with tabs for Catalog, Layouts, Components, and
Subscription PINs, and a **`site_export` Function** that publishes a
project — as one page or several, matching what the wizard produced — to
its own GitHub repo with Pages enabled.

Still ahead:
- **Payments** — PINs are still activated by code only; hooking up a real
  Nigerian payment processor (Paystack/Flutterwave) to auto-generate PINs
  — likely as another Function triggered by the processor's webhook — is
  the natural next step.
- **Asset mirroring** — copying images/downloads into the GitHub repo
  itself instead of linking back to Appwrite Storage, per the scope note
  in Section 5.
- **More layout variants** — only Gallery, FAQ, and Testimonials have more
  than one look today; extending Hero, Team, Pricing, etc. means adding
  both the catalog entries (admin.html) and the matching render code (see
  the note in Section 5) for each new variant.
