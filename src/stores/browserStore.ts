import { create } from "zustand";
import type { BrowseNode, NodeDetails, TreeNodeState } from "@/types/opcua";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";
import { log } from "@/services/logger";

const BROWSER_STATE_KEY = "iotui_browser_state_v1";

function loadBrowserState() {
  try {
    const raw = localStorage.getItem(BROWSER_STATE_KEY);
    if (!raw) return { selectedNodeId: null as string | null };
    const parsed = JSON.parse(raw);
    return {
      selectedNodeId:
        typeof parsed.selectedNodeId === "string" ? parsed.selectedNodeId : null,
    };
  } catch {
    return { selectedNodeId: null as string | null };
  }
}

function persistBrowserState(selectedNodeId: string | null) {
  localStorage.setItem(
    BROWSER_STATE_KEY,
    JSON.stringify({ selectedNodeId })
  );
}

interface BreadcrumbItem {
  nodeId: string;
  label: string;
}

interface BrowserStore {
  // State
  tree: TreeNodeState[];
  selectedNodeId: string | null;
  selectedNodeDetails: NodeDetails | null;
  isLoadingDetails: boolean;
  searchQuery: string;
  breadcrumbs: BreadcrumbItem[];

  // Actions
  loadRootNodes: (connectionId: string) => Promise<void>;
  expandNode: (connectionId: string, nodeId: string) => Promise<void>;
  collapseNode: (nodeId: string) => void;
  selectNode: (connectionId: string, nodeId: string) => Promise<void>;
  navigateToNode: (connectionId: string, nodeId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

// Helper: find a node in the tree and return the path to it
function findNodePath(
  nodes: TreeNodeState[],
  targetId: string,
  path: BreadcrumbItem[] = []
): BreadcrumbItem[] | null {
  for (const n of nodes) {
    const currentPath = [
      ...path,
      { nodeId: n.node.node_id, label: n.node.display_name || n.node.browse_name },
    ];
    if (n.node.node_id === targetId) return currentPath;
    if (n.children) {
      const found = findNodePath(n.children, targetId, currentPath);
      if (found) return found;
    }
  }
  return null;
}

// Helper: recursively expand a node by ID and set children
function setNodeState(
  nodes: TreeNodeState[],
  nodeId: string,
  updater: (n: TreeNodeState) => TreeNodeState
): TreeNodeState[] {
  return nodes.map((n) =>
    n.node.node_id === nodeId
      ? updater(n)
      : n.children
      ? { ...n, children: setNodeState(n.children, nodeId, updater) }
      : n
  );
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tree: [],
  selectedNodeId: loadBrowserState().selectedNodeId,
  selectedNodeDetails: null,
  isLoadingDetails: false,
  searchQuery: "",
  breadcrumbs: [{ nodeId: "i=84", label: "Root" }],

  loadRootNodes: async (connectionId: string) => {
    try {
      const nodes = await opcua.browse(connectionId, "i=84");
      set({
        tree: nodes.map((n) => ({
          node: n,
          expanded: false,
          loading: false,
        })),
      });
      const selectedNodeId = get().selectedNodeId;
      if (selectedNodeId) {
        void get().selectNode(connectionId, selectedNodeId);
      }
    } catch (e) {
      toast.error("Browse failed", String(e));
    }
  },

  expandNode: async (connectionId: string, nodeId: string) => {
    const { tree } = get();
    log("debug", "action", "expandNode", `Expanding node ${nodeId}`);

    set({
      tree: setNodeState(tree, nodeId, (n) => ({ ...n, loading: true })),
    });

    try {
      const children = await opcua.browse(connectionId, nodeId);
      const childStates: TreeNodeState[] = children.map((c) => ({
        node: c,
        expanded: false,
        loading: false,
      }));

      set({
        tree: setNodeState(get().tree, nodeId, (n) => ({
          ...n,
          expanded: true,
          loading: false,
          children: childStates,
        })),
      });
    } catch (e) {
      set({
        tree: setNodeState(get().tree, nodeId, (n) => ({
          ...n,
          loading: false,
        })),
      });
      toast.error("Browse failed", String(e));
    }
  },

  collapseNode: (nodeId: string) => {
    set({
      tree: setNodeState(get().tree, nodeId, (n) => ({
        ...n,
        expanded: false,
      })),
    });
  },

  selectNode: async (connectionId: string, nodeId: string) => {
    log("debug", "action", "selectNode", `Selected node ${nodeId}`);
    const isRefresh = get().selectedNodeId === nodeId && get().selectedNodeDetails !== null;
    persistBrowserState(nodeId);
    set({ selectedNodeId: nodeId, isLoadingDetails: !isRefresh });
    try {
      const details = await opcua.readNodeDetails(connectionId, nodeId);

      // Build breadcrumbs from tree path
      const { tree } = get();
      const path = findNodePath(tree, nodeId);
      const breadcrumbs: BreadcrumbItem[] = [
        { nodeId: "i=84", label: "Root" },
        ...(path || []),
      ];

      set({ selectedNodeDetails: details, isLoadingDetails: false, breadcrumbs });
    } catch (e) {
      set({ isLoadingDetails: false });
      toast.error("Read details failed", String(e));
    }
  },

  navigateToNode: async (connectionId: string, nodeId: string) => {
    const { selectNode } = get();
    await selectNode(connectionId, nodeId);
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  reset: () =>
    (() => {
      persistBrowserState(null);
      set({
        tree: [],
        selectedNodeId: null,
        selectedNodeDetails: null,
        isLoadingDetails: false,
        searchQuery: "",
        breadcrumbs: [{ nodeId: "i=84", label: "Root" }],
      });
    })(),
}));
