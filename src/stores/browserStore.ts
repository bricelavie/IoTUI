import { create } from "zustand";
import type { BrowseNode, NodeDetails, TreeNodeState } from "@/types/opcua";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";

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
  selectedNodeId: null,
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
    } catch (e) {
      toast.error("Browse failed", String(e));
    }
  },

  expandNode: async (connectionId: string, nodeId: string) => {
    const { tree } = get();

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
    set({ selectedNodeId: nodeId, isLoadingDetails: true });
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
    // Expand the path to the target node in the tree, then select it
    // For now, we just select the node and it will show in the details panel
    // A more complete implementation would walk the tree, expanding parents
    const { selectNode } = get();
    await selectNode(connectionId, nodeId);
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  reset: () =>
    set({
      tree: [],
      selectedNodeId: null,
      selectedNodeDetails: null,
      isLoadingDetails: false,
      searchQuery: "",
      breadcrumbs: [{ nodeId: "i=84", label: "Root" }],
    }),
}));
