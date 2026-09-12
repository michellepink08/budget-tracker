# Deploy to Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app from local-only SQLite to a deployed Vercel + Postgres (Neon) setup, so the user can use and test it (including the real Gmail password-reset flow) from anywhere.

**Architecture:** Swap the SQLite driver adapter for `@prisma/adapter-neon`, change the Prisma datasource to `postgresql`, retire the SQLite-specific hand-rolled schema-push workaround (no longer needed — schema application moves to Vercel's own unrestricted Linux build step), then hand off the account-creation and secret-entry steps to the user while Claude handles every code and git change.

**Tech Stack:** `@prisma/adapter-neon` (replaces `@prisma/adapter-better-sqlite3`), Vercel (hosting + Postgres storage), GitHub (source hosting for Vercel's git integration).

---

### Task 1: Swap the Prisma driver adapter

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/prisma.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Install the new adapter, remove the old one**

Run:
```bash
npm install @prisma/adapter-neon@7.10.0 ws@8.18.0
npm install --save-dev @types/ws@8.5.13
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3
```

(`ws` is required because `@prisma/adapter-neon` needs a WebSocket implementation, and this app runs on Vercel's Node.js runtime, not the edge runtime — only the edge runtime has a native `WebSocket` global. See `@prisma/adapter-neon`'s own README.)

- [ ] **Step 2: Change the Prisma datasource to Postgres**

In `prisma/schema.prisma`, change:
```prisma
datasource db {
  provider = "sqlite"
}
```
to:
```prisma
datasource db {
  provider = "postgresql"
}
```
Leave `generator client { provider = "prisma-client-js" }` and every model definition unchanged — nothing in this schema uses a SQLite-specific type.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds (this is schema-only — it does not need a reachable database).

- [ ] **Step 4: Swap the adapter in `src/lib/prisma.ts`**

Replace the whole file with:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's driver needs a WebSocket implementation. The edge runtime has a
// native `WebSocket` global; Vercel's Node.js runtime (what this app
// actually runs on) does not, so it's polyfilled with `ws`.
neonConfig.webSocketConstructor = ws;

// Uses Neon's WebSocket-based driver adapter — avoids holding pooled TCP
// connections across Vercel's serverless cold starts, and (like the
// SQLite adapter it replaces) is pure JS, so it never needs the native
// schema-engine/query-engine binaries this machine's Application Control
// policy blocks.
function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Update `next.config.ts`**

Replace:
```typescript
const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; bundling it with webpack breaks its
  // dynamic require of the compiled .node binary. Keep it (and the Prisma
  // packages that load it) external so Node requires it directly instead.
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
  ],
};
```
with:
```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
};
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, all 225 tests — every `src/lib/*.test.ts` test uses a mocked `Pick<PrismaClient, ...>` object and never constructs a real client, so this adapter swap is invisible to them by design.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (0 errors).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma src/lib/prisma.ts next.config.ts
git commit -m "feat: switch Prisma from SQLite to Postgres (Neon adapter)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Update local dev scripts, retire the SQLite-only workaround

**Files:**
- Modify: `scripts/create-demo-user.mjs`
- Modify: `scripts/seed-demo-data.mjs`
- Delete: `scripts/db-push.mjs`
- Delete: `prisma/schema.sql`
- Modify: `package.json`

- [ ] **Step 1: Swap the adapter in `scripts/create-demo-user.mjs`**

Replace:
```javascript
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
```
with:
```javascript
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
```
And replace:
```javascript
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
```
with:
```javascript
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
```

- [ ] **Step 2: Swap the adapter in `scripts/seed-demo-data.mjs`**

Apply the exact same replacements as Step 1 (same import lines, same `neonConfig` setup, same adapter-construction block) to this file.

- [ ] **Step 3: Delete the SQLite-only schema-push workaround**

```bash
git rm scripts/db-push.mjs prisma/schema.sql
```

- [ ] **Step 4: Update the `db:push` script in `package.json`**

Replace:
```json
"db:push": "node scripts/db-push.mjs",
```
with:
```json
"db:push": "prisma db push",
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (0 errors) — these are plain `.mjs` scripts outside the TypeScript project, so this step is really just confirming Step 1–4's edits didn't touch anything type-checked; still worth re-running for safety.

- [ ] **Step 6: Commit**

```bash
git add scripts/create-demo-user.mjs scripts/seed-demo-data.mjs package.json
git commit -m "chore: retire SQLite-only schema-push workaround, update seed scripts for Postgres

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Update `.env.example` and `docs/ARCHITECTURE.md`

**Files:**
- Modify: `.env.example`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update `.env.example`'s `DATABASE_URL` line**

Replace:
```
DATABASE_URL="file:./prisma/dev.db"
```
with:
```
# A Postgres connection string (e.g. from Vercel's Storage tab / Neon) — see docs/ARCHITECTURE.md.
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

- [ ] **Step 2: Rewrite the "Deployment: SQLite → Postgres" section in `docs/ARCHITECTURE.md`**

Replace the entire existing section:
```markdown
## Deployment: SQLite → Postgres

This schema was written from the start to not require a rewrite when moving off SQLite. To switch:

1. Change `prisma/schema.prisma`'s `datasource db` block: `provider = "postgresql"`, and point `DATABASE_URL` at a real Postgres connection string.
2. Swap `@prisma/adapter-better-sqlite3` for a Postgres-compatible driver adapter (or Prisma's default query engine — the schema-engine-binary constraint documented in the README is specific to this one development machine's Application Control policy, not to Postgres or to production deployment generally).
3. Apply the schema against the new database.

`prisma/schema.sql` — the hand-written mirror this project uses locally via `npm run db:push` — is this machine's own workaround for a blocked native binary. It isn't part of what a normal deployment target needs; a real Postgres target can use Prisma's own migration tooling directly.
```

with:
```markdown
## Deployment: Vercel + Postgres (Neon)

The app is deployed on Vercel, backed by a Postgres database provisioned through Vercel's Storage tab (Neon under the hood). `src/lib/prisma.ts` uses `@prisma/adapter-neon` — an HTTP-based driver adapter well suited to serverless cold starts, and (like the SQLite adapter it replaced) pure JS, so it never needs the native schema-engine/query-engine binaries this development machine's Application Control policy blocks.

Schema changes are applied by Vercel's own build step (`prisma db push`, part of the project's configured Build Command), which runs on Vercel's unrestricted Linux build machine — never on this Windows machine. That's also why `prisma/schema.sql` and `scripts/db-push.mjs` (the old hand-rolled SQLite-syntax workaround for the same binary block) were retired: schema application no longer needs to happen locally at all.

**Single shared database:** for now, the same Postgres database serves both production and local development — the same one-environment model this project has always had (previously one local SQLite file), just relocated to the cloud. The practical consequence: a schema change only takes effect once deployed (edit `schema.prisma`, commit, push, let Vercel's build apply it) — local dev then sees the new schema automatically, since it points at the same database. Splitting into separate dev/prod databases later (e.g. via Neon's branching, or Vercel's Development/Preview/Production environment-variable scoping) is a clean future upgrade if stronger isolation is ever needed — not built here.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/ARCHITECTURE.md
git commit -m "docs: document the Vercel + Postgres deployment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Push to GitHub

**Files:** none (git/hosting operation only)

- [ ] **Step 1: User creates the GitHub repository**

Ask the user to create a new **private** empty repository named `budget-tracker` at https://github.com/new (no README, no `.gitignore`, no license — this local repo already has all of that). Ask them to paste back the repo's URL (e.g. `https://github.com/<username>/budget-tracker.git`).

- [ ] **Step 2: Add the remote and push**

```bash
git remote add origin <url-the-user-gave-you>
git push -u origin master
```
Expected: this may open a browser window / credential-manager prompt for the user to complete their own GitHub sign-in — that's expected and the user completes it themselves, not Claude.

---

### Task 5: Configure and deploy on Vercel

**Files:** none (hosted dashboard configuration only)

- [ ] **Step 1: User imports the repo into Vercel**

Ask the user to go to https://vercel.com/new, select the `budget-tracker` GitHub repo, and click Import (don't deploy yet if the dashboard offers a chance to configure settings first — otherwise it's fine to let the first deploy fail and fix settings after).

- [ ] **Step 2: User adds Postgres storage**

In the new Vercel project → Storage tab → Add → Postgres → follow Vercel's prompts to create and connect it. This auto-injects `DATABASE_URL` into the project's environment variables.

- [ ] **Step 3: Claude generates `AUTH_SECRET`**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
Show the output value to the user directly in chat (this is a freshly generated secret with no prior existence anywhere — showing it in chat for the user to copy is not "entering" a credential anywhere).

- [ ] **Step 4: User sets the remaining environment variables**

In Vercel project → Settings → Environment Variables (Production scope), the user adds:
- `AUTH_SECRET` — the value Claude generated in Step 3
- `GMAIL_USER` — their Gmail address
- `GMAIL_APP_PASSWORD` — their Gmail App Password (from `docs/ARCHITECTURE.md`'s existing setup instructions)

(`APP_URL` is added in Task 6 Step 1, once the `*.vercel.app` domain is known.)

- [ ] **Step 5: User sets the Build Command**

In Vercel project → Settings → General → Build Command, set it to:
```
prisma generate && prisma db push --accept-data-loss && next build --webpack
```

- [ ] **Step 6: User triggers the deploy**

Either it auto-triggered on import, or the user clicks Redeploy from the Deployments tab now that settings are in place.

- [ ] **Step 7: Confirm the deploy succeeded**

Ask the user to paste back the deployment's build log (or a screenshot) if it fails; otherwise confirm they see a live `*.vercel.app` URL with the app's login page loading.

---

### Task 6: Finish configuration and verify in production

**Files:** none (manual verification only)

- [ ] **Step 1: Set `APP_URL` and redeploy**

Ask the user to copy their assigned `*.vercel.app` URL, add it as `APP_URL` in the same Environment Variables screen (Task 5 Step 4), and redeploy (env var changes require a new deploy to take effect).

- [ ] **Step 2: Sign up the demo account**

Ask the user to visit the live URL and sign up with `demo@example.com` / `demopassword123` through the normal `/signup` form.

- [ ] **Step 3: Seed demo data**

Ask the user to log in as that account and use the existing in-app control that calls `resetDemoDataAction` (populates realistic sample data via the app's own domain logic — no custom script needed against the remote database).

- [ ] **Step 4: Verify the forgot-password flow for real**

Ask the user to:
1. Log out, go to `/forgot-password`, submit `demo@example.com`.
2. Check their own Gmail inbox (the one configured as `GMAIL_USER`) for the actual email.
3. Follow the link, set a new password, confirm it logs them into `/dashboard`.
4. Report back whether each step worked, and paste any error they see.

- [ ] **Step 5: Restore the demo account's documented password**

If Step 4 changed the demo account's password, ask the user to log in with the new password, go to account settings, and change it back to `demopassword123` (there is no remote equivalent of the local `npm run db:demo-user` script reachable from this machine) — so the documented demo credentials in the README stay accurate for next time.

---

### Task 7: Finish the branch

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck already verified in Task 1; per standing user instruction, merge locally without presenting the options menu). Note: `npm run build` and `npm run lint` should also be run one more time on the branch before merging, to match the verification depth of every prior plan.
