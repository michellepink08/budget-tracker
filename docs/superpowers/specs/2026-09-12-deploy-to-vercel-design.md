# Deploy to Vercel — Design

**Status:** Approved by user, 2026-09-12

## Goal

Get the app running on the public internet (Vercel), backed by a real Postgres database, so the user can try it out themselves — including the just-built Gmail password-reset flow, which needs a real deployment to test end-to-end since it can't be verified without a real Gmail App Password the user holds.

## Context

The app currently runs only locally against SQLite (`prisma/schema.prisma`, provider `sqlite`), using `@prisma/adapter-better-sqlite3` specifically because this development machine's Application Control policy blocks the native binaries Prisma's own schema-engine/query-engine would otherwise use. `docs/ARCHITECTURE.md` already documents a "Deployment: SQLite → Postgres" section describing this switch in the abstract; this spec makes it real.

## Approach

### Hosting topology

- A new **private** GitHub repository, `budget-tracker`, created by the user (no `gh` CLI is available on this machine, so this one step needs the user's own browser).
- A new Vercel project imported from that repo. Push to `master` → Vercel builds and deploys automatically.

### Database

- One Postgres database, added via Vercel's **Storage** tab (Vercel's own Neon-backed Postgres offering) — no separate account to create, and it auto-injects `DATABASE_URL` into the Vercel project's environment variables.
- For now, this **single database serves both production and local development** — the same one-environment model the project already has today (one local SQLite file), just relocated to the cloud. This is a deliberate, YAGNI-driven simplification: splitting into separate dev/prod databases (e.g., via Neon's branching) is a clean, low-cost future upgrade, not something needed for the immediate goal of "get it live so I can try it."
- **Practical consequence documented up front:** schema changes only take effect once deployed — `prisma db push` runs solely inside Vercel's Linux build step, never on this Windows machine (which is exactly what was blocking schema pushes locally in the first place; this arrangement finally retires that constraint by simply never running the blocked command locally again). A future schema change means: edit `schema.prisma`, commit, push, let Vercel apply it — then local dev picks up the new schema automatically, since it points at the same database.

### Driver adapter

- Swap `@prisma/adapter-better-sqlite3` for **`@prisma/adapter-neon`** (`@neondatabase/serverless` under the hood). This is Prisma's recommended adapter for Neon + serverless/edge hosts: it speaks to Neon over HTTP rather than holding a pooled TCP connection, which avoids connection exhaustion across Vercel's serverless cold starts. It's pure JS/WebSocket-based like the current SQLite adapter, so it does not reintroduce the native-binary problem for anything that still runs locally (e.g. `next dev`, `prisma generate`).

## Components

### `prisma/schema.prisma` (modify)

```prisma
datasource db {
  provider = "postgresql"
}
```

(unchanged: `generator client { provider = "prisma-client-js" }` and all model definitions — Postgres and SQLite share the same Prisma scalar types used here: `String`, `Int`, `DateTime`, `Boolean`. No model changes needed.)

### `src/lib/prisma.ts` (modify)

Replace the SQLite adapter construction with the Neon one:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Uses Neon's HTTP-based driver adapter — avoids holding pooled TCP
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

### `scripts/create-demo-user.mjs` and `scripts/seed-demo-data.mjs` (modify)

Both currently construct their own `PrismaClient` with `PrismaBetterSqlite3`. Swap the same way as `src/lib/prisma.ts`:

```javascript
import { PrismaNeon } from "@prisma/adapter-neon";
// ...
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

These remain useful as local convenience scripts (the shared dev/prod database still benefits from a quick local reset path), even though the in-app `resetDemoDataAction` (see below) is the intended way to seed the production demo account itself.

### Retired: `prisma/schema.sql`, `scripts/db-push.mjs`

Both were a SQLite-syntax hand-rolled workaround for applying schema without the blocked schema-engine binary. Neither applies to Postgres, and neither is needed once schema application happens exclusively inside Vercel's (unrestricted) Linux build step. Delete both files.

### `package.json` (modify)

```json
"db:push": "prisma db push",
```

(replacing `"node scripts/db-push.mjs"`). This won't succeed if run directly on this Windows machine (the same binary block as always) — it's meant to run inside the Vercel build, and is kept as an `npm run db:push` script mainly for documentation/discoverability and for use from any unrestricted machine.

### Vercel build configuration

Vercel project setting → **Build Command**:

```
prisma generate && prisma db push --accept-data-loss && next build --webpack
```

`--accept-data-loss` is required because `db push` will otherwise interactively prompt when it detects a potentially destructive change (there is no destructive change on the very first push, but every subsequent deploy runs the same command, so this needs to be non-interactive from the start). This is an accepted risk at this project's scale (personal project, no formal migration history today either — the local workflow never had one).

### New dependencies

```
npm install @prisma/adapter-neon
```

(`@neondatabase/serverless` is a dependency of `@prisma/adapter-neon` and is installed transitively.) Remove `@prisma/adapter-better-sqlite3` and `better-sqlite3` from `package.json` once nothing imports them any more.

### `docs/ARCHITECTURE.md` (modify)

Rewrite the existing "Deployment: SQLite → Postgres" section to describe what's actually deployed (Vercel + Neon Postgres via `@prisma/adapter-neon`, schema applied via the Vercel build command) instead of the prior hypothetical plan. Add a short note on the single-shared-database tradeoff and how to split into separate dev/prod databases later if desired (Neon branching, or Vercel's Development/Preview/Production env var scoping) — documented as a future option, not built now.

## Config (env vars)

Set in the Vercel project's Environment Variables, **Production** scope:

| Variable | Value | Who enters it |
|---|---|---|
| `DATABASE_URL` | auto-injected when Postgres storage is added | Vercel (automatic) |
| `AUTH_SECRET` | a freshly generated random secret | Claude generates the value and shows it in chat; user pastes it into Vercel |
| `APP_URL` | the app's real Vercel URL (e.g. `https://budget-tracker-xyz.vercel.app`) | user (known only after first deploy) |
| `GMAIL_USER` | the user's Gmail address | user |
| `GMAIL_APP_PASSWORD` | the user's Gmail App Password | user |

No credential, password, token, or API key is ever typed by Claude into any field, form, or CLI prompt — consistent with the standing rule against handling credentials. Where a value must exist locally for Claude to run commands (there are none in this plan that require a secret locally), the user would need to supply it directly into a `.env` file themselves; this plan has no such step.

## Deploy sequence (who does what)

1. **User:** creates the empty private GitHub repo `budget-tracker` on github.com.
2. **Claude:** adds the git remote and pushes `master` to it (a normal, low-risk `git push` to a repo the user just explicitly asked to be created for this).
3. **User:** on vercel.com, imports the GitHub repo as a new project.
4. **User:** in the new Vercel project, Storage tab → Add → Postgres (a few clicks; auto-injects `DATABASE_URL`).
5. **Claude:** generates a fresh `AUTH_SECRET` value and gives it to the user in chat.
6. **User:** in Vercel's Environment Variables settings, adds `AUTH_SECRET` (pasted from Claude), `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and sets the Build Command from the Components section above.
7. **User:** triggers the first deploy (or it auto-triggers from the import).
8. **User:** once deployed, copies the assigned `*.vercel.app` URL, adds it as `APP_URL` in the same Environment Variables screen, and redeploys (env var changes require a redeploy to take effect).
9. **User:** visits the live URL, signs up `demo@example.com` / `demopassword123` via the normal `/signup` form, then uses the in-app control that calls `resetDemoDataAction` to populate sample data.
10. **User:** tries the actual forgot-password flow for real — requests a reset, receives the real email via Gmail, resets the password, logs in.

## Testing

No new unit tests are needed for this change — `src/lib/prisma.ts`'s adapter construction was already excluded from unit test coverage (documented in Plan 6's design as "thin wiring," same rationale applies here), and the two seed scripts are plain Node CLI utilities, not covered by the test suite today either. The full existing test suite (225 tests) must still pass unmodified after the adapter swap, since none of it constructs a real Prisma client — every `src/lib/*.test.ts` test uses a mocked `Pick<PrismaClient, ...>` object, so a datasource/adapter change is invisible to them by design.

Verification for this change is therefore entirely the deploy sequence above plus a manual production smoke test (signup, demo data reset, and the full forgot-password round trip using a real inbox).

## Out of scope

- Splitting local dev and production into separate databases (Neon branching / Vercel env scoping) — documented as a future option only.
- Formal Prisma Migrate migration history — this project has never used one (`db push`-style schema sync only), and this deploy doesn't introduce one either.
- CI (automated test runs on push/PR) — not requested, not built here.
- A custom domain — the default `*.vercel.app` URL is sufficient for this pass.
