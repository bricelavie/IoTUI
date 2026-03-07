import React, { useState, useEffect, useCallback } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useAppStore } from "@/stores/appStore";
import { Panel, Button, Input, Card, Badge, EmptyState } from "@/components/ui";
import {
  Play,
  Search,
  Settings,
  ArrowRight,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import * as opcua from "@/services/opcua";
import { toast } from "@/stores/notificationStore";
import type {
  MethodInfo,
  MethodArgument,
  CallMethodResult,
  TypedArgValue,
} from "@/types/opcua";
import { errorMessage } from "@/types/opcua";

// ─── Types ───────────────────────────────────────────────────────

interface CallHistoryEntry {
  id: number;
  timestamp: string;
  methodNodeId: string;
  displayName: string;
  statusCode: string;
  outputArguments: string[];
  inputValues: TypedArgValue[];
}

// ─── Argument input component ────────────────────────────────────

const ArgumentInput: React.FC<{
  arg: MethodArgument;
  index: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}> = ({ arg, index, value, error, onChange }) => {
  const placeholder = getPlaceholder(arg.data_type);

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-2xs text-iot-text-disabled w-4 text-right pt-2 flex-shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-iot-text-secondary">
            {arg.name}
          </span>
          <Badge variant="info" className="text-2xs">
            {arg.data_type}
          </Badge>
        </div>
        {arg.description && (
          <div className="text-2xs text-iot-text-muted mb-1.5">
            {arg.description}
          </div>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-iot-bg-base border rounded px-2.5 py-1.5 text-xs font-mono text-iot-text-primary placeholder:text-iot-text-disabled focus:outline-none focus:ring-1 transition-colors ${
            error
              ? "border-iot-amber focus:border-iot-amber focus:ring-iot-amber/30"
              : "border-iot-border focus:border-iot-border-focus focus:ring-iot-border-focus/30"
          }`}
        />
        {error && <div className="text-2xs text-iot-amber mt-1">{error}</div>}
      </div>
    </div>
  );
};

function getPlaceholder(dataType: string): string {
  switch (dataType) {
    case "Boolean":
      return "true or false";
    case "Int16":
    case "Int32":
    case "Int64":
    case "SByte":
      return "0";
    case "UInt16":
    case "UInt32":
    case "UInt64":
    case "Byte":
      return "0";
    case "Float":
    case "Double":
      return "0.0";
    default:
      return "value";
  }
}

function inferObjectNodeId(methodNodeId: string): string {
  const trimmed = methodNodeId.trim();
  if (!trimmed) return "";
  const stringMarker = ";s=";
  const idx = trimmed.indexOf(stringMarker);
  if (idx >= 0) {
    const prefix = trimmed.slice(0, idx + stringMarker.length);
    const body = trimmed.slice(idx + stringMarker.length);
    const parts = body.split(".");
    if (parts.length > 1) {
      parts.pop();
      return prefix + parts.join(".");
    }
    return "";
  }
  return "";
}

function validateArgumentValue(arg: MethodArgument, value: string): string | null {
  const trimmed = value.trim();
  switch (arg.data_type) {
    case "Boolean":
      return /^(true|false|1|0)$/i.test(trimmed) ? null : "Use true/false or 1/0";
    case "SByte":
    case "Byte":
    case "Int16":
    case "UInt16":
    case "Int32":
    case "UInt32":
    case "Int64":
    case "UInt64":
      return /^-?\d+$/.test(trimmed) ? null : "Integer required";
    case "Float":
    case "Double":
      return Number.isNaN(Number(trimmed)) ? "Numeric value required" : null;
    default:
      return null;
  }
}

// ─── Main component ──────────────────────────────────────────────

export const MethodCaller: React.FC = () => {
  const { activeConnectionId } = useConnectionStore();
  const methodTarget = useAppStore((s) => s.methodTarget);
  const setMethodTarget = useAppStore((s) => s.setMethodTarget);

  // Node IDs
  const [objectNodeId, setObjectNodeId] = useState("");
  const [methodNodeId, setMethodNodeId] = useState("");

  // Method info from discovery
  const [methodInfo, setMethodInfo] = useState<MethodInfo | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Argument values
  const [argValues, setArgValues] = useState<string[]>([]);
  const [argErrors, setArgErrors] = useState<string[]>([]);

  // Call state
  const [result, setResult] = useState<CallMethodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);

  // Call history
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [nextHistoryId, setNextHistoryId] = useState(1);

  // Discover method info
  const handleDiscover = useCallback(
    async (nodeId?: string) => {
      const id = nodeId || methodNodeId.trim();
      if (!activeConnectionId || !id) return;

      setIsDiscovering(true);
      setMethodInfo(null);
      setArgValues([]);
      setArgErrors([]);
      setResult(null);
      setError(null);

      try {
        const info = await opcua.getMethodInfo(activeConnectionId, id);
        setMethodInfo(info);
        setArgValues(new Array(info.input_arguments.length).fill(""));
        setArgErrors(new Array(info.input_arguments.length).fill(""));

        // Auto-infer parent object if not set
        if (!objectNodeId.trim()) {
          const inferred = inferObjectNodeId(id);
          if (inferred) setObjectNodeId(inferred);
        }
      } catch (e) {
        toast.error(`Failed to discover method: ${errorMessage(e)}`);
      }

      setIsDiscovering(false);
    },
    [activeConnectionId, methodNodeId, objectNodeId]
  );

  // Handle method target from AddressSpaceTree
  useEffect(() => {
    if (methodTarget) {
      setMethodNodeId(methodTarget.methodNodeId);
      if (methodTarget.objectNodeId) {
        setObjectNodeId(methodTarget.objectNodeId);
      }
      // Clear the target so it doesn't re-trigger
      const nodeId = methodTarget.methodNodeId;
      setMethodTarget(null);
      // Auto-discover the new target
      if (activeConnectionId && nodeId) {
        handleDiscover(nodeId);
      }
    }
  }, [methodTarget, setMethodTarget, activeConnectionId, handleDiscover]);

  const handleCall = async () => {
    if (!activeConnectionId || !methodNodeId.trim() || !objectNodeId.trim())
      return;

    setIsCalling(true);
    setError(null);
    setResult(null);

    if (methodInfo) {
      const nextErrors = methodInfo.input_arguments.map((arg, i) => validateArgumentValue(arg, argValues[i] || "") || "");
      setArgErrors(nextErrors);
      if (nextErrors.some(Boolean)) {
        setIsCalling(false);
        setError("One or more method arguments are invalid.");
        return;
      }
    }

    const inputArguments: TypedArgValue[] = methodInfo
      ? methodInfo.input_arguments.map((arg, i) => ({
          value: argValues[i] || "",
          data_type: arg.data_type,
        }))
      : argValues.map((v) => ({ value: v, data_type: "String" }));

    try {
      const res = await opcua.callMethod(activeConnectionId, {
        object_node_id: objectNodeId.trim(),
        method_node_id: methodNodeId.trim(),
        input_arguments: inputArguments,
      });
      setResult(res);

      // Add to history
      const entry: CallHistoryEntry = {
        id: nextHistoryId,
        timestamp: new Date().toLocaleTimeString(),
        methodNodeId: methodNodeId.trim(),
        displayName:
          methodInfo?.display_name ||
          methodNodeId.split(".").pop() ||
          methodNodeId,
        statusCode: res.status_code,
        outputArguments: res.output_arguments,
        inputValues: inputArguments,
      };
      setHistory((h) => [entry, ...h].slice(0, 20));
      setNextHistoryId((n) => n + 1);

      if (res.status_code === "Good") {
        toast.success(
          `Method call succeeded: ${methodInfo?.display_name || methodNodeId}`
        );
      } else {
        toast.warning(`Method returned: ${res.status_code}`);
      }
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(`Method call failed: ${msg}`);
    }
    setIsCalling(false);
  };

  if (!activeConnectionId) {
    return (
      <Panel title="Method Caller">
        <EmptyState
          icon={<Zap size={24} />}
          title="No Connection"
          description="Connect to an OPC UA server to call methods"
        />
      </Panel>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-5xl w-full mx-auto space-y-4">
        {/* Method Configuration */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
            <Settings size={14} className="text-iot-cyan" />
            Method Configuration
          </h3>

          <div className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Input
                label="Object Node ID"
                value={objectNodeId}
                onChange={(e) => setObjectNodeId(e.target.value)}
                placeholder="ns=2;s=Object.Path"
                className="font-mono text-xs"
              />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label="Method Node ID"
                    value={methodNodeId}
                    onChange={(e) => setMethodNodeId(e.target.value)}
                    placeholder="ns=2;s=Object.Method"
                    className="font-mono text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDiscover()}
                  loading={isDiscovering}
                  className="flex-shrink-0 mb-px"
                >
                  <Search size={13} />
                  Discover
                </Button>
              </div>
            </div>

            {/* Method Info Badge */}
            {methodInfo && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="info">{methodInfo.display_name}</Badge>
                {methodInfo.description && (
                  <span className="text-2xs text-iot-text-muted">
                    {methodInfo.description}
                  </span>
                )}
                <span className="text-2xs text-iot-text-disabled ml-auto">
                  {methodInfo.input_arguments.length} input
                  {methodInfo.input_arguments.length !== 1 ? "s" : ""},{" "}
                  {methodInfo.output_arguments.length} output
                  {methodInfo.output_arguments.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Input Arguments */}
        {methodInfo && methodInfo.input_arguments.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
              <ArrowRight size={14} className="text-iot-cyan" />
              Input Arguments
            </h3>
            <div className="space-y-1">
              {methodInfo.input_arguments.map((arg, i) => (
                <ArgumentInput
                  key={i}
                  arg={arg}
                  index={i}
                  value={argValues[i] || ""}
                  error={argErrors[i] || ""}
                  onChange={(val) => {
                    const next = [...argValues];
                    next[i] = val;
                    setArgValues(next);
                    if (methodInfo) {
                      const nextErrs = [...argErrors];
                      nextErrs[i] = validateArgumentValue(methodInfo.input_arguments[i], val) || "";
                      setArgErrors(nextErrs);
                    }
                  }}
                />
              ))}
              {argErrors.some(Boolean) && (
                <div className="text-2xs text-iot-amber pt-2">
                  Resolve highlighted argument issues before calling the method.
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Call Button */}
        <Button
          variant="primary"
          size="md"
          onClick={handleCall}
          loading={isCalling}
          disabled={!methodNodeId.trim() || !objectNodeId.trim()}
          className="w-full"
        >
          <Play size={14} />
          Call Method
          {methodInfo?.display_name ? ` \u2014 ${methodInfo.display_name}` : ""}
        </Button>

        {/* Error */}
        {error && (
          <div className="p-3 rounded border bg-iot-red/5 border-iot-red/20">
            <span className="text-xs text-iot-red">{error}</span>
          </div>
        )}

        {/* Result */}
        {result && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
              <Zap size={14} className="text-iot-cyan" />
              Result
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-iot-text-muted">Status:</span>
                <Badge
                  variant={
                    result.status_code === "Good" ? "success" : "danger"
                  }
                >
                  {result.status_code}
                </Badge>
              </div>
              {result.output_arguments.length > 0 && (
                <div>
                  <span className="text-xs text-iot-text-muted mb-1.5 block">
                    Output Arguments:
                  </span>
                  <div className="space-y-1">
                    {result.output_arguments.map((arg, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-iot-bg-base rounded p-2"
                      >
                        <span className="text-2xs text-iot-text-disabled w-4 flex-shrink-0">
                          [{i}]
                        </span>
                        {methodInfo?.output_arguments[i] && (
                          <span className="text-2xs text-iot-text-muted flex-shrink-0">
                            {methodInfo.output_arguments[i].name}:
                          </span>
                        )}
                        <span className="text-xs font-mono text-iot-text-primary">
                          {arg}
                        </span>
                        {methodInfo?.output_arguments[i] && (
                          <Badge
                            variant="info"
                            className="text-2xs ml-auto flex-shrink-0"
                          >
                            {methodInfo.output_arguments[i].data_type}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Call History */}
        {history.length > 0 && (
          <Card className="p-4">
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="text-sm font-semibold text-iot-text-primary flex items-center gap-2">
                <Clock size={14} className="text-iot-cyan" />
                Call History
                <span className="text-2xs text-iot-text-disabled font-normal">
                  ({history.length})
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistory([]);
                  }}
                >
                  <Trash2 size={11} />
                  Clear
                </Button>
                {historyExpanded ? (
                  <ChevronUp size={14} className="text-iot-text-muted" />
                ) : (
                  <ChevronDown size={14} className="text-iot-text-muted" />
                )}
              </div>
            </button>

            {historyExpanded && (
              <div className="mt-3 space-y-1.5">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 text-xs bg-iot-bg-base rounded p-2"
                  >
                    <span className="text-2xs text-iot-text-disabled flex-shrink-0">
                      {entry.timestamp}
                    </span>
                    <span className="text-iot-text-secondary font-medium truncate">
                      {entry.displayName}
                    </span>
                    <Badge
                      variant={
                        entry.statusCode === "Good" ? "success" : "danger"
                      }
                      className="text-2xs flex-shrink-0"
                    >
                      {entry.statusCode}
                    </Badge>
                    {entry.outputArguments.length > 0 && (
                      <span className="text-2xs text-iot-text-muted truncate ml-auto">
                        {entry.outputArguments.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
