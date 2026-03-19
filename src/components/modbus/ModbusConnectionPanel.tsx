import React, { useState, useMemo, useCallback } from "react";
import { useModbusConnectionStore } from "@/stores/modbusConnectionStore";
import { useModbusMonitorStore } from "@/stores/modbusMonitorStore";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { errorMessage } from "@/utils/errors";
import {
  Button, Input, Card, Badge, StatusDot, EmptyState, Tooltip,
  WizardContainer, ModeCard, ReviewRow, ReviewSection,
} from "@/components/ui";
import type { WizardStep } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import {
  Cpu, Trash2, Plus, Save, BookOpen, AlertCircle, Wifi,
  ChevronRight, Settings2, Server,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose simulator or live device" },
  { id: "connection", label: "Connection", description: "Configure Modbus TCP connection" },
  { id: "review", label: "Review", description: "Review your settings and connect" },
];

const SIMULATOR_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose simulator or live device" },
  { id: "review", label: "Review", description: "Review your settings and connect" },
];

// ─── Saved Profiles ──────────────────────────────────────────────

interface SavedModbusProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  unit_id: number;
  use_simulator: boolean;
  timeout_ms?: number;
}

const MODBUS_PROFILES_KEY = "iotui_modbus_profiles";

function loadProfiles(): SavedModbusProfile[] {
  try {
    return JSON.parse(localStorage.getItem(MODBUS_PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: SavedModbusProfile[]) {
  localStorage.setItem(MODBUS_PROFILES_KEY, JSON.stringify(profiles));
}

// ─── Component ───────────────────────────────────────────────────

export const ModbusConnectionPanel: React.FC = () => {
  const {
    connections, activeConnectionId, isConnecting, error,
    connect, disconnect, setActiveConnection, clearError,
  } = useModbusConnectionStore();
  const { clearAll: clearMonitors } = useModbusMonitorStore();
  const { setActiveView } = useAppStore();
  const defaultUnitId = useSettingsStore((s) => s.modbusDefaultUnitId);
  const defaultTimeout = useSettingsStore((s) => s.modbusRequestTimeout);

  // ─── View state ────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // ─── Form state ────────────────────────────────────────────────
  const [useSimulator, setUseSimulator] = useState(true);
  const [name, setName] = useState("Modbus Simulator");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("502");
  const [unitId, setUnitId] = useState(String(defaultUnitId));
  const [timeoutMs, setTimeoutMs] = useState(String(defaultTimeout));

  // ─── Profiles & confirm dialogs ────────────────────────────────
  const [profiles, setProfiles] = useState<SavedModbusProfile[]>(loadProfiles);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [deleteProfileTarget, setDeleteProfileTarget] = useState<string | null>(null);

  // ─── Derived ───────────────────────────────────────────────────
  const steps = useSimulator ? SIMULATOR_STEPS : WIZARD_STEPS;

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    if (!useSimulator) {
      if (!host.trim()) errors.host = "Host is required";
      const portNum = Number(port);
      if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) errors.port = "Port must be 1-65535";
      const uid = Number(unitId);
      if (isNaN(uid) || uid < 0 || uid > 247) errors.unitId = "Unit ID must be 0-247";
    }
    return errors;
  }, [name, host, port, unitId, useSimulator]);

  const canProceedForStep = useCallback(
    (step: number): boolean => {
      const stepId = steps[step]?.id;
      if (stepId === "mode") return true;
      if (stepId === "connection") return !validationErrors.name && !validationErrors.host && !validationErrors.port && !validationErrors.unitId;
      if (stepId === "review") return Object.keys(validationErrors).length === 0;
      return true;
    },
    [steps, validationErrors],
  );

  // ─── Handlers ──────────────────────────────────────────────────

  const resetForm = () => {
    setUseSimulator(true);
    setName("Modbus Simulator");
    setHost("localhost");
    setPort("502");
    setUnitId(String(defaultUnitId));
    setTimeoutMs(String(defaultTimeout));
    setActiveStep(0);
  };

  const handleOpenWizard = () => {
    resetForm();
    clearError();
    setShowWizard(true);
  };

  const handleCancelWizard = () => {
    setShowWizard(false);
    resetForm();
  };

  const handleModeChange = (sim: boolean) => {
    setUseSimulator(sim);
    setActiveStep(0);
    if (sim) {
      setName("Modbus Simulator");
    } else {
      setName("My Modbus Device");
    }
  };

  const handleConnect = async () => {
    try {
      await connect({
        name,
        host: useSimulator ? "localhost" : host,
        port: useSimulator ? 502 : Number(port) || 502,
        unit_id: Number(unitId) || 1,
        use_simulator: useSimulator,
        timeout_ms: Number(timeoutMs) || undefined,
      });
      toast.success("Connected", `${name}`);
      setShowWizard(false);
      setActiveView("modbus_registers");
    } catch (e) {
      toast.error("Connection failed", errorMessage(e) || "Unknown error");
    }
  };

  const handleDisconnect = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    try {
      if (id === activeConnectionId) {
        clearMonitors();
      }
      await disconnect(id);
      toast.info("Disconnected", conn?.name || id);
    } catch (err) {
      toast.error("Disconnect Failed", errorMessage(err));
    } finally {
      setDisconnectTarget(null);
    }
  };

  const handleSelectConnection = (id: string) => {
    setActiveConnection(id);
    clearMonitors();
    setActiveView("modbus_registers");
  };

  const handleSaveProfile = () => {
    const profile: SavedModbusProfile = {
      id: `modbus-profile-${Date.now()}`,
      name,
      host: useSimulator ? "localhost" : host,
      port: useSimulator ? 502 : Number(port) || 502,
      unit_id: Number(unitId) || 1,
      use_simulator: useSimulator,
      timeout_ms: Number(timeoutMs) || undefined,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    toast.success("Profile saved", name);
  };

  const handleLoadProfile = (profile: SavedModbusProfile) => {
    setUseSimulator(profile.use_simulator);
    setName(profile.name);
    setHost(profile.host);
    setPort(String(profile.port));
    setUnitId(String(profile.unit_id));
    if (profile.timeout_ms) setTimeoutMs(String(profile.timeout_ms));
    setActiveStep(0);
    setShowWizard(true);
    toast.info("Profile loaded", profile.name);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    saveProfiles(updated);
  };

  const goToStep = (stepIndex: number) => setActiveStep(stepIndex);

  // ─── Wizard Rendering ──────────────────────────────────────────

  if (showWizard) {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center p-4">
        <div className="max-w-2xl w-full h-full max-h-[640px]">
          <Card className="h-full flex flex-col overflow-hidden">
            <WizardContainer
              steps={steps}
              activeStep={activeStep}
              onNext={() => setActiveStep((s) => Math.min(s + 1, steps.length - 1))}
              onBack={() => setActiveStep((s) => Math.max(s - 1, 0))}
              onCancel={handleCancelWizard}
              onComplete={handleConnect}
              canProceed={canProceedForStep(activeStep)}
              isCompleting={isConnecting}
              completeLabel="Connect"
            >
              {/* Step: Mode Selection */}
              {steps[activeStep]?.id === "mode" && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-iot-text-primary">
                      Choose Connection Mode
                    </h3>
                    <p className="text-xs text-iot-text-muted mt-1">
                      Use the built-in simulator or connect to a live Modbus device
                    </p>
                  </div>
                  <div className="flex gap-4 w-full max-w-lg">
                    <ModeCard
                      icon={<Cpu size={24} />}
                      title="Simulator"
                      description="Built-in Modbus device with pre-populated industrial register data and live simulation"
                      selected={useSimulator}
                      onClick={() => handleModeChange(true)}
                    />
                    <ModeCard
                      icon={<Server size={24} />}
                      title="Live Device"
                      description="Connect to a real Modbus TCP device or PLC on your network"
                      selected={!useSimulator}
                      onClick={() => handleModeChange(false)}
                    />
                  </div>
                </div>
              )}

              {/* Step: Connection Details (Live device) */}
              {steps[activeStep]?.id === "connection" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Input
                    label="Connection Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Modbus Device"
                    error={name.trim() === "" ? validationErrors.name : undefined}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Input
                        label="Device Host / IP"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="192.168.1.100"
                        className="font-mono text-xs"
                        error={host.trim() === "" ? validationErrors.host : undefined}
                      />
                    </div>
                    <Input
                      label="Port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="502"
                      error={validationErrors.port}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Unit ID (Slave Address)"
                      type="number"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      placeholder="1"
                      min="0"
                      max="247"
                      error={validationErrors.unitId}
                    />
                    <Input
                      label="Timeout (ms)"
                      type="number"
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(e.target.value)}
                      placeholder="3000"
                      min="500"
                      max="30000"
                    />
                  </div>
                </div>
              )}

              {/* Step: Review */}
              {steps[activeStep]?.id === "review" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <ReviewSection
                    title="Connection"
                    icon={<Wifi size={12} />}
                    onEdit={() => goToStep(useSimulator ? 0 : 1)}
                  >
                    <ReviewRow label="Name" value={name} />
                    <ReviewRow label="Mode" value={useSimulator ? "Simulator" : "Live Device"} />
                    {!useSimulator && (
                      <>
                        <ReviewRow label="Host" value={`${host}:${port}`} />
                        <ReviewRow label="Unit ID" value={unitId} />
                      </>
                    )}
                  </ReviewSection>
                  <ReviewSection
                    title="Settings"
                    icon={<Settings2 size={12} />}
                    onEdit={() => goToStep(useSimulator ? 0 : 1)}
                  >
                    <ReviewRow label="Timeout" value={`${timeoutMs}ms`} />
                  </ReviewSection>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-iot-red/10 border border-iot-red/20">
                      <AlertCircle size={14} className="text-iot-red flex-shrink-0" />
                      <span className="text-xs text-iot-red flex-1">{error}</span>
                      <button onClick={clearError} className="text-iot-red hover:text-iot-red/80">
                        <span className="text-xs">&times;</span>
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Tooltip content="Save current settings as a reusable profile">
                      <Button variant="ghost" size="sm" onClick={handleSaveProfile}>
                        <Save size={14} />
                        Save as Profile
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </WizardContainer>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Landing Page ──────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto p-4 flex items-center justify-center">
      <div className="max-w-3xl w-full space-y-6">
        {/* Hero */}
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-iot-cyan/10 border border-iot-cyan/20 mb-4">
            <Cpu size={28} className="text-iot-cyan" />
          </div>
          <h1 className="text-xl font-bold text-iot-text-primary">Modbus Connections</h1>
          <p className="text-xs text-iot-text-muted mt-1.5 max-w-sm mx-auto">
            Connect to a Modbus TCP device or use the built-in simulator
          </p>
          <Button variant="primary" size="md" onClick={handleOpenWizard} className="mt-5">
            <Plus size={14} />
            New Connection
          </Button>
        </div>

        {/* Active Connections */}
        <div>
          <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
            <Wifi size={14} className="text-iot-cyan" />
            Active Connections
            {connections.length > 0 && <Badge variant="success">{connections.length}</Badge>}
          </h3>
          {connections.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                icon={<Cpu size={28} />}
                title="No Active Connections"
                description="Create a new connection to get started with Modbus"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {connections.map((conn) => (
                <Card
                  key={conn.id}
                  interactive
                  className={`p-4 cursor-pointer transition-all ${
                    conn.id === activeConnectionId
                      ? "ring-1 ring-iot-cyan/30 bg-iot-cyan/5"
                      : ""
                  }`}
                >
                  <div onClick={() => handleSelectConnection(conn.id)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot
                          status={
                            conn.status === "connected" ? "connected"
                            : conn.status === "error" ? "error"
                            : "warning"
                          }
                        />
                        <span className="text-sm font-medium text-iot-text-primary truncate">{conn.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant={conn.status === "connected" ? "success" : conn.status === "error" ? "danger" : "warning"}>
                          {conn.status}
                        </Badge>
                        {conn.is_simulator && (
                          <Badge variant="default">SIM</Badge>
                        )}
                        <Badge variant="default">UID {conn.unit_id}</Badge>
                      </div>
                    </div>
                    <p className="text-2xs font-mono text-iot-text-muted truncate">
                      {conn.host}:{conn.port} (Unit {conn.unit_id})
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-iot-border">
                    <button
                      onClick={() => handleSelectConnection(conn.id)}
                      className="text-2xs text-iot-cyan hover:text-iot-cyan/80 transition-colors flex items-center gap-1"
                    >
                      Open <ChevronRight size={10} />
                    </button>
                    <Tooltip content="Disconnect">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDisconnectTarget(conn.id); }}
                        className="text-iot-text-disabled hover:text-iot-red transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Saved Profiles */}
        {profiles.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
              <BookOpen size={14} className="text-iot-cyan" />
              Saved Profiles
              <Badge>{profiles.length}</Badge>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-iot-bg-surface border border-iot-border hover:border-iot-border-light transition-colors cursor-pointer group"
                  onClick={() => handleLoadProfile(profile)}
                >
                  <div className="w-8 h-8 rounded-lg bg-iot-bg-base flex items-center justify-center flex-shrink-0">
                    {profile.use_simulator
                      ? <Cpu size={14} className="text-iot-text-muted" />
                      : <Server size={14} className="text-iot-text-muted" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-iot-text-primary truncate">{profile.name}</p>
                    <p className="text-2xs font-mono text-iot-text-disabled truncate">
                      {profile.use_simulator ? "Simulator" : `${profile.host}:${profile.port}`} &middot; Unit {profile.unit_id}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteProfileTarget(profile.id); }}
                    className="text-iot-text-disabled hover:text-iot-red transition-colors opacity-0 group-hover:opacity-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={() => disconnectTarget && handleDisconnect(disconnectTarget)}
        title="Disconnect"
        message={`Are you sure you want to disconnect from "${
          connections.find((c) => c.id === disconnectTarget)?.name || "this connection"
        }"? Active monitors will be lost.`}
        confirmLabel="Disconnect"
        danger
      />
      <ConfirmDialog
        open={!!deleteProfileTarget}
        onClose={() => setDeleteProfileTarget(null)}
        onConfirm={() => {
          if (deleteProfileTarget) handleDeleteProfile(deleteProfileTarget);
          setDeleteProfileTarget(null);
        }}
        title="Delete Profile"
        message={`Are you sure you want to delete "${
          profiles.find((p) => p.id === deleteProfileTarget)?.name || "this profile"
        }"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
