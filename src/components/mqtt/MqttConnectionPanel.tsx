import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useMqttTopicStore } from "@/stores/mqttTopicStore";
import { useMqttBrokerStore } from "@/stores/mqttBrokerStore";
import { useAppStore } from "@/stores/appStore";
import { errorMessage } from "@/utils/errors";
import type { MqttMode, MqttProtocolVersion, MqttAuthType, MqttQoS } from "@/types/mqtt";
import {
  Button, Input, Select, Card, Badge, StatusDot, EmptyState, Checkbox, Tooltip,
  WizardContainer, ModeCard, ReviewRow, ReviewSection,
} from "@/components/ui";
import type { WizardStep } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import {
  Server, Trash2, Plus, Save, BookOpen, AlertCircle, Radio, Shield, Wifi,
  ChevronRight, Settings2, Lock,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const PROTOCOL_VERSIONS = [
  { value: "v311", label: "MQTT 3.1.1" },
  { value: "v5", label: "MQTT 5.0" },
];

const AUTH_TYPES = [
  { value: "anonymous", label: "Anonymous" },
  { value: "username_password", label: "Username / Password" },
  { value: "certificate", label: "Certificate (TLS)" },
];

const QOS_OPTIONS = [
  { value: "0", label: "QoS 0 - At most once" },
  { value: "1", label: "QoS 1 - At least once" },
  { value: "2", label: "QoS 2 - Exactly once" },
];

// ─── Saved Profiles ──────────────────────────────────────────────

interface SavedMqttProfile {
  id: string;
  name: string;
  mode: MqttMode;
  host: string;
  port: number;
  protocol_version: MqttProtocolVersion;
  auth_type: MqttAuthType;
  username?: string;
  clean_session: boolean;
  keep_alive_secs?: number;
}

const MQTT_PROFILES_KEY = "iotui_mqtt_profiles";

function loadProfiles(): SavedMqttProfile[] {
  try {
    return JSON.parse(localStorage.getItem(MQTT_PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: SavedMqttProfile[]) {
  localStorage.setItem(MQTT_PROFILES_KEY, JSON.stringify(profiles));
}

// ─── Wizard Step Definitions ─────────────────────────────────────

const CLIENT_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose how you want to use MQTT" },
  { id: "connection", label: "Connection", description: "Configure broker connection details" },
  { id: "auth", label: "Security", description: "Set up authentication and encryption" },
  { id: "advanced", label: "Advanced", description: "Configure session behavior and last will" },
  { id: "review", label: "Review", description: "Review your settings and connect" },
];

const BROKER_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose how you want to use MQTT" },
  { id: "broker", label: "Broker", description: "Configure embedded broker settings" },
  { id: "review", label: "Review", description: "Review your settings and start the broker" },
];

// ─── Component ───────────────────────────────────────────────────

export const MqttConnectionPanel: React.FC = () => {
  const {
    connections, activeConnectionId, isConnecting, error,
    connect, disconnect, setActiveConnection, clearError,
  } = useMqttConnectionStore();
  const { clearAll: clearSubs } = useMqttSubscriptionStore();
  const { clearAll: clearTopics } = useMqttTopicStore();
  const { clearAll: clearBroker } = useMqttBrokerStore();
  const { setActiveView } = useAppStore();

  // ─── View state ────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // ─── Form state ────────────────────────────────────────────────
  const [mode, setMode] = useState<MqttMode>("client");
  const [name, setName] = useState("My MQTT Connection");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("1883");
  const [clientId, setClientId] = useState("");
  const [protocolVersion, setProtocolVersion] = useState<MqttProtocolVersion>("v311");
  const [authType, setAuthType] = useState<MqttAuthType>("anonymous");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepAlive, setKeepAlive] = useState("60");
  const [cleanSession, setCleanSession] = useState(true);
  const [useTls, setUseTls] = useState(false);
  const [caCertPath, setCaCertPath] = useState("");
  const [clientCertPath, setClientCertPath] = useState("");
  const [clientKeyPath, setClientKeyPath] = useState("");
  const [acceptInvalidCerts, setAcceptInvalidCerts] = useState(false);
  const [lwEnabled, setLwEnabled] = useState(false);
  const [lwTopic, setLwTopic] = useState("");
  const [lwPayload, setLwPayload] = useState("");
  const [lwQos, setLwQos] = useState<MqttQoS>("0");
  const [lwRetain, setLwRetain] = useState(false);
  const [brokerBind, setBrokerBind] = useState("0.0.0.0");
  const [brokerMaxConn, setBrokerMaxConn] = useState("100");

  // ─── Profiles & confirm dialogs ────────────────────────────────
  const [profiles, setProfiles] = useState<SavedMqttProfile[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [deleteProfileTarget, setDeleteProfileTarget] = useState<string | null>(null);

  useEffect(() => { setProfiles(loadProfiles()); }, []);

  // ─── Derived ───────────────────────────────────────────────────
  const steps = mode === "broker" ? BROKER_STEPS : CLIENT_STEPS;

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    if (!host.trim()) errors.host = "Host is required";
    const portNum = Number(port);
    if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) errors.port = "Port must be 1-65535";
    return errors;
  }, [name, host, port]);

  const canProceedForStep = useCallback(
    (step: number): boolean => {
      const stepId = steps[step]?.id;
      if (stepId === "mode") return true; // mode is always selected
      if (stepId === "connection") return !validationErrors.name && !validationErrors.host && !validationErrors.port;
      if (stepId === "broker") return !validationErrors.name && !validationErrors.port;
      if (stepId === "auth") return true;
      if (stepId === "advanced") return true;
      if (stepId === "review") return Object.keys(validationErrors).length === 0;
      return true;
    },
    [steps, validationErrors],
  );

  // ─── Handlers ──────────────────────────────────────────────────

  const resetForm = () => {
    setMode("client");
    setName("My MQTT Connection");
    setHost("localhost");
    setPort("1883");
    setClientId("");
    setProtocolVersion("v311");
    setAuthType("anonymous");
    setUsername("");
    setPassword("");
    setKeepAlive("60");
    setCleanSession(true);
    setUseTls(false);
    setCaCertPath("");
    setClientCertPath("");
    setClientKeyPath("");
    setAcceptInvalidCerts(false);
    setLwEnabled(false);
    setLwTopic("");
    setLwPayload("");
    setLwQos("0");
    setLwRetain(false);
    setBrokerBind("0.0.0.0");
    setBrokerMaxConn("100");
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

  const handleModeChange = (newMode: MqttMode) => {
    setMode(newMode);
    // Reset to step 0 when mode changes since steps differ
    setActiveStep(0);
    // Set reasonable defaults per mode
    if (newMode === "broker") {
      setName("Embedded Broker");
      setHost("0.0.0.0");
    } else {
      setName("My MQTT Connection");
      setHost("localhost");
    }
  };

  const handleConnect = async () => {
    try {
      await connect({
        name,
        mode,
        host,
        port: Number(port) || 1883,
        client_id: clientId || null,
        protocol_version: protocolVersion,
        auth_type: authType,
        username: authType === "username_password" ? username : null,
        password: authType === "username_password" ? password : null,
        keep_alive_secs: Number(keepAlive) || 60,
        clean_session: cleanSession,
        tls: useTls ? {
          ca_cert_path: caCertPath || null,
          client_cert_path: clientCertPath || null,
          client_key_path: clientKeyPath || null,
          accept_invalid_certs: acceptInvalidCerts,
        } : null,
        last_will: lwEnabled ? {
          topic: lwTopic,
          payload: lwPayload,
          qos: lwQos,
          retain: lwRetain,
        } : null,
        broker_bind_address: mode === "broker" ? brokerBind : null,
        broker_max_connections: mode === "broker" ? Number(brokerMaxConn) || 100 : null,
      });
      toast.success(
        mode === "broker" ? "Broker Started" : "Connected",
        `${name} (${host}:${port})`
      );
      setShowWizard(false);
      setActiveView("mqtt_explorer");
    } catch (e) {
      toast.error("Connection failed", errorMessage(e) || "Unknown error");
    }
  };

  const handleDisconnect = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (id === activeConnectionId) {
      clearSubs();
      clearTopics();
      clearBroker();
    }
    await disconnect(id);
    toast.info("Disconnected", conn?.name || id);
    setDisconnectTarget(null);
  };

  const handleSelectConnection = (id: string) => {
    setActiveConnection(id);
    clearSubs();
    clearTopics();
    clearBroker();
    setActiveView("mqtt_explorer");
  };

  const handleSaveProfile = () => {
    const profile: SavedMqttProfile = {
      id: `mqtt-profile-${Date.now()}`,
      name, mode, host, port: Number(port) || 1883,
      protocol_version: protocolVersion, auth_type: authType,
      username: authType === "username_password" ? username : undefined,
      clean_session: cleanSession,
      keep_alive_secs: Number(keepAlive) || 60,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    toast.success("Profile saved", name);
  };

  const handleLoadProfile = (profile: SavedMqttProfile) => {
    setMode(profile.mode);
    setName(profile.name);
    setHost(profile.host);
    setPort(String(profile.port));
    setProtocolVersion(profile.protocol_version);
    setAuthType(profile.auth_type);
    setCleanSession(profile.clean_session);
    if (profile.keep_alive_secs) setKeepAlive(String(profile.keep_alive_secs));
    if (profile.username) setUsername(profile.username);
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
              completeLabel={mode === "broker" ? "Start Broker" : "Connect"}
            >
              {/* Step: Mode Selection */}
              {steps[activeStep]?.id === "mode" && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="text-center">
                    <h3 className="text-base font-semibold text-iot-text-primary">
                      Choose Connection Mode
                    </h3>
                    <p className="text-xs text-iot-text-muted mt-1">
                      Connect to an external broker or start an embedded one
                    </p>
                  </div>
                  <div className="flex gap-4 w-full max-w-lg">
                    <ModeCard
                      icon={<Radio size={24} />}
                      title="Client"
                      description="Connect to an external MQTT broker to publish and subscribe to messages"
                      selected={mode === "client"}
                      onClick={() => handleModeChange("client")}
                    />
                    <ModeCard
                      icon={<Server size={24} />}
                      title="Broker"
                      description="Start an embedded MQTT broker that other clients can connect to"
                      selected={mode === "broker"}
                      onClick={() => handleModeChange("broker")}
                    />
                  </div>
                </div>
              )}

              {/* Step: Connection Details (Client) */}
              {steps[activeStep]?.id === "connection" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Input
                    label="Connection Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My MQTT Connection"
                    error={name.trim() === "" ? validationErrors.name : undefined}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Input
                        label="Broker Host"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                        className="font-mono text-xs"
                        error={host.trim() === "" ? validationErrors.host : undefined}
                      />
                    </div>
                    <Input
                      label="Port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="1883"
                      error={validationErrors.port}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Protocol Version"
                      options={PROTOCOL_VERSIONS}
                      value={protocolVersion}
                      onChange={(e) => setProtocolVersion(e.target.value as MqttProtocolVersion)}
                    />
                    <Input
                      label="Client ID (optional)"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Auto-generated"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Step: Authentication & Security (Client) */}
              {steps[activeStep]?.id === "auth" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Select
                    label="Authentication"
                    options={AUTH_TYPES}
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as MqttAuthType)}
                  />
                  {authType === "username_password" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                  )}

                  <div className="pt-2 border-t border-iot-border">
                    <div className="flex items-center gap-2 mb-3">
                      <Checkbox checked={useTls} onChange={setUseTls} label="Enable TLS/SSL" />
                      <Shield size={12} className="text-iot-text-secondary" />
                    </div>
                    {useTls && (
                      <div className="space-y-3 pl-4 border-l-2 border-iot-border">
                        <Input label="CA Certificate Path" value={caCertPath} onChange={(e) => setCaCertPath(e.target.value)} placeholder="/path/to/ca.pem" className="font-mono text-xs" />
                        <Input label="Client Certificate Path" value={clientCertPath} onChange={(e) => setClientCertPath(e.target.value)} placeholder="/path/to/client.pem" className="font-mono text-xs" />
                        <Input label="Client Key Path" value={clientKeyPath} onChange={(e) => setClientKeyPath(e.target.value)} placeholder="/path/to/client.key" className="font-mono text-xs" />
                        <Checkbox checked={acceptInvalidCerts} onChange={setAcceptInvalidCerts} label="Accept invalid certificates (insecure)" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Advanced Settings (Client) */}
              {steps[activeStep]?.id === "advanced" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Keep Alive (seconds)"
                      type="number"
                      value={keepAlive}
                      onChange={(e) => setKeepAlive(e.target.value)}
                      min="5"
                      max="65535"
                    />
                    <div className="flex items-end pb-0.5">
                      <Checkbox checked={cleanSession} onChange={setCleanSession} label="Clean Session" />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-iot-border">
                    <div className="flex items-center gap-2 mb-3">
                      <Checkbox checked={lwEnabled} onChange={setLwEnabled} label="Last Will & Testament" />
                    </div>
                    {lwEnabled && (
                      <div className="space-y-3 pl-4 border-l-2 border-iot-border">
                        <Input label="Topic" value={lwTopic} onChange={(e) => setLwTopic(e.target.value)} placeholder="device/status" />
                        <Input label="Payload" value={lwPayload} onChange={(e) => setLwPayload(e.target.value)} placeholder="offline" />
                        <div className="grid grid-cols-2 gap-3">
                          <Select label="QoS" options={QOS_OPTIONS} value={lwQos} onChange={(e) => setLwQos(e.target.value as MqttQoS)} />
                          <div className="flex items-end pb-0.5">
                            <Checkbox checked={lwRetain} onChange={setLwRetain} label="Retain" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Broker Settings */}
              {steps[activeStep]?.id === "broker" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Input
                    label="Broker Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Embedded Broker"
                    error={name.trim() === "" ? validationErrors.name : undefined}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Bind Address"
                      value={brokerBind}
                      onChange={(e) => setBrokerBind(e.target.value)}
                      placeholder="0.0.0.0"
                      className="font-mono text-xs"
                    />
                    <Input
                      label="Port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="1883"
                      error={validationErrors.port}
                    />
                  </div>
                  <Input
                    label="Max Connections"
                    type="number"
                    value={brokerMaxConn}
                    onChange={(e) => setBrokerMaxConn(e.target.value)}
                    placeholder="100"
                  />
                  <div className="p-3 rounded-lg bg-iot-bg-base border border-iot-border">
                    <p className="text-xs text-iot-text-muted leading-relaxed">
                      The embedded broker will listen on <span className="font-mono text-iot-text-secondary">{brokerBind}:{port}</span>.
                      External clients can connect, publish, and subscribe.
                    </p>
                  </div>
                </div>
              )}

              {/* Step: Review */}
              {steps[activeStep]?.id === "review" && (
                <div className="space-y-4 max-w-md mx-auto">
                  {mode === "client" ? (
                    <>
                      <ReviewSection title="Connection" icon={<Wifi size={12} />} onEdit={() => goToStep(1)}>
                        <ReviewRow label="Name" value={name} />
                        <ReviewRow label="Host" value={`${host}:${port}`} />
                        <ReviewRow label="Protocol" value={protocolVersion === "v5" ? "MQTT 5.0" : "MQTT 3.1.1"} />
                        {clientId && <ReviewRow label="Client ID" value={clientId} />}
                      </ReviewSection>
                      <ReviewSection title="Security" icon={<Lock size={12} />} onEdit={() => goToStep(2)}>
                        <ReviewRow label="Authentication" value={authType === "anonymous" ? "Anonymous" : authType === "username_password" ? `Username (${username})` : "Certificate"} />
                        <ReviewRow label="TLS" value={useTls ? "Enabled" : "Disabled"} />
                      </ReviewSection>
                      <ReviewSection title="Advanced" icon={<Settings2 size={12} />} onEdit={() => goToStep(3)}>
                        <ReviewRow label="Keep Alive" value={`${keepAlive}s`} />
                        <ReviewRow label="Clean Session" value={cleanSession ? "Yes" : "No"} />
                        <ReviewRow label="Last Will" value={lwEnabled ? lwTopic : "Disabled"} />
                      </ReviewSection>
                    </>
                  ) : (
                    <ReviewSection title="Broker Configuration" icon={<Server size={12} />} onEdit={() => goToStep(1)}>
                      <ReviewRow label="Name" value={name} />
                      <ReviewRow label="Bind Address" value={`${brokerBind}:${port}`} />
                      <ReviewRow label="Max Connections" value={brokerMaxConn} />
                    </ReviewSection>
                  )}

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
            <Radio size={28} className="text-iot-cyan" />
          </div>
          <h1 className="text-xl font-bold text-iot-text-primary">MQTT Connections</h1>
          <p className="text-xs text-iot-text-muted mt-1.5 max-w-sm mx-auto">
            Connect to an external broker or start an embedded broker
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
                icon={<Server size={28} />}
                title="No Active Connections"
                description="Create a new connection to get started with MQTT"
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
                        <Badge variant={conn.mode === "broker" ? "default" : "success"}>
                          {conn.mode.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-2xs font-mono text-iot-text-muted truncate">
                      {conn.host}:{conn.port}
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
                    {profile.mode === "broker" ? <Server size={14} className="text-iot-text-muted" /> : <Radio size={14} className="text-iot-text-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-iot-text-primary truncate">{profile.name}</p>
                    <p className="text-2xs font-mono text-iot-text-disabled truncate">
                      {profile.host}:{profile.port} &middot; {profile.mode}
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
        }"? Active subscriptions will be lost.`}
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
