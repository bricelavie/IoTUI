import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/stores/appStore";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    activeProtocol: "opcua",
    activeView: "connection",
    sidebarCollapsed: false,
    methodTarget: null,
  });
});

describe("appStore", () => {
  it("persists active view changes", () => {
    useAppStore.getState().setActiveView("dashboard");
    const persisted = JSON.parse(localStorage.getItem("iotui_app_state_v1") || "{}");
    expect(persisted.activeView).toBe("dashboard");
  });

  it("persists sidebar collapsed state", () => {
    useAppStore.getState().toggleSidebar();
    const persisted = JSON.parse(localStorage.getItem("iotui_app_state_v1") || "{}");
    expect(persisted.sidebarCollapsed).toBe(true);
  });
});
