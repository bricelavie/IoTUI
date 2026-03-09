import React, { useState, useEffect } from "react";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { useMqttSubscriptionStore } from "@/stores/mqttSubscriptionStore";
import { useMqttTopicStore } from "@/stores/mqttTopicStore";
import { useMqttBrokerStore } from "@/stores/mqttBrokerStore";
import { useAppStore } from "@/stores/appStore";
import { errorMessage } from "@/types/opcua";
import type { MqttMode, MqttProtocolVersion, MqttAuthType, MqttQoS } from "@/types/mqtt";
import { Button, Input, Select, Card, Badge, StatusDot, EmptyState, Checkbox, Tooltip } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import {
  Zap,
  Server,
  Trash2,
  Plus,
  Save,
  BookOpen,
  AlertCircle,
  Radio,
  MonitorSmartphone,
  Shield,
  Wifi,
} from "lucide-react";

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

// ─── Saved profiles (localStorage) ──────────────────────────────

interface SavedMqttProfile {
  id: string;
  name: string;
  mode: MqttMode;
  host: string;
  port: number;
  protocol_version: MqttProtocolVersion;
  auth_type: MqttAuthType;
  username?: string;
  use_simulator: boolean;
  clean_session: boolean;
  keep_alive_secs?: number;
}

const MQTT_PROFILES_KEY = "iotui_mqtt_profiles";
const MQTT_DRAFT_KEY = "iotui_mqtt_connection_draft_v1";

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

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(MQTT_DRAFT_KEY) || "null") as Partial<SavedMqttProfile> | null;
  } catch {
    return null;
  }
}

export const MqttConnectionPanel: React.FC = () => {
  const {
    connections,
    activeConnectionId,
    isConnecting,
    error,
    connect,
    disconnect,
    setActiveConnection,
    clearError,
  } = useMqttConnectionStore();
  const { clearAll: clearSubs } = useMqttSubscriptionStore();
  const { clearAll: clearTopics } = useMqttTopicStore();
  const { clearAll: clearBroker } = useMqttBrokerStore();
  const { setActiveView } = useAppStore();

  // Form state
  const [name, setName] = useState("Local Broker");
  const [mode, setMode] = useState<MqttMode>("client");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("1883");
  const [clientId, setClientId] = useState("");
  const [protocolVersion, setProtocolVersion] = useState<MqttProtocolVersion>("v311");
  const [authType, setAuthType] = useState<MqttAuthType>("anonymous");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepAlive, setKeepAlive] = useState("60");
  const [cleanSession, setCleanSession] = useState(true);
  const [useSimulator, setUseSimulator] = useState(false);
  const [useTls, setUseTls] = useState(false);
  const [caCertPath, setCaCertPath] = useState("");
  const [clientCertPath, setClientCertPath] = useState("");
  const [clientKeyPath, setClientKeyPath] = useState("");
  const [acceptInvalidCerts, setAcceptInvalidCerts] = useState(false);

  // Last Will
  const [lwEnabled, setLwEnabled] = useState(false);
  const [lwTopic, setLwTopic] = useState("");
  const [lwPayload, setLwPayload] = useState("");
  const [lwQos, setLwQos] = useState<MqttQoS>("0");
  const [lwRetain, setLwRetain] = useState(false);

  // Broker-specific
  const [brokerBind, setBrokerBind] = useState("0.0.0.0");
  const [brokerMaxConn, setBrokerMaxConn] = useState("100");

  // Profiles
  const [profiles, setProfiles] = useState<SavedMqttProfile[]>([]);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [deleteProfileTarget, setDeleteProfileTarget] = useState<string | null>(null);

  // Validation
  const validationErrors = React.useMemo(() => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    if (!host.trim()) errors.host = "Host is required";
    const portNum = Number(port);
    if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) errors.port = "Port must be 1-65535";
    return errors;
  }, [name, host, port]);

  useEffect(() => {
    setProfiles(loadProfiles());
    const draft = loadDraft();
    if (draft) {
      if (draft.name) setName(draft.name);
      if (draft.mode) setMode(draft.mode);
      if (draft.host) setHost(draft.host);
      if (draft.port) setPort(String(draft.port));
      if (draft.protocol_version) setProtocolVersion(draft.protocol_version);
      if (draft.auth_type) setAuthType(draft.auth_type);
      if (draft.username) setUsername(draft.username);
      if (typeof draft.use_simulator === "boolean") setUseSimulator(draft.use_simulator);
      if (typeof draft.clean_session === "boolean") setCleanSession(draft.clean_session);
      if (draft.keep_alive_secs) setKeepAlive(String(draft.keep_alive_secs));
    }
  }, []);

  // Persist draft
  useEffect(() => {
    localStorage.setItem(
      MQTT_DRAFT_KEY,
      JSON.stringify({
        name, mode, host, port: Number(port), protocol_version: protocolVersion,
        auth_type: authType, username, use_simulator: useSimulator,
        clean_session: cleanSession, keep_alive_secs: Number(keepAlive) || 60,
      })
    );
  }, [name, mode, host, port, protocolVersion, authType, username, useSimulator, cleanSession, keepAlive]);

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
        use_simulator: useSimulator,
        broker_bind_address: mode === "broker" ? brokerBind : null,
        broker_max_connections: mode === "broker" ? Number(brokerMaxConn) || 100 : null,
      });
      toast.success("Connected", `${name} (${host}:${port})`);
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
      use_simulator: useSimulator, clean_session: cleanSession,
      keep_alive_secs: Number(keepAlive) || 60,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    toast.success("Profile saved", name);
  };

  const handleLoadProfile = (profile: SavedMqttProfile) => {
    setName(profile.name);
    setMode(profile.mode);
    setHost(profile.host);
    setPort(String(profile.port));
    setProtocolVersion(profile.protocol_version);
    setAuthType(profile.auth_type);
    setUseSimulator(profile.use_simulator);
    setCleanSession(profile.clean_session);
    if (profile.keep_alive_secs) setKeepAlive(String(profile.keep_alive_secs));
    if (profile.username) setUsername(profile.username);
    toast.info("Profile loaded", profile.name);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    saveProfiles(updated);
  };

  return (
    <div className="h-full overflow-auto p-4 flex items-center justify-center">
      <div className="max-w-5xl w-full space-y-4">
        {/* Hero */}
        <div className="text-center py-6">
          <h1 className="text-xl font-bold text-iot-text-primary">MQTT Connection</h1>
          <p className="text-xs text-iot-text-muted mt-1">
            Connect to an MQTT broker, start an embedded broker, or use the simulator
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Connection form */}
          <Card className="p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
              <Plus size={14} className="text-iot-cyan" />
              New Connection
            </h3>
            <div className="space-y-3">
              {/* Backend Mode Toggle */}
              <div>
                <label className="text-xs text-iot-text-muted font-medium mb-1.5 block">
                  Backend Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUseSimulator(true)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      useSimulator
                        ? "bg-iot-cyan/10 border-iot-cyan/40 text-iot-cyan"
                        : "bg-iot-bg-base border-iot-border text-iot-text-muted hover:border-iot-border-light"
                    }`}
                  >
                    <MonitorSmartphone size={14} />
                    Simulator
                  </button>
                  <button
                    onClick={() => { setUseSimulator(false); setMode("client"); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      !useSimulator && mode === "client"
                        ? "bg-iot-green/10 border-iot-green/40 text-iot-green"
                        : "bg-iot-bg-base border-iot-border text-iot-text-muted hover:border-iot-border-light"
                    }`}
                  >
                    <Radio size={14} />
                    Client
                  </button>
                  <button
                    onClick={() => { setUseSimulator(false); setMode("broker"); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      !useSimulator && mode === "broker"
                        ? "bg-iot-purple/10 border-iot-purple/40 text-iot-purple"
                        : "bg-iot-bg-base border-iot-border text-iot-text-muted hover:border-iot-border-light"
                    }`}
                  >
                    <Server size={14} />
                    Broker
                  </button>
                </div>
              </div>

              <Input
                label="Connection Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My MQTT Broker"
                error={name.trim() === "" ? validationErrors.name : undefined}
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input
                    label="Host"
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
                  <Checkbox
                    checked={cleanSession}
                    onChange={setCleanSession}
                    label="Clean Session"
                  />
                </div>
              </div>

              {/* Auth */}
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

              {/* TLS */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={useTls}
                  onChange={setUseTls}
                  label="Enable TLS/SSL"
                />
                <Shield size={12} className="text-iot-text-secondary" />
              </div>
              {useTls && (
                <div className="space-y-2 pl-4 border-l-2 border-iot-border">
                  <Input label="CA Certificate Path" value={caCertPath} onChange={(e) => setCaCertPath(e.target.value)} placeholder="/path/to/ca.pem" className="font-mono text-xs" />
                  <Input label="Client Certificate Path" value={clientCertPath} onChange={(e) => setClientCertPath(e.target.value)} placeholder="/path/to/client.pem" className="font-mono text-xs" />
                  <Input label="Client Key Path" value={clientKeyPath} onChange={(e) => setClientKeyPath(e.target.value)} placeholder="/path/to/client.key" className="font-mono text-xs" />
                  <Checkbox
                    checked={acceptInvalidCerts}
                    onChange={setAcceptInvalidCerts}
                    label="Accept invalid certificates (insecure)"
                  />
                </div>
              )}

              {/* Last Will */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={lwEnabled}
                  onChange={setLwEnabled}
                  label="Last Will & Testament"
                />
              </div>
              {lwEnabled && (
                <div className="space-y-2 pl-4 border-l-2 border-iot-border">
                  <Input label="Topic" value={lwTopic} onChange={(e) => setLwTopic(e.target.value)} placeholder="device/status" />
                  <Input label="Payload" value={lwPayload} onChange={(e) => setLwPayload(e.target.value)} placeholder="offline" />
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="QoS" options={QOS_OPTIONS} value={lwQos} onChange={(e) => setLwQos(e.target.value as MqttQoS)} />
                    <div className="flex items-end pb-0.5">
                      <Checkbox
                        checked={lwRetain}
                        onChange={setLwRetain}
                        label="Retain"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Broker-specific */}
              {mode === "broker" && !useSimulator && (
                <div className="space-y-2 p-3 rounded-lg bg-iot-bg-base border border-iot-border">
                  <span className="text-xs text-iot-text-muted font-medium">Broker Settings</span>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Bind Address" value={brokerBind} onChange={(e) => setBrokerBind(e.target.value)} placeholder="0.0.0.0" className="font-mono text-xs" />
                    <Input label="Max Connections" type="number" value={brokerMaxConn} onChange={(e) => setBrokerMaxConn(e.target.value)} />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-2 rounded bg-iot-red/10 border border-iot-red/20">
                  <AlertCircle size={14} className="text-iot-red flex-shrink-0" />
                  <span className="text-xs text-iot-red flex-1">{error}</span>
                  <button onClick={clearError} className="text-iot-red hover:text-iot-red/80">
                    <span className="text-xs">&times;</span>
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="primary" size="md" onClick={handleConnect} loading={isConnecting} className="flex-1" disabled={Object.keys(validationErrors).length > 0}>
                  <Zap size={14} />
                  Connect
                </Button>
                <Tooltip content="Save as profile">
                  <Button variant="secondary" size="md" onClick={handleSaveProfile}>
                    <Save size={14} />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </Card>

          {/* Right column */}
          <div className="space-y-4">
            {/* Saved Profiles */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
                <BookOpen size={14} className="text-iot-cyan" />
                Saved Profiles
                {profiles.length > 0 && <Badge>{profiles.length}</Badge>}
              </h3>
              {profiles.length === 0 ? (
                <p className="text-xs text-iot-text-muted text-center py-4">No saved profiles yet</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-auto">
                  {profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-2 p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors cursor-pointer group"
                      onClick={() => handleLoadProfile(profile)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-iot-text-primary truncate">{profile.name}</p>
                        <p className="text-2xs font-mono text-iot-text-disabled truncate">
                          {profile.host}:{profile.port} ({profile.mode})
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
              )}
            </Card>

            {/* Active connections */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
                <Wifi size={14} className="text-iot-cyan" />
                Active Connections
                {connections.length > 0 && <Badge variant="success">{connections.length}</Badge>}
              </h3>
              {connections.length === 0 ? (
                <EmptyState icon={<Server size={24} />} title="No Connections" description="Connect to get started" />
              ) : (
                <div className="space-y-2">
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        conn.id === activeConnectionId
                          ? "bg-iot-cyan/5 border-iot-cyan/30 glow-cyan"
                          : "bg-iot-bg-base border-iot-border hover:border-iot-border-light"
                      }`}
                      onClick={() => handleSelectConnection(conn.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusDot
                            status={
                              conn.status === "connected" ? "connected"
                              : conn.status === "error" ? "error"
                              : "warning"
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-iot-text-primary truncate">{conn.name}</p>
                            <p className="text-2xs font-mono text-iot-text-muted truncate">
                              {conn.host}:{conn.port} ({conn.mode})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant={conn.status === "connected" ? "success" : conn.status === "error" ? "danger" : "warning"}>
                            {conn.status}
                          </Badge>
                          <Badge variant={conn.is_simulator ? "info" : conn.mode === "broker" ? "default" : "success"}>
                            {conn.is_simulator ? "SIM" : conn.mode === "broker" ? "BROKER" : "LIVE"}
                          </Badge>
                          <Tooltip content="Disconnect">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDisconnectTarget(conn.id); }}
                              className="text-iot-text-disabled hover:text-iot-red transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iot-border-focus"
                            >
                              <Trash2 size={12} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={() => disconnectTarget && handleDisconnect(disconnectTarget)}
        title="Disconnect"
        message={`Are you sure you want to disconnect from "${
          connections.find((c) => c.id === disconnectTarget)?.name || "this broker"
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
