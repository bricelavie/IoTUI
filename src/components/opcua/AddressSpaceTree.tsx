import React, { useEffect, useCallback, useState } from "react";
import { clsx } from "clsx";
import { useBrowserStore } from "@/stores/browserStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { Panel, Spinner, EmptyState } from "@/components/ui";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { MonitorDialog } from "@/components/opcua/MonitorDialog";
import { toast } from "@/stores/notificationStore";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Box,
  Settings,
  Search,
  Eye,
  PenTool,
  Copy,
  FolderTree,
  Play,
  ChevronsRight,
  History,
} from "lucide-react";
import type { TreeNodeState, BrowseNode } from "@/types/opcua";
import { inferMethodParent } from "@/utils/opcua";

const nodeClassIcons: Record<string, React.ReactNode> = {
  Object: <Folder size={14} className="text-iot-amber" />,
  Variable: <FileText size={14} className="text-iot-cyan" />,
  Method: <Settings size={14} className="text-iot-purple" />,
  ObjectType: <Box size={14} className="text-iot-blue" />,
  VariableType: <Box size={14} className="text-iot-blue" />,
  ReferenceType: <Box size={14} className="text-iot-text-muted" />,
  DataType: <Box size={14} className="text-iot-text-muted" />,
  View: <Folder size={14} className="text-iot-text-muted" />,
};

interface TreeNodeProps {
  item: TreeNodeState;
  depth: number;
  onExpand: (nodeId: string) => void;
  onCollapse: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: BrowseNode) => void;
  selectedNodeId: string | null;
  searchQuery: string;
  monitoredNodeIds: Set<string>;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(
  ({ item, depth, onExpand, onCollapse, onSelect, onContextMenu, selectedNodeId, searchQuery, monitoredNodeIds }) => {
    const { node, expanded, loading, children } = item;
    const isMonitored = monitoredNodeIds.has(node.node_id);

    const matchesSearch =
      !searchQuery ||
      node.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.node_id.toLowerCase().includes(searchQuery.toLowerCase());

    const childrenMatchSearch =
      searchQuery &&
      children?.some(
        (c) =>
          c.node.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.node.node_id.toLowerCase().includes(searchQuery.toLowerCase())
      );

    if (searchQuery && !matchesSearch && !childrenMatchSearch && !expanded) {
      return null;
    }

    const icon = expanded
      ? node.node_class === "Object"
        ? <FolderOpen size={14} className="text-iot-amber" />
        : nodeClassIcons[node.node_class] || <FileText size={14} />
      : nodeClassIcons[node.node_class] || <FileText size={14} />;

    return (
      <div>
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected={selectedNodeId === node.node_id}
          aria-expanded={node.has_children ? expanded : undefined}
          className={clsx(
            "tree-node group",
            selectedNodeId === node.node_id && "active"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelect(node.node_id)}
          onContextMenu={(e) => onContextMenu(e, node)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(node.node_id);
            } else if (e.key === "ArrowRight" && node.has_children && !expanded) {
              e.preventDefault();
              onExpand(node.node_id);
            } else if (e.key === "ArrowLeft" && expanded) {
              e.preventDefault();
              onCollapse(node.node_id);
            }
          }}
        >
          {/* Expand/collapse chevron */}
          {node.has_children ? (
            <button
              className="flex-shrink-0 p-0.5 hover:bg-iot-bg-hover rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                expanded ? onCollapse(node.node_id) : onExpand(node.node_id);
              }}
            >
              {loading ? (
                <Spinner size={12} />
              ) : expanded ? (
                <ChevronDown size={12} className="text-iot-text-muted" />
              ) : (
                <ChevronRight size={12} className="text-iot-text-muted" />
              )}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}

          {/* Node icon */}
          <span className="flex-shrink-0">{icon}</span>

          {/* Node label */}
          <span className="truncate text-xs">
            {node.display_name || node.browse_name}
          </span>

          {/* Monitored indicator */}
          {isMonitored && (
            <Eye size={10} className="flex-shrink-0 text-iot-cyan opacity-70" />
          )}

          {/* Node ID tooltip on hover */}
          <span className="hidden group-hover:inline-block ml-auto text-2xs font-mono text-iot-text-disabled truncate max-w-[120px]">
            {node.node_id}
          </span>
        </div>

        {/* Children */}
        {expanded && children && (
          <div className="animate-fade-in">
            {children.map((child) => (
              <TreeNode
                key={child.node.node_id}
                item={child}
                depth={depth + 1}
                onExpand={onExpand}
                onCollapse={onCollapse}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                selectedNodeId={selectedNodeId}
                searchQuery={searchQuery}
                monitoredNodeIds={monitoredNodeIds}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

TreeNode.displayName = "TreeNode";

function getContextMenuItems(node: BrowseNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (node.node_class === "Variable") {
    items.push(
      { id: "read", label: "Read Value", icon: <FileText size={12} /> },
      { id: "write", label: "Write Value...", icon: <PenTool size={12} /> },
      { id: "history", label: "Read History", icon: <History size={12} /> },
      { id: "monitor", label: "Monitor", icon: <Eye size={12} /> },
      { id: "sep1", label: "", separator: true },
    );
  }

  if (node.node_class === "Object" && node.has_children) {
    items.push(
      { id: "browse", label: "Browse Children", icon: <FolderTree size={12} /> },
      { id: "sep1", label: "", separator: true },
    );
  }

  if (node.node_class === "Method") {
    items.push(
      { id: "call", label: "Call Method...", icon: <Play size={12} /> },
      { id: "sep1", label: "", separator: true },
    );
  }

  items.push({
    id: "copy-id",
    label: "Copy Node ID",
    icon: <Copy size={12} />,
    shortcut: "Ctrl+C",
  });

  return items;
}

export const AddressSpaceTree: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();
  const {
    tree,
    selectedNodeId,
    searchQuery,
    breadcrumbs,
    loadRootNodes,
    expandNode,
    collapseNode,
    selectNode,
    setSearchQuery,
  } = useBrowserStore();
  const { subscriptions, getAllMonitoredNodeIds } =
    useSubscriptionStore();

  const { menuPosition, menuData, showMenu, closeMenu } = useContextMenu<BrowseNode>();

  // Monitor dialog state
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [monitorTarget, setMonitorTarget] = useState<{ nodeId: string; displayName: string } | null>(null);

  // Compute monitored node IDs for tree indicators
  const monitoredNodeIds = React.useMemo(() => getAllMonitoredNodeIds(), [subscriptions]);

  useEffect(() => {
    if (activeConnectionId && tree.length === 0) {
      loadRootNodes(activeConnectionId);
    }
  }, [activeConnectionId, tree.length, loadRootNodes]);

  const handleExpand = useCallback(
    (nodeId: string) => {
      if (activeConnectionId) {
        expandNode(activeConnectionId, nodeId);
      }
    },
    [activeConnectionId, expandNode]
  );

  const handleCollapse = useCallback(
    (nodeId: string) => {
      collapseNode(nodeId);
    },
    [collapseNode]
  );

  const handleSelect = useCallback(
    (nodeId: string) => {
      if (activeConnectionId) {
        selectNode(activeConnectionId, nodeId);
      }
    },
    [activeConnectionId, selectNode]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: BrowseNode) => {
      showMenu(e, node);
    },
    [showMenu]
  );

  const handleContextMenuAction = useCallback(
    async (actionId: string) => {
      const node = menuData;
      if (!node || !activeConnectionId) return;

      switch (actionId) {
        case "copy-id":
          try {
            await navigator.clipboard.writeText(node.node_id);
            toast.success("Copied", `Node ID: ${node.node_id}`);
          } catch {
            toast.error("Copy failed", "Could not access clipboard");
          }
          break;
        case "monitor":
          setMonitorTarget({ nodeId: node.node_id, displayName: node.display_name });
          setMonitorDialogOpen(true);
          break;
        case "browse":
          handleExpand(node.node_id);
          break;
        case "read":
          handleSelect(node.node_id);
          break;
        case "write":
          handleSelect(node.node_id);
          break;
        case "history":
          handleSelect(node.node_id);
          useAppStore.getState().setActiveView("attributes");
          break;
        case "call": {
          const parentObjectId = inferMethodParent(node.node_id);
          useAppStore.getState().setMethodTarget({
            methodNodeId: node.node_id,
            objectNodeId: parentObjectId,
          });
          useAppStore.getState().setActiveView("methods");
          break;
        }
      }
    },
    [menuData, activeConnectionId, handleExpand, handleSelect]
  );

  const contextNode = menuData;

  return (
    <Panel
      title="Address Space"
      noPadding
      headerRight={
        <span className="text-2xs font-mono text-iot-text-disabled">
          {tree.length} nodes
        </span>
      }
    >
      {/* Breadcrumbs */}
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-iot-border bg-iot-bg-base/30 overflow-x-auto flex-shrink-0">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.nodeId}>
              {i > 0 && <ChevronsRight size={10} className="text-iot-text-disabled flex-shrink-0" />}
              <button
                className={clsx(
                  "text-2xs font-medium whitespace-nowrap transition-colors",
                  i === breadcrumbs.length - 1
                    ? "text-iot-cyan"
                    : "text-iot-text-muted hover:text-iot-text-secondary"
                )}
                onClick={() => handleSelect(crumb.nodeId)}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="p-2 border-b border-iot-border">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-iot-text-disabled" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter nodes..."
            className="w-full bg-iot-bg-base border border-iot-border rounded pl-7 pr-2 py-1 text-xs text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus transition-colors"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="overflow-auto flex-1">
        {tree.length === 0 ? (
          <EmptyState
            icon={<Folder size={24} />}
            title="No nodes loaded"
            description="Connect to a server to browse"
          />
        ) : (
          <div className="py-1">
            {tree.map((item) => (
              <TreeNode
                key={item.node.node_id}
                item={item}
                depth={0}
                onExpand={handleExpand}
                onCollapse={handleCollapse}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
                selectedNodeId={selectedNodeId}
                searchQuery={searchQuery}
                monitoredNodeIds={monitoredNodeIds}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      <ContextMenu
        items={contextNode ? getContextMenuItems(contextNode) : []}
        position={menuPosition}
        onSelect={handleContextMenuAction}
        onClose={closeMenu}
      />

      {/* Monitor dialog */}
      {monitorTarget && (
        <MonitorDialog
          open={monitorDialogOpen}
          onClose={() => {
            setMonitorDialogOpen(false);
            setMonitorTarget(null);
          }}
          nodeId={monitorTarget.nodeId}
          displayName={monitorTarget.displayName}
        />
      )}
    </Panel>
  );
};
