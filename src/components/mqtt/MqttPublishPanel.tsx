import React, { useState } from "react";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { Button, Input, Select, Card, Badge } from "@/components/ui";
import { toast } from "@/stores/notificationStore";
import { errorMessage } from "@/utils/errors";
import type { MqttQoS, MqttPublishTemplate } from "@/types/mqtt";
import * as mqtt from "@/services/mqtt";
import { log } from "@/services/logger";
import {
  Send,
  Save,
  BookOpen,
  Trash2,
  Clock,
} from "lucide-react";

const QOS_OPTIONS = [
  { value: "0", label: "QoS 0 - At most once" },
  { value: "1", label: "QoS 1 - At least once" },
  { value: "2", label: "QoS 2 - Exactly once" },
];

const MQTT_TEMPLATES_KEY = "iotui_mqtt_publish_templates";
const MQTT_PUBLISH_HISTORY_KEY = "iotui_mqtt_publish_history";

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

interface PublishHistoryEntry {
  topic: string;
  payload: string;
  qos: MqttQoS;
  retain: boolean;
  timestamp: number;
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

export const MqttPublishPanel: React.FC = () => {
  const { activeConnectionId } = useMqttConnectionStore();

  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState<MqttQoS>("0");
  const [retain, setRetain] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [templates, setTemplates] = useState<MqttPublishTemplate[]>(loadTemplates);
  const [history, setHistory] = useState<PublishHistoryEntry[]>(loadHistory);
  const [templateName, setTemplateName] = useState("");

  const handlePublish = async () => {
    if (!activeConnectionId || !topic.trim()) return;
    setIsPublishing(true);
    try {
      await mqtt.mqttPublish(activeConnectionId, {
        topic: topic.trim(),
        payload,
        qos,
        retain,
      });
      const entry: PublishHistoryEntry = {
        topic: topic.trim(), payload, qos, retain, timestamp: Date.now(),
      };
      addHistory(entry);
      setHistory(loadHistory());
      log("info", "action", "mqtt_publish", `Published to "${topic.trim()}"`);
      toast.success("Published", topic.trim());
    } catch (e) {
      toast.error("Publish failed", errorMessage(e));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !topic.trim()) return;
    const template: MqttPublishTemplate = {
      name: templateName.trim(),
      topic: topic.trim(),
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
    <div className="h-full overflow-auto p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Send size={16} className="text-iot-cyan" />
          <h2 className="text-sm font-semibold text-iot-text-primary">Publish Message</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Publish form */}
          <Card className="p-4 lg:col-span-2 space-y-3">
            <Input
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="sensor/temperature"
              className="font-mono text-xs"
            />

            <div>
              <label className="text-xs text-iot-text-muted font-medium mb-1.5 block">
                Payload
              </label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder='{"value": 23.5, "unit": "°C"}'
                className="w-full h-32 px-3 py-2 text-xs font-mono bg-iot-bg-base border border-iot-border rounded-lg text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-cyan/50 resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="QoS"
                options={QOS_OPTIONS}
                value={qos}
                onChange={(e) => setQos(e.target.value as MqttQoS)}
              />
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 text-xs text-iot-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retain}
                    onChange={(e) => setRetain(e.target.checked)}
                    className="rounded border-iot-border bg-iot-bg-base"
                  />
                  Retain Message
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={handlePublish}
                loading={isPublishing}
                disabled={!activeConnectionId || !topic.trim()}
                className="flex-1"
              >
                <Send size={14} />
                Publish
              </Button>
            </div>

            {/* Save template */}
            <div className="flex gap-2 items-end pt-2 border-t border-iot-border">
              <div className="flex-1">
                <Input
                  label="Template Name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="My Template"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim() || !topic.trim()}>
                <Save size={12} />
                Save
              </Button>
            </div>
          </Card>

          {/* Right column: templates + history */}
          <div className="space-y-4">
            {/* Templates */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
                <BookOpen size={14} className="text-iot-cyan" />
                Templates
                {templates.length > 0 && <Badge>{templates.length}</Badge>}
              </h3>
              {templates.length === 0 ? (
                <p className="text-xs text-iot-text-muted text-center py-4">No templates yet</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {templates.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center gap-2 p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors cursor-pointer group"
                      onClick={() => handleLoadTemplate(t)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-iot-text-primary truncate">{t.name}</p>
                        <p className="text-2xs font-mono text-iot-text-disabled truncate">{t.topic}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.name); }}
                        className="text-iot-text-disabled hover:text-iot-red transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Publish History */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
                <Clock size={14} className="text-iot-cyan" />
                Recent
                {history.length > 0 && <Badge>{history.length}</Badge>}
              </h3>
              {history.length === 0 ? (
                <p className="text-xs text-iot-text-muted text-center py-4">No publish history</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {history.slice(0, 20).map((entry, i) => (
                    <button
                      key={i}
                      className="w-full text-left p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors text-xs"
                      onClick={() => handleLoadHistory(entry)}
                    >
                      <p className="font-mono text-iot-text-primary truncate">{entry.topic}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="default">QoS {entry.qos}</Badge>
                        {entry.retain && <Badge variant="warning">ret</Badge>}
                        <span className="text-2xs text-iot-text-disabled ml-auto">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
