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
      const topics = await mqtt.mqttGetTopics(connectionId);
      const topicTree = buildTopicTree(topics);
      set({ topics, topicTree, isRefreshing: false });
    } catch (e) {
      set({ isRefreshing: false });
      throw e;
    }
  },

  addMessages: (messages) => {
    const maxPerTopic = getSetting("mqttMaxMessagesPerTopic");
    const { messageHistory, topics } = get();
    const newHistory = new Map(messageHistory);
    let topicsChanged = false;

    for (const msg of messages) {
      const existing = newHistory.get(msg.topic) ?? [];
      let updated = [...existing, msg];
      if (updated.length > maxPerTopic) {
        updated = updated.slice(updated.length - maxPerTopic);
      }
      newHistory.set(msg.topic, updated);

      // Update last message on topic tree
      if (!topics.some((t) => t.topic === msg.topic)) {
        topicsChanged = true;
      }
    }

    set({ messageHistory: newHistory });

    // If new topics appeared, the tree should be refreshed by the polling consumer
    if (topicsChanged) {
      // The caller (subscription store polling effect) will trigger refreshTopics
    }
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
