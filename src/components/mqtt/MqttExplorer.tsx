import React, { useState, useCallback } from "react";
import { MqttSubscriptionManager } from "./MqttSubscriptionManager";
import { TopicTree } from "./TopicExplorer";
import { MqttMessagePanel } from "./MqttMessageStream";
import { PublishDrawer } from "./PublishDrawer";

// ─── MQTT Explorer ───────────────────────────────────────────────
// Unified 3-pane layout: Subscriptions | Topic Tree | Messages
// with a collapsible Publish Drawer at the bottom.

export const MqttExplorer: React.FC = () => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const togglePublish = useCallback(() => setPublishOpen((o) => !o), []);

  return (
    <div className="flex flex-col h-full">
      {/* Main 3-pane area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Subscriptions sidebar */}
        <div className="w-60 min-w-[12rem] border-r border-iot-border flex-shrink-0 overflow-hidden">
          <MqttSubscriptionManager />
        </div>

        {/* Center: Topic tree */}
        <div className="w-72 min-w-[14rem] border-r border-iot-border flex-shrink-0 overflow-hidden">
          <TopicTree
            selectedTopic={selectedTopic}
            onSelectTopic={setSelectedTopic}
          />
        </div>

        {/* Right: Message stream */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <MqttMessagePanel selectedTopic={selectedTopic} />
        </div>
      </div>

      {/* Bottom: Publish drawer */}
      <PublishDrawer
        isOpen={publishOpen}
        onToggle={togglePublish}
        selectedTopic={selectedTopic}
      />
    </div>
  );
};
