import { defineConfig } from "vite";

export default defineConfig({
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
});
