import { create } from "zustand";
import type {
  MqttTopicInfo,
  MqttMessage,
  TopicTreeNode,
} from "@/types/mqtt";
import * as mqtt from "@/services/mqtt";
import { getSetting } from "@/stores/settingsStore";

function buildTopicTree(topics: MqttTopicInfo[]): Map<string, TopicTreeNode> {
  const root = new Map<string, TopicTreeNode>();

  for (const info of topics) {
    const segments = info.topic.split("/");
    let current = root;
    let fullPath = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      fullPath = i === 0 ? segment : `${fullPath}/${segment}`;

      if (!current.has(segment)) {
        current.set(segment, {
          segment,
          fullTopic: fullPath,
          children: new Map(),
        });
      }

      const node = current.get(segment)!;
      if (i === segments.length - 1) {
        node.info = info;
      }
      current = node.children;
    }
  }

  return root;
}

interface MqttTopicStore {
  topics: MqttTopicInfo[];
  topicTree: Map<string, TopicTreeNode>;
  messageHistory: Map<string, MqttMessage[]>;
  selectedTopic: string | null;
  expandedNodes: Set<string>;
  isRefreshing: boolean;

  refreshTopics: (connectionId: string) => Promise<void>;
  addMessages: (messages: MqttMessage[]) => void;
  selectTopic: (topic: string | null) => void;
  toggleNode: (fullTopic: string) => void;
  getMessagesForTopic: (topic: string) => MqttMessage[];
  clearAll: () => void;
}

export const useMqttTopicStore = create<MqttTopicStore>((set, get) => ({
  topics: [],
  topicTree: new Map(),
  messageHistory: new Map(),
  selectedTopic: null,
  expandedNodes: new Set(),
  isRefreshing: false,

  refreshTopics: async (connectionId) => {
    set({ isRefreshing: true });
    try {
      const backendTopics = await mqtt.mqttGetTopics(connectionId);
      const { topics: existingTopics } = get();

      // Merge: keep frontend-derived topics, let backend topics override
      const topicMap = new Map<string, MqttTopicInfo>(
        existingTopics.map((t) => [t.topic, t])
      );
      for (const t of backendTopics) {
        topicMap.set(t.topic, t);
      }

      const merged = Array.from(topicMap.values());
      const topicTree = buildTopicTree(merged);

      // Auto-expand top-level nodes
      const expandedNodes = new Set(get().expandedNodes);
      for (const node of topicTree.values()) {
        expandedNodes.add(node.fullTopic);
      }

      set({ topics: merged, topicTree, expandedNodes, isRefreshing: false });
    } catch (e) {
      set({ isRefreshing: false });
      throw e;
    }
  },

  addMessages: (messages) => {
    const maxPerTopic = getSetting("mqttMaxMessagesPerTopic");
    const { messageHistory, topics } = get();
    const newHistory = new Map(messageHistory);
    const topicMap = new Map<string, MqttTopicInfo>(
      topics.map((t) => [t.topic, { ...t }])
    );

    for (const msg of messages) {
      const existing = newHistory.get(msg.topic) ?? [];
      let updated = [...existing, msg];
      if (updated.length > maxPerTopic) {
        updated = updated.slice(updated.length - maxPerTopic);
      }
      newHistory.set(msg.topic, updated);

      // Update or create MqttTopicInfo entry for this topic
      const existingInfo = topicMap.get(msg.topic);
      if (existingInfo) {
        existingInfo.message_count += 1;
        existingInfo.last_payload_preview = msg.payload.slice(0, 100);
        existingInfo.last_timestamp = msg.timestamp;
        if (msg.retain) {
          existingInfo.retained_payload = msg.payload;
        }
      } else {
        topicMap.set(msg.topic, {
          topic: msg.topic,
          message_count: 1,
          last_payload_preview: msg.payload.slice(0, 100),
          last_timestamp: msg.timestamp,
          subscriber_count: 0,
          retained_payload: msg.retain ? msg.payload : null,
        });
      }
    }

    const newTopics = Array.from(topicMap.values());
    const newTree = buildTopicTree(newTopics);

    // Auto-expand top-level nodes
    const expandedNodes = new Set(get().expandedNodes);
    for (const node of newTree.values()) {
      expandedNodes.add(node.fullTopic);
    }

    set({
      messageHistory: newHistory,
      topics: newTopics,
      topicTree: newTree,
      expandedNodes,
    });
  },

  selectTopic: (topic) => set({ selectedTopic: topic }),

  toggleNode: (fullTopic) => {
    const expanded = new Set(get().expandedNodes);
    if (expanded.has(fullTopic)) {
      expanded.delete(fullTopic);
    } else {
      expanded.add(fullTopic);
    }
    set({ expandedNodes: expanded });
  },

  getMessagesForTopic: (topic) => {
    return get().messageHistory.get(topic) ?? [];
  },

  clearAll: () => {
    set({
      topics: [],
      topicTree: new Map(),
      messageHistory: new Map(),
      selectedTopic: null,
      expandedNodes: new Set(),
      isRefreshing: false,
    });
  },
}));
