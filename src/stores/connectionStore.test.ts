import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/stores/connectionStore";

vi.mock("@/services/opcua", () => ({
  getConnections: vi.fn(async () => [
    {
      id: "conn-1",
      name: "Server",
      endpoint_url: "opc.tcp://localhost:4840",
      status: "connected",
      security_policy: "None",
      security_mode: "None",
      is_simulator: true,
      last_error: null,
    },
  ]),
  getConnectionStatus: vi.fn(async () => "reconnecting"),
  readHistory: vi.fn(),
}));

vi.mock("@/services/logger", () => ({
  log: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({
    connections: [],
    activeConnectionId: null,
    endpoints: [],
    isConnecting: false,
    isDiscovering: false,
    error: null,
  });
});

describe("connectionStore", () => {
  it("persists active connection selection on refresh", async () => {
    await useConnectionStore.getState().refreshConnections();
    expect(useConnectionStore.getState().activeConnectionId).toBe("conn-1");
    const persisted = JSON.parse(localStorage.getItem("iotui_connection_state_v1") || "{}");
    expect(persisted.activeConnectionId).toBe("conn-1");
  });

  it("updates active connection status", async () => {
    useConnectionStore.setState({
      connections: [{
        id: "conn-1",
        name: "Server",
        endpoint_url: "opc.tcp://localhost:4840",
        status: "connected",
        security_policy: "None",
        security_mode: "None",
        is_simulator: true,
        last_error: null,
      }],
      activeConnectionId: "conn-1",
    });
    await useConnectionStore.getState().refreshStatusForActiveConnection();
    expect(useConnectionStore.getState().connections[0].status).toBe("reconnecting");
  });
});
