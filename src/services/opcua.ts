import { invoke } from "@tauri-apps/api/core";
import { withLogging } from "@/services/logger";
import type {
  ConnectionConfig,
  ConnectionInfo,
  ConnectionStatus,
  EndpointInfo,
  BrowseNode,
  NodeDetails,
  ReadResult,
  WriteRequest,
  WriteResult,
  CreateSubscriptionRequest,
  CreateSubscriptionResult,
  MonitoredItemRequest,
  DataChangeEvent,
  SubscriptionInfo,
  CallMethodRequest,
  CallMethodResult,
  MethodInfo,
  EventData,
} from "@/types/opcua";

// ─── Connection ──────────────────────────────────────────────────

export const connect = withLogging(
  "opcua_connect",
  async (config: ConnectionConfig): Promise<string> => {
    return invoke("opcua_connect", { config });
  }
);

export const disconnect = withLogging(
  "opcua_disconnect",
  async (connectionId: string): Promise<void> => {
    return invoke("opcua_disconnect", { connectionId });
  }
);

export const discoverEndpoints = withLogging(
  "opcua_discover_endpoints",
  async (url: string): Promise<EndpointInfo[]> => {
    return invoke("opcua_discover_endpoints", { url });
  }
);

export const getConnections = withLogging(
  "opcua_get_connections",
  async (): Promise<ConnectionInfo[]> => {
    return invoke("opcua_get_connections");
  }
);

export const getConnectionStatus = withLogging(
  "opcua_get_connection_status",
  async (connectionId: string): Promise<ConnectionStatus> => {
    return invoke("opcua_get_connection_status", { connectionId });
  }
);

// ─── Browse ──────────────────────────────────────────────────────

export const browse = withLogging(
  "opcua_browse",
  async (connectionId: string, nodeId: string): Promise<BrowseNode[]> => {
    return invoke("opcua_browse", { connectionId, nodeId });
  }
);

export const readNodeDetails = withLogging(
  "opcua_read_node_details",
  async (connectionId: string, nodeId: string): Promise<NodeDetails> => {
    return invoke("opcua_read_node_details", { connectionId, nodeId });
  }
);

// ─── Read / Write ────────────────────────────────────────────────

export const readValues = withLogging(
  "opcua_read_values",
  async (connectionId: string, nodeIds: string[]): Promise<ReadResult[]> => {
    return invoke("opcua_read_values", { connectionId, nodeIds });
  }
);

export const writeValue = withLogging(
  "opcua_write_value",
  async (connectionId: string, request: WriteRequest): Promise<WriteResult> => {
    return invoke("opcua_write_value", { connectionId, request });
  }
);

// ─── Subscriptions ───────────────────────────────────────────────

export const createSubscription = withLogging(
  "opcua_create_subscription",
  async (
    connectionId: string,
    request: CreateSubscriptionRequest
  ): Promise<CreateSubscriptionResult> => {
    return invoke("opcua_create_subscription", { connectionId, request });
  }
);

export const addMonitoredItems = withLogging(
  "opcua_add_monitored_items",
  async (
    connectionId: string,
    subscriptionId: number,
    items: MonitoredItemRequest[]
  ): Promise<number[]> => {
    return invoke("opcua_add_monitored_items", {
      connectionId,
      subscriptionId,
      items,
    });
  }
);

export const deleteSubscription = withLogging(
  "opcua_delete_subscription",
  async (connectionId: string, subscriptionId: number): Promise<void> => {
    return invoke("opcua_delete_subscription", { connectionId, subscriptionId });
  }
);

export const pollSubscription = withLogging(
  "opcua_poll_subscription",
  async (
    connectionId: string,
    subscriptionId: number
  ): Promise<DataChangeEvent[]> => {
    return invoke("opcua_poll_subscription", { connectionId, subscriptionId });
  }
);

export const getSubscriptions = withLogging(
  "opcua_get_subscriptions",
  async (connectionId: string): Promise<SubscriptionInfo[]> => {
    return invoke("opcua_get_subscriptions", { connectionId });
  }
);

export const removeMonitoredItems = withLogging(
  "opcua_remove_monitored_items",
  async (
    connectionId: string,
    subscriptionId: number,
    itemIds: number[]
  ): Promise<void> => {
    return invoke("opcua_remove_monitored_items", {
      connectionId,
      subscriptionId,
      itemIds,
    });
  }
);

// ─── Methods ─────────────────────────────────────────────────────

export const getMethodInfo = withLogging(
  "opcua_get_method_info",
  async (
    connectionId: string,
    methodNodeId: string
  ): Promise<MethodInfo> => {
    return invoke("opcua_get_method_info", { connectionId, methodNodeId });
  }
);

export const callMethod = withLogging(
  "opcua_call_method",
  async (
    connectionId: string,
    request: CallMethodRequest
  ): Promise<CallMethodResult> => {
    return invoke("opcua_call_method", { connectionId, request });
  }
);

// ─── Events ──────────────────────────────────────────────────────

export const pollEvents = withLogging(
  "opcua_poll_events",
  async (connectionId: string): Promise<EventData[]> => {
    return invoke("opcua_poll_events", { connectionId });
  }
);
