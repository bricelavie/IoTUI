import React, { useState } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { Panel, Button, Input, Card, Badge, EmptyState } from "@/components/ui";
import { Play, Plus, Trash2, Settings } from "lucide-react";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";
import type { CallMethodResult } from "@/types/opcua";

interface MethodCallConfig {
  objectNodeId: string;
  methodNodeId: string;
  inputArgs: string[];
}

export const MethodCaller: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();

  const [config, setConfig] = useState<MethodCallConfig>({
    objectNodeId: "ns=2;s=Line1.Robot1",
    methodNodeId: "ns=2;s=Line1.Robot1.EmergencyStop",
    inputArgs: [],
  });
  const [result, setResult] = useState<CallMethodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);

  const addArg = () => {
    setConfig({ ...config, inputArgs: [...config.inputArgs, ""] });
  };

  const removeArg = (index: number) => {
    setConfig({
      ...config,
      inputArgs: config.inputArgs.filter((_, i) => i !== index),
    });
  };

  const updateArg = (index: number, value: string) => {
    const args = [...config.inputArgs];
    args[index] = value;
    setConfig({ ...config, inputArgs: args });
  };

  const handleCall = async () => {
    if (!activeConnectionId) return;
    setIsCalling(true);
    setError(null);
    setResult(null);
    try {
      const res = await opcua.callMethod(activeConnectionId, {
        object_node_id: config.objectNodeId,
        method_node_id: config.methodNodeId,
        input_arguments: config.inputArgs,
      });
      setResult(res);
      if (res.status_code === "Good") {
        toast.success(`Method call succeeded: ${config.methodNodeId}`);
      } else {
        toast.warning(`Method returned: ${res.status_code}`);
      }
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(`Method call failed: ${msg}`);
    }
    setIsCalling(false);
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h3 className="text-sm font-semibold text-iot-text-primary flex items-center gap-2">
          <Settings size={14} className="text-iot-cyan" />
          Method Call
        </h3>

        <Card className="p-4 space-y-3">
          <Input
            label="Object Node ID"
            value={config.objectNodeId}
            onChange={(e) => setConfig({ ...config, objectNodeId: e.target.value })}
            placeholder="ns=2;s=Object.Path"
            className="font-mono text-xs"
          />
          <Input
            label="Method Node ID"
            value={config.methodNodeId}
            onChange={(e) => setConfig({ ...config, methodNodeId: e.target.value })}
            placeholder="ns=2;s=Object.Method"
            className="font-mono text-xs"
          />

          {/* Input arguments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-iot-text-muted font-medium">Input Arguments</label>
              <Button variant="ghost" size="xs" onClick={addArg}>
                <Plus size={11} />
                Add
              </Button>
            </div>
            {config.inputArgs.length === 0 ? (
              <p className="text-xs text-iot-text-disabled">No input arguments</p>
            ) : (
              <div className="space-y-1.5">
                {config.inputArgs.map((arg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-2xs text-iot-text-disabled w-4 text-right">{i}</span>
                    <input
                      value={arg}
                      onChange={(e) => updateArg(i, e.target.value)}
                      placeholder="Argument value"
                      className="flex-1 bg-iot-bg-base border border-iot-border rounded px-2.5 py-1 text-xs font-mono text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:border-iot-border-focus transition-colors"
                    />
                    <button
                      onClick={() => removeArg(i)}
                      className="text-iot-text-disabled hover:text-iot-red transition-colors p-1"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleCall}
            loading={isCalling}
            className="w-full"
          >
            <Play size={14} />
            Call Method
          </Button>
        </Card>

        {/* Result */}
        {error && (
          <div className="p-3 rounded border bg-iot-red/5 border-iot-red/20">
            <span className="text-xs text-iot-red">{error}</span>
          </div>
        )}

        {result && (
          <Card className="p-4">
            <h4 className="text-xs font-semibold text-iot-text-secondary mb-2">Result</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="data-label">Status:</span>
                <Badge variant={result.status_code === "Good" ? "success" : "danger"}>
                  {result.status_code}
                </Badge>
              </div>
              {result.output_arguments.length > 0 && (
                <div>
                  <span className="data-label">Output Arguments:</span>
                  <div className="mt-1 space-y-1">
                    {result.output_arguments.map((arg, i) => (
                      <div key={i} className="flex items-center gap-2 bg-iot-bg-base rounded p-1.5">
                        <span className="text-2xs text-iot-text-disabled w-4">[{i}]</span>
                        <span className="data-value text-xs">{arg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
