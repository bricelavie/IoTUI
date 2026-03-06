import { invoke } from "@tauri-apps/api/core";
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
  EventData,
} from "@/types/opcua";

// ─── Connection ──────────────────────────────────────────────────

export async function connect(config: ConnectionConfig): Promise<string> {
  return invoke("opcua_connect", { config });
}

export async function disconnect(connectionId: string): Promise<void> {
  return invoke("opcua_disconnect", { connectionId });
}

export async function discoverEndpoints(
  url: string
): Promise<EndpointInfo[]> {
  return invoke("opcua_discover_endpoints", { url });
}

export async function getConnections(): Promise<ConnectionInfo[]> {
  return invoke("opcua_get_connections");
}

export async function getConnectionStatus(
  connectionId: string
): Promise<ConnectionStatus> {
  return invoke("opcua_get_connection_status", { connectionId });
}

// ─── Browse ──────────────────────────────────────────────────────

export async function browse(
  connectionId: string,
  nodeId: string
): Promise<BrowseNode[]> {
  return invoke("opcua_browse", { connectionId, nodeId });
}

export async function readNodeDetails(
  connectionId: string,
  nodeId: string
): Promise<NodeDetails> {
  return invoke("opcua_read_node_details", { connectionId, nodeId });
}

// ─── Read / Write ────────────────────────────────────────────────

export async function readValues(
  connectionId: string,
  nodeIds: string[]
): Promise<ReadResult[]> {
  return invoke("opcua_read_values", { connectionId, nodeIds });
}

export async function writeValue(
  connectionId: string,
  request: WriteRequest
): Promise<WriteResult> {
  return invoke("opcua_write_value", { connectionId, request });
}

// ─── Subscriptions ───────────────────────────────────────────────

export async function createSubscription(
  connectionId: string,
  request: CreateSubscriptionRequest
): Promise<CreateSubscriptionResult> {
  return invoke("opcua_create_subscription", { connectionId, request });
}

export async function addMonitoredItems(
  connectionId: string,
  subscriptionId: number,
  items: MonitoredItemRequest[]
): Promise<number[]> {
  return invoke("opcua_add_monitored_items", {
    connectionId,
    subscriptionId,
    items,
  });
}

export async function deleteSubscription(
  connectionId: string,
  subscriptionId: number
): Promise<void> {
  return invoke("opcua_delete_subscription", { connectionId, subscriptionId });
}

export async function pollSubscription(
  connectionId: string,
  subscriptionId: number
): Promise<DataChangeEvent[]> {
  return invoke("opcua_poll_subscription", { connectionId, subscriptionId });
}

export async function getSubscriptions(
  connectionId: string
): Promise<SubscriptionInfo[]> {
  return invoke("opcua_get_subscriptions", { connectionId });
}

export async function removeMonitoredItems(
  connectionId: string,
  subscriptionId: number,
  itemIds: number[]
): Promise<void> {
  return invoke("opcua_remove_monitored_items", {
    connectionId,
    subscriptionId,
    itemIds,
  });
}

// ─── Methods ─────────────────────────────────────────────────────

export async function callMethod(
  connectionId: string,
  request: CallMethodRequest
): Promise<CallMethodResult> {
  return invoke("opcua_call_method", { connectionId, request });
}

// ─── Events ──────────────────────────────────────────────────────

export async function pollEvents(
  connectionId: string
): Promise<EventData[]> {
  return invoke("opcua_poll_events", { connectionId });
}
