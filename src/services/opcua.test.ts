import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (_cmd: string, payload?: unknown) => payload);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@/services/logger", () => ({
  withLogging: (_name: string, fn: (...args: unknown[]) => unknown) => fn,
}));

describe("opcua service", () => {
  it("passes history requests through invoke", async () => {
    const service = await import("@/services/opcua");
    const request = {
      node_id: "ns=2;s=Line1.Robot1.Temp",
      max_values: 12,
    };
    await service.readHistory("conn-1", request);
    expect(invoke).toHaveBeenCalledWith("opcua_read_history", {
      connectionId: "conn-1",
      request,
    });
  });
});
