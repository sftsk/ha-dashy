import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";

const sampleConfigUrl = new URL("./dashy.config.sample.json", import.meta.url);
const localConfigUrl = new URL("./dashy.config.local.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function dashboardConfigForCommand(command) {
  return command === "build" && existsSync(localConfigUrl)
    ? readJson(localConfigUrl)
    : readJson(sampleConfigUrl);
}

export default defineConfig(({ command }) => ({
  define: {
    __DASHY_BUNDLED_DASHBOARD_CONFIG__: JSON.stringify(
      dashboardConfigForCommand(command),
    ),
  },
  build: {
    lib: {
      entry: "src/main.ts",
      name: "DashyDashboardPanel",
      formats: ["es"],
      fileName: () => "dashy-dashboard-panel.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: "jsdom",
  },
}));
