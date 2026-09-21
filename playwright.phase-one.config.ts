import {defineConfig,devices} from "@playwright/test";

// No seeding or financial writes: use the existing demo login only.
export default defineConfig({
  testDir:"./e2e",testMatch:"phase-one-readonly.spec.ts",workers:1,
  webServer:{command:"npm run start -- --port 3100",url:"http://localhost:3100",reuseExistingServer:false,timeout:60000,env:{WS_NO_BUFFER_UTIL:"1"}},
  use:{...devices["Desktop Chrome"],channel:"chrome",baseURL:"http://localhost:3100"},
});
