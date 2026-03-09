import React, { useMemo, useState, useCallback } from "react";
import { useMqttTopicStore } from "@/stores/mqttTopicStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { Badge, EmptyState, Tooltip } from "@/components/ui";
import { FolderTree, ChevronRight, ChevronDown, Hash, Search, Copy, Check } from "lucide-react";
import { copyToClipboard, calculateMessageRate } from "@/utils/mqtt";
import { toast } from "@/stores/notificationStore";
import type { TopicTreeNode } from "@/types/mqtt";

// ─── Topic Tree Item ─────────────────────────────────────────────

const TopicTreeItem: React.FC<{
  node: TopicTreeNode;
  depth: number;
  selectedTopic: string | null;
  expandedNodes: Set<string>;
  searchFilter: string;
  messageRates: Map<string, number>;
  onSelect: (topic: string) => void;
  onToggle: (fullTopic: string) => void;
}> = ({ node, depth, selectedTopic, expandedNodes, searchFilter, messageRates, onSelect, onToggle }) => {
  const [justCopied, setJustCopied] = useState(false);
  const hasChildren = node.children.size > 0;
  const isExpanded = expandedNodes.has(node.fullTopic);
  const isSelected = selectedTopic === node.fullTopic;
  const hasInfo = !!node.info;
  const rate = messageRates.get(node.fullTopic);

  // If searching, check if this node or descendants match
  const matchesSearch = !searchFilter || node.fullTopic.toLowerCase().includes(searchFilter.toLowerCase());
  const hasMatchingDescendant = useMemo(() => {
    if (!searchFilter) return true;
    const check = (n: TopicTreeNode): boolean => {
      if (n.fullTopic.toLowerCase().includes(searchFilter.toLowerCase())) return true;
      for (const child of n.children.values()) {
        if (check(child)) return true;
      }
      return false;
    };
    return check(node);
  }, [node, searchFilter]);

  if (searchFilter && !matchesSearch && !hasMatchingDescendant) return null;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(node.fullTopic);
    if (ok) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } else {
      toast.error("Copy failed", "Could not copy to clipboard");
    }
  };

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        className={`flex items-center gap-1 w-full text-left px-2 py-1 text-xs transition-colors rounded group cursor-pointer ${
          isSelected
            ? "bg-iot-cyan/10 text-iot-cyan"
            : "text-iot-text-secondary hover:bg-iot-bg-hover"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (hasInfo) onSelect(node.fullTopic);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (hasInfo) onSelect(node.fullTopic);
          }
        }}
      >
        <span
          className="flex-shrink-0 w-4"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              onToggle(node.fullTopic);
            }
          }}
          role={hasChildren ? "button" : undefined}
          aria-label={hasChildren ? (isExpanded ? "Collapse" : "Expand") : undefined}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3" />
          )}
        </span>
        <span className={`truncate font-mono ${matchesSearch && searchFilter ? "text-iot-cyan font-semibold" : ""}`}>
          {node.segment}
        </span>
        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
          {rate !== undefined && rate > 0 && (
            <span className="text-2xs text-iot-text-disabled font-mono">{rate.toFixed(1)}/s</span>
          )}
          {node.info && (
            <Badge variant="default">{node.info.message_count}</Badge>
          )}
          {node.info?.retained_payload && (
            <Tooltip content="Has retained message">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-amber flex-shrink-0" />
            </Tooltip>
          )}
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); handleCopy(e); }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-iot-text-disabled hover:text-iot-cyan transition-all cursor-pointer"
            title="Copy topic path"
          >
            {justCopied ? <Check size={10} className="text-iot-green" /> : <Copy size={10} />}
          </span>
        </span>
      </div>
      {(isExpanded || (searchFilter && hasMatchingDescendant)) && hasChildren && (
        <div>
          {Array.from(node.children.values()).map((child) => (
            <TopicTreeItem
              key={child.fullTopic}
              node={child}
              depth={depth + 1}
              selectedTopic={selectedTopic}
              expandedNodes={expandedNodes}
              searchFilter={searchFilter}
              messageRates={messageRates}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Topic Tree Component ────────────────────────────────────────

export const TopicTree: React.FC<{
  selectedTopic: string | null;
  onSelectTopic: (topic: string | null) => void;
}> = ({ selectedTopic, onSelectTopic }) => {
  const { topicTree, topics, expandedNodes, toggleNode } = useMqttTopicStore();
  const { messages } = useMqttSubscriptionStore();
  const [search, setSearch] = useState("");

  // Calculate message rates per topic
  const messageRates = useMemo(() => {
    const rates = new Map<string, number>();
    const topicTimestamps = new Map<string, string[]>();

    for (const msg of messages) {
      const existing = topicTimestamps.get(msg.topic) ?? [];
      existing.push(msg.timestamp);
      topicTimestamps.set(msg.topic, existing);
    }

    for (const [topic, timestamps] of topicTimestamps) {
      rates.set(topic, calculateMessageRate(timestamps, 10));
    }
    return rates;
  }, [messages]);

  const handleSelect = useCallback((topic: string) => {
    onSelectTopic(selectedTopic === topic ? null : topic);
  }, [selectedTopic, onSelectTopic]);

  if (topics.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-iot-border flex-shrink-0">
          <FolderTree size={14} className="text-iot-cyan" />
          <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
            Topics
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<FolderTree size={24} />}
            title="No Topics"
            description="Subscribe to see topics"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-iot-border flex-shrink-0">
        <FolderTree size={14} className="text-iot-cyan" />
        <span className="text-xs font-semibold text-iot-text-secondary uppercase tracking-wider">
          Topics
        </span>
        <Badge variant="info">{topics.length}</Badge>
        {selectedTopic && (
          <button
            onClick={() => onSelectTopic(null)}
            className="ml-auto text-2xs text-iot-text-disabled hover:text-iot-text-muted transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-iot-border flex-shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-iot-text-disabled" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter topics..."
            className="w-full pl-7 pr-2 py-1 text-2xs font-mono bg-iot-bg-base border border-iot-border rounded text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-cyan/50"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {Array.from(topicTree.values()).map((node) => (
          <TopicTreeItem
            key={node.fullTopic}
            node={node}
            depth={0}
            selectedTopic={selectedTopic}
            expandedNodes={expandedNodes}
            searchFilter={search}
            messageRates={messageRates}
            onSelect={handleSelect}
            onToggle={toggleNode}
          />
        ))}
      </div>

      {/* Selected topic info footer */}
      {selectedTopic && (
        <div className="px-3 py-1.5 border-t border-iot-border flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Hash size={10} className="text-iot-cyan flex-shrink-0" />
            <span className="text-2xs font-mono text-iot-text-primary truncate">{selectedTopic}</span>
          </div>
        </div>
      )}
    </div>
  );
};
