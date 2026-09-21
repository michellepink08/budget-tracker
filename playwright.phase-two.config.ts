import {defineConfig,devices} from "@playwright/test";
export default defineConfig({testDir:"./e2e",testMatch:"phase-two-workspace.spec.ts",workers:1,timeout:90000,webServer:{command:"npm run dev -- --port 3101",url:"http://localhost:3101",reuseExistingServer:false,timeout:120000,env:{WS_NO_BUFFER_UTIL:"1"}},use:{...devices["Desktop Chrome"],channel:"chrome",baseURL:"http://localhost:3101"}});
