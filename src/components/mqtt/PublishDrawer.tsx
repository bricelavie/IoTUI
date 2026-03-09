import React, { useState, useCallback } from "react";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { Button, Input, Select, Badge, Checkbox } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import { errorMessage } from "@/types/opcua";
import type { MqttQoS, MqttPublishTemplate } from "@/types/mqtt";
import * as mqtt from "@/services/mqtt";
import { log } from "@/services/logger";
import {
  Send,
  Save,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Trash2,
  Clock,
} from "lucide-react";

const QOS_OPTIONS = [
  { value: "0", label: "QoS 0" },
  { value: "1", label: "QoS 1" },
  { value: "2", label: "QoS 2" },
];

const MQTT_TEMPLATES_KEY = "iotui_mqtt_publish_templates";
const MQTT_PUBLISH_HISTORY_KEY = "iotui_mqtt_publish_history";

interface PublishHistoryEntry {
  topic: string;
  payload: string;
  qos: MqttQoS;
  retain: boolean;
  timestamp: number;
}

function loadTemplates(): MqttPublishTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(MQTT_TEMPLATES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveTemplates(templates: MqttPublishTemplate[]) {
  localStorage.setItem(MQTT_TEMPLATES_KEY, JSON.stringify(templates));
}

function loadHistory(): PublishHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(MQTT_PUBLISH_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function addHistory(entry: PublishHistoryEntry) {
  const history = loadHistory();
  history.unshift(entry);
  localStorage.setItem(MQTT_PUBLISH_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

// ─── Publish Drawer ──────────────────────────────────────────────

export const PublishDrawer: React.FC<{
  isOpen: boolean;
  onToggle: () => void;
  selectedTopic?: string | null;
}> = ({ isOpen, onToggle, selectedTopic }) => {
  const { activeConnectionId } = useMqttConnectionStore();
  const activeConnection = useMqttConnectionStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId)
  );

  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState<MqttQoS>("0");
  const [retain, setRetain] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showExtended, setShowExtended] = useState(false);

  const [templates, setTemplates] = useState<MqttPublishTemplate[]>(loadTemplates);
  const [history, setHistory] = useState<PublishHistoryEntry[]>(loadHistory);
  const [templateName, setTemplateName] = useState("");

  const isBrokerMode = activeConnection?.mode === "broker" && !activeConnection?.is_simulator;

  // Use selected topic if topic field is empty
  const effectiveTopic = topic || selectedTopic || "";

  const handlePublish = useCallback(async () => {
    if (!activeConnectionId || !effectiveTopic.trim()) return;
    setIsPublishing(true);
    try {
      await mqtt.mqttPublish(activeConnectionId, {
        topic: effectiveTopic.trim(),
        payload,
        qos,
        retain,
      });
      const entry: PublishHistoryEntry = {
        topic: effectiveTopic.trim(), payload, qos, retain, timestamp: Date.now(),
      };
      addHistory(entry);
      setHistory(loadHistory());
      log("info", "action", "mqtt_publish", `Published to "${effectiveTopic.trim()}"`);
      toast.success("Published", effectiveTopic.trim());
    } catch (e) {
      toast.error("Publish failed", errorMessage(e));
    } finally {
      setIsPublishing(false);
    }
  }, [activeConnectionId, effectiveTopic, payload, qos, retain]);

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !effectiveTopic.trim()) return;
    const template: MqttPublishTemplate = {
      name: templateName.trim(),
      topic: effectiveTopic.trim(),
      payload,
      qos,
      retain,
    };
    const updated = [...templates, template];
    setTemplates(updated);
    saveTemplates(updated);
    setTemplateName("");
    toast.success("Template saved", templateName.trim());
  };

  const handleLoadTemplate = (t: MqttPublishTemplate) => {
    setTopic(t.topic);
    setPayload(t.payload);
    setQos(t.qos);
    setRetain(t.retain);
  };

  const handleDeleteTemplate = (name: string) => {
    const updated = templates.filter((t) => t.name !== name);
    setTemplates(updated);
    saveTemplates(updated);
  };

  const handleLoadHistory = (entry: PublishHistoryEntry) => {
    setTopic(entry.topic);
    setPayload(entry.payload);
    setQos(entry.qos);
    setRetain(entry.retain);
  };

  return (
    <div className="border-t border-iot-border bg-iot-bg-surface flex-shrink-0">
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-1.5 text-xs font-medium text-iot-text-muted hover:text-iot-text-secondary transition-colors"
      >
        <Send size={12} className="text-iot-cyan" />
        <span className="uppercase tracking-wider text-2xs font-semibold">Publish</span>
        {isBrokerMode && (
          <Badge variant="warning">Broker mode</Badge>
        )}
        <div className="flex-1" />
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-3 pb-3">
          {isBrokerMode ? (
            <p className="text-xs text-iot-text-muted py-2">
              Publishing is not available in broker mode. Connect a client to the broker to publish messages.
            </p>
          ) : (
            <>
              {/* Compact publish form */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={selectedTopic || "topic/path"}
                    className="font-mono text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handlePublish();
                      }
                    }}
                  />
                </div>
                <div className="flex-[2] min-w-0">
                  <textarea
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    placeholder='{"value": 23.5}'
                    className="w-full h-8 px-2 py-1.5 text-xs font-mono bg-iot-bg-base border border-iot-border rounded-lg text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 resize-y min-h-[32px] transition-colors duration-150"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handlePublish();
                      }
                    }}
                  />
                </div>
                <Select
                  options={QOS_OPTIONS}
                  value={qos}
                  onChange={(e) => setQos(e.target.value as MqttQoS)}
                />
                <Checkbox
                  checked={retain}
                  onChange={setRetain}
                  label="Retain"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  loading={isPublishing}
                  disabled={!activeConnectionId || !effectiveTopic.trim()}
                >
                  <Send size={12} />
                  Publish
                </Button>
              </div>

              {/* Extended section toggle */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setShowExtended(!showExtended)}
                  className="text-2xs text-iot-text-disabled hover:text-iot-text-muted transition-colors flex items-center gap-1"
                >
                  {showExtended ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  Templates & History
                </button>
                {templates.length > 0 && (
                  <Badge variant="default">{templates.length} templates</Badge>
                )}
                {history.length > 0 && (
                  <Badge variant="default">{history.length} recent</Badge>
                )}
                <div className="flex-1" />
                <span className="text-2xs text-iot-text-disabled">
                  {navigator.userAgent.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to publish
                </span>
              </div>

              {/* Templates & History (collapsible) */}
              {showExtended && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {/* Templates */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={10} className="text-iot-cyan" />
                      <span className="text-2xs font-semibold text-iot-text-secondary uppercase">Templates</span>
                    </div>

                    {/* Save template */}
                    <div className="flex gap-1">
                      <input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="flex-1 text-2xs bg-iot-bg-base border border-iot-border rounded px-2 py-1 text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus focus:ring-1 focus:ring-iot-border-focus/30 transition-colors duration-150"
                      />
                      <button
                        onClick={handleSaveTemplate}
                        disabled={!templateName.trim() || !effectiveTopic.trim()}
                        className="px-2 py-1 text-2xs text-iot-text-disabled hover:text-iot-cyan disabled:opacity-50 transition-colors"
                      >
                        <Save size={10} />
                      </button>
                    </div>

                    <div className="max-h-24 overflow-auto space-y-1">
                      {templates.map((t) => (
                        <div
                          key={t.name}
                          className="flex items-center gap-1 p-1.5 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors cursor-pointer group"
                          onClick={() => handleLoadTemplate(t)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-2xs font-medium text-iot-text-primary truncate">{t.name}</p>
                            <p className="text-[10px] font-mono text-iot-text-disabled truncate">{t.topic}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.name); }}
                            className="text-iot-text-disabled hover:text-iot-red opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                      {templates.length === 0 && (
                        <p className="text-[10px] text-iot-text-disabled text-center py-2">No templates saved</p>
                      )}
                    </div>
                  </div>

                  {/* History */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="text-iot-cyan" />
                      <span className="text-2xs font-semibold text-iot-text-secondary uppercase">Recent</span>
                    </div>

                    <div className="max-h-32 overflow-auto space-y-1">
                      {history.slice(0, 15).map((entry) => (
                        <button
                          key={`${entry.timestamp}-${entry.topic}`}
                          className="w-full text-left p-1.5 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors"
                          onClick={() => handleLoadHistory(entry)}
                        >
                          <p className="text-2xs font-mono text-iot-text-primary truncate">{entry.topic}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="default">Q{entry.qos}</Badge>
                            {entry.retain && <Badge variant="warning">R</Badge>}
                            <span className="text-[10px] text-iot-text-disabled ml-auto">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </button>
                      ))}
                      {history.length === 0 && (
                        <p className="text-[10px] text-iot-text-disabled text-center py-2">No publish history</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
