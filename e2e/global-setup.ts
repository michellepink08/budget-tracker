import { execSync } from "node:child_process";

// Runs once before the whole Playwright run. Reuses the existing
// "safe to re-run" demo-data seed script rather than writing new
// seeding logic — see scripts/seed-demo-data.mjs's own header comment.
export default function globalSetup() {
  execSync("npm run db:seed-demo", { stdio: "inherit" });
}
