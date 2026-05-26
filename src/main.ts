import { DashyDashboardPanel } from "./panel";

if (!customElements.get("dashy-dashboard-panel")) {
  customElements.define("dashy-dashboard-panel", DashyDashboardPanel);
}

if (import.meta.env.DEV) {
  window.addEventListener("DOMContentLoaded", () => {
    const element = document.querySelector<HTMLElement>("dashy-dashboard-panel");
    if (!element) {
      return;
    }

    void import("./mock-hass").then(({ attachMockHomeAssistant }) => {
      attachMockHomeAssistant(element);
    });
  });
}

export { DashyDashboardPanel };
