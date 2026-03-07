import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscriptionStore } from "@/stores/subscriptionStore";

vi.mock("@/services/opcua", () => ({
  createSubscription: vi.fn(async () => ({
    subscription_id: 11,
    revised_publishing_interval: 500,
    revised_lifetime_count: 60,
    revised_max_keep_alive_count: 10,
  })),
  getSubscriptions: vi.fn(async () => [
    {
      id: 11,
      publishing_interval: 500,
      monitored_items: [
        { id: 99, node_id: "ns=2;s=Line1.Temp", display_name: "Temp", sampling_interval: 500 },
      ],
    },
  ]),
  addMonitoredItems: vi.fn(async () => [99]),
  deleteSubscription: vi.fn(async () => undefined),
  removeMonitoredItems: vi.fn(async () => undefined),
  pollSubscription: vi.fn(async (_connectionId: string, subscriptionId: number) => [
    {
      subscription_id: subscriptionId,
      monitored_item_id: 99,
      node_id: "ns=2;s=Line1.Temp",
      display_name: "Temp",
      value: "42.5",
      data_type: "Double",
      status_code: "Good",
      source_timestamp: new Date().toISOString(),
      server_timestamp: new Date().toISOString(),
    },
  ]),
  readHistory: vi.fn(async () => ({
    node_id: "ns=2;s=Line1.Temp",
    values: [],
    continuation_point: undefined,
  })),
}));

vi.mock("@/stores/notificationStore", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services/logger", () => ({
  log: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  useSubscriptionStore.getState().clearAll();
});

describe("subscriptionStore", () => {
  it("persists subscription metadata and selection", async () => {
    const subId = await useSubscriptionStore.getState().createSubscription("conn-1", undefined, "Primary");
    expect(subId).toBe(11);
    const persisted = JSON.parse(localStorage.getItem("iotui_subscription_state_v1") || "{}");
    expect(persisted.activeSubscriptionId).toBe(11);
    expect(persisted.subscriptionMeta["11"].name).toBe("Primary");
  });

  it("persists active subscription selection changes", async () => {
    await useSubscriptionStore.getState().createSubscription("conn-1", undefined, "Primary");
    useSubscriptionStore.getState().setActiveSubscriptionId(11);
    const persisted = JSON.parse(localStorage.getItem("iotui_subscription_state_v1") || "{}");
    expect(persisted.activeSubscriptionId).toBe(11);
  });

  it("creates subscription-scoped monitored value keys when polling", async () => {
    await useSubscriptionStore.getState().createSubscription("conn-1", undefined, "Primary");
    useSubscriptionStore.getState().startPolling("conn-1", 11);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const values = useSubscriptionStore.getState().monitoredValues;
    const value = values.get("11::ns=2;s=Line1.Temp");
    expect(value?.numericValue).toBe(42.5);
    expect(value?.subscription_id).toBe(11);
    useSubscriptionStore.getState().stopPolling(11);
  });
});
