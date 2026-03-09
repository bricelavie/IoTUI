import React, { useState, useEffect } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useBrowserStore } from "@/stores/browserStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { errorMessage } from "@/types/opcua";
import { Button, Input, Select, Card, Badge, StatusDot, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import {
  Zap,
  Search,
  Server,
  Shield,
  Trash2,
  Plus,
  Save,
  BookOpen,
  Clock,
  AlertCircle,
  FileKey,
  Radio,
  MonitorSmartphone,
} from "lucide-react";

const SECURITY_POLICIES = [
  { value: "None", label: "None" },
  { value: "Basic128Rsa15", label: "Basic128Rsa15" },
  { value: "Basic256", label: "Basic256" },
  { value: "Basic256Sha256", label: "Basic256Sha256" },
  { value: "Aes128_Sha256_RsaOaep", label: "Aes128-Sha256-RsaOaep" },
  { value: "Aes256_Sha256_RsaPss", label: "Aes256-Sha256-RsaPss" },
];

const SECURITY_MODES = [
  { value: "None", label: "None" },
  { value: "Sign", label: "Sign" },
  { value: "SignAndEncrypt", label: "Sign & Encrypt" },
];

const AUTH_TYPES = [
  { value: "anonymous", label: "Anonymous" },
  { value: "username_password", label: "Username / Password" },
  { value: "certificate", label: "Certificate (not yet supported)", disabled: true },
];

// ─── Saved profiles (localStorage) ──────────────────────────────

interface SavedProfile {
  id: string;
  name: string;
  endpoint_url: string;
  security_policy: string;
  security_mode: string;
  auth_type: "anonymous" | "username_password" | "certificate";
  username?: string;
  session_timeout?: number;
  use_simulator?: boolean;
}

const LAST_DRAFT_KEY = "iotui_connection_draft_v1";

const PROFILES_KEY = "iotui_saved_profiles";
const RECENT_KEY = "iotui_recent_endpoints";

function loadProfiles(): SavedProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: SavedProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function loadRecentEndpoints(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecentEndpoint(url: string) {
  const recents = loadRecentEndpoints().filter((u) => u !== url);
  recents.unshift(url);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, 10)));
}

function isValidOpcUrl(url: string): boolean {
  return url.startsWith("opc.tcp://") && url.length > 10;
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(LAST_DRAFT_KEY) || "null") as Partial<SavedProfile> | null;
  } catch {
    return null;
  }
}

export const ConnectionPanel: React.FC = () => {
  const {
    connections,
    activeConnectionId,
    endpoints,
    isConnecting,
    isDiscovering,
    error,
    discover,
    connect,
    disconnect,
    setActiveConnection,
    clearError,
  } = useConnectionStore();
  const { loadRootNodes, reset: resetBrowser } = useBrowserStore();
  const { clearAll: clearSubs } = useSubscriptionStore();
  const { setActiveView } = useAppStore();

  const [endpointUrl, setEndpointUrl] = useState("opc.tcp://localhost:4840");
  const [name, setName] = useState("Local Server");
  const [secPolicy, setSecPolicy] = useState("None");
  const [secMode, setSecMode] = useState("None");
  const [authType, setAuthType] = useState<"anonymous" | "username_password" | "certificate">("anonymous");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [certPath, setCertPath] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [sessionTimeout, setSessionTimeout] = useState("60000");
  const [urlError, setUrlError] = useState("");
  const [useSimulator, setUseSimulator] = useState(false);

  // Profiles state
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [recentEndpoints, setRecentEndpoints] = useState<string[]>([]);
  const [showRecents, setShowRecents] = useState(false);

  // Confirm disconnect
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);

  // Load profiles on mount
  useEffect(() => {
    setProfiles(loadProfiles());
    setRecentEndpoints(loadRecentEndpoints());
    const draft = loadDraft();
    if (draft) {
      if (draft.name) setName(draft.name);
      if (draft.endpoint_url) setEndpointUrl(draft.endpoint_url);
      if (draft.security_policy) setSecPolicy(draft.security_policy);
      if (draft.security_mode) setSecMode(draft.security_mode);
      if (draft.auth_type) setAuthType(draft.auth_type);
      if (draft.username) setUsername(draft.username);
      if (draft.session_timeout) setSessionTimeout(String(draft.session_timeout));
      if (typeof draft.use_simulator === "boolean") setUseSimulator(draft.use_simulator);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      LAST_DRAFT_KEY,
      JSON.stringify({
        name,
        endpoint_url: endpointUrl,
        security_policy: secPolicy,
        security_mode: secMode,
        auth_type: authType,
        username,
        session_timeout: Number(sessionTimeout) || 60000,
        use_simulator: useSimulator,
      })
    );
  }, [name, endpointUrl, secPolicy, secMode, authType, username, sessionTimeout, useSimulator]);

  // URL validation
  useEffect(() => {
    if (endpointUrl && !isValidOpcUrl(endpointUrl)) {
      setUrlError("Must start with opc.tcp://");
    } else {
      setUrlError("");
    }
  }, [endpointUrl]);

  const handleDiscover = async () => {
    if (!isValidOpcUrl(endpointUrl)) {
      toast.warning("Invalid URL", "Endpoint must start with opc.tcp://");
      return;
    }
    try {
      await discover(endpointUrl);
      addRecentEndpoint(endpointUrl);
      setRecentEndpoints(loadRecentEndpoints());
    } catch (e) {
      toast.error("Discovery failed", errorMessage(e));
    }
  };

  const handleConnect = async () => {
    if (!isValidOpcUrl(endpointUrl)) {
      toast.warning("Invalid URL", "Endpoint must start with opc.tcp://");
      return;
    }
    if (authType === "certificate" && !useSimulator) {
      toast.warning("Certificate auth unavailable", "Live certificate authentication is not implemented yet.");
      return;
    }
    try {
      const id = await connect({
        name,
        endpoint_url: endpointUrl,
        security_policy: secPolicy,
        security_mode: secMode,
        auth_type: authType,
        username: authType === "username_password" ? username : undefined,
        password: authType === "username_password" ? password : undefined,
        session_timeout: Number(sessionTimeout) || 60000,
        use_simulator: useSimulator,
      });
      addRecentEndpoint(endpointUrl);
      setRecentEndpoints(loadRecentEndpoints());
      toast.success("Connected", `${name} (${endpointUrl})`);
      await loadRootNodes(id);
      setActiveView("browse");
    } catch (e) {
      toast.error("Connection failed", errorMessage(e) || "Unknown error");
    }
  };

  const handleDisconnect = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (id === activeConnectionId) {
      clearSubs();
      resetBrowser();
    }
    await disconnect(id);
    toast.info("Disconnected", conn?.name || id);
    setDisconnectTarget(null);
  };

  const handleSelectConnection = async (id: string) => {
    setActiveConnection(id);
    resetBrowser();
    clearSubs();
    await loadRootNodes(id);
    setActiveView("browse");
  };

  const handleSaveProfile = () => {
    const profile: SavedProfile = {
      id: `profile-${Date.now()}`,
      name,
      endpoint_url: endpointUrl,
      security_policy: secPolicy,
      security_mode: secMode,
      auth_type: authType,
      username: authType === "username_password" ? username : undefined,
      session_timeout: Number(sessionTimeout) || 60000,
      use_simulator: useSimulator,
    };
    const updated = [...profiles, profile];
    setProfiles(updated);
    saveProfiles(updated);
    toast.success("Profile saved", name);
  };

  const handleLoadProfile = (profile: SavedProfile) => {
    setName(profile.name);
    setEndpointUrl(profile.endpoint_url);
    setSecPolicy(profile.security_policy);
    setSecMode(profile.security_mode);
    setAuthType(profile.auth_type);
    setSessionTimeout(String(profile.session_timeout || 60000));
    setUseSimulator(Boolean(profile.use_simulator));
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
        {/* Hero section */}
        <div className="text-center py-6">
          <h1 className="text-xl font-bold text-iot-text-primary">OPC UA Connection</h1>
          <p className="text-xs text-iot-text-muted mt-1">
            Connect to an OPC UA server or use the built-in simulator
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
                    onClick={() => setUseSimulator(false)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      !useSimulator
                        ? "bg-iot-green/10 border-iot-green/40 text-iot-green"
                        : "bg-iot-bg-base border-iot-border text-iot-text-muted hover:border-iot-border-light"
                    }`}
                  >
                    <Radio size={14} />
                    Live Server
                  </button>
                </div>
              </div>

              <Input
                label="Connection Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My OPC UA Server"
              />
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    label="Endpoint URL"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    onFocus={() => setShowRecents(true)}
                    onBlur={() => setTimeout(() => setShowRecents(false), 200)}
                    placeholder="opc.tcp://hostname:4840"
                    className="font-mono text-xs"
                    error={urlError}
                  />
                  {/* Recent endpoints dropdown */}
                  {showRecents && recentEndpoints.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-iot-bg-surface border border-iot-border rounded-lg shadow-lg overflow-hidden">
                      <div className="px-2 py-1 text-2xs text-iot-text-muted font-medium flex items-center gap-1 border-b border-iot-border">
                        <Clock size={10} /> Recent
                      </div>
                      {recentEndpoints.map((url) => (
                        <button
                          key={url}
                          className="w-full text-left px-3 py-1.5 text-xs font-mono text-iot-text-secondary hover:bg-iot-bg-hover transition-colors"
                          onMouseDown={() => {
                            setEndpointUrl(url);
                            setShowRecents(false);
                          }}
                        >
                          {url}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDiscover}
                    loading={isDiscovering}
                    disabled={!isValidOpcUrl(endpointUrl)}
                  >
                    <Search size={12} />
                    Discover
                  </Button>
                </div>
              </div>

              {/* Discovered endpoints */}
              {endpoints.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-iot-text-muted font-medium">
                    Discovered Endpoints
                  </label>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {endpoints.map((ep, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setEndpointUrl(ep.url);
                          setSecPolicy(ep.security_policy);
                          setSecMode(ep.security_mode);
                        }}
                        className="w-full text-left p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Shield size={10} className="text-iot-text-muted flex-shrink-0" />
                          <span className="font-mono text-iot-text-secondary truncate">
                            {ep.url}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-1 ml-4">
                          <Badge variant="info">{ep.security_policy}</Badge>
                          <Badge>{ep.security_mode}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Security Policy"
                  options={SECURITY_POLICIES}
                  value={secPolicy}
                  onChange={(e) => setSecPolicy(e.target.value)}
                />
                <Select
                  label="Security Mode"
                  options={SECURITY_MODES}
                  value={secMode}
                  onChange={(e) => setSecMode(e.target.value)}
                />
              </div>

              <Input
                label="Session Timeout (ms)"
                type="number"
                value={sessionTimeout}
                min="10000"
                max="300000"
                step="1000"
                onChange={(e) => setSessionTimeout(e.target.value)}
              />

              <Select
                label="Authentication"
                options={AUTH_TYPES}
                value={authType}
                onChange={(e) => setAuthType(e.target.value as typeof authType)}
              />

              {authType === "username_password" && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Input
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {authType === "certificate" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 rounded bg-iot-amber/5 border border-iot-amber/20">
                    <FileKey size={14} className="text-iot-amber flex-shrink-0" />
                    <span className="text-xs text-iot-amber">
                      Certificate authentication requires PEM/DER cert files
                    </span>
                  </div>
                  <div className="text-2xs text-iot-amber">
                    Certificate auth is not implemented yet for live connections; use this only for saved planning data.
                  </div>
                  <Input
                    label="Certificate Path (.pem / .der)"
                    value={certPath}
                    onChange={(e) => setCertPath(e.target.value)}
                    placeholder="/path/to/cert.pem"
                    className="font-mono text-xs"
                  />
                  <Input
                    label="Private Key Path (.pem)"
                    value={keyPath}
                    onChange={(e) => setKeyPath(e.target.value)}
                    placeholder="/path/to/key.pem"
                    className="font-mono text-xs"
                  />
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
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleConnect}
                  loading={isConnecting}
                  className="flex-1"
                  disabled={!isValidOpcUrl(endpointUrl)}
                >
                  <Zap size={14} />
                  Connect
                </Button>
                <Button variant="secondary" size="md" onClick={handleSaveProfile} title="Save as profile">
                  <Save size={14} />
                </Button>
              </div>
            </div>
          </Card>

          {/* Right column: profiles + connections */}
          <div className="space-y-4">
            {/* Saved Profiles */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
                <BookOpen size={14} className="text-iot-cyan" />
                Saved Profiles
                {profiles.length > 0 && <Badge>{profiles.length}</Badge>}
              </h3>

              {profiles.length === 0 ? (
                <p className="text-xs text-iot-text-muted text-center py-4">
                  No saved profiles yet
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-auto">
                  {profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-2 p-2 rounded bg-iot-bg-base border border-iot-border hover:border-iot-border-light transition-colors cursor-pointer group"
                      onClick={() => handleLoadProfile(profile)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-iot-text-primary truncate">
                          {profile.name}
                        </p>
                        <p className="text-2xs font-mono text-iot-text-disabled truncate">
                          {profile.endpoint_url}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(profile.id);
                        }}
                        className="text-iot-text-disabled hover:text-iot-red transition-colors opacity-0 group-hover:opacity-100"
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
                <Server size={14} className="text-iot-cyan" />
                Active Connections
                {connections.length > 0 && <Badge variant="success">{connections.length}</Badge>}
              </h3>

              {connections.length === 0 ? (
                <EmptyState
                  icon={<Server size={24} />}
                  title="No Connections"
                  description="Connect to get started"
                />
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
                              conn.status === "connected"
                                ? "connected"
                                : conn.status === "error"
                                ? "error"
                                : "warning"
                            }
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-iot-text-primary truncate">
                              {conn.name}
                            </p>
                            <p className="text-2xs font-mono text-iot-text-muted truncate">
                              {conn.endpoint_url}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant={conn.status === "connected" ? "success" : conn.status === "error" ? "danger" : "warning"}>
                            {conn.status}
                          </Badge>
                          <Badge variant={conn.is_simulator ? "info" : "success"}>
                            {conn.is_simulator ? "SIM" : "LIVE"}
                          </Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDisconnectTarget(conn.id);
                            }}
                            className="text-iot-text-disabled hover:text-iot-red transition-colors p-1"
                            title="Disconnect"
                          >
                            <Trash2 size={12} />
                          </button>
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

      {/* Disconnect confirmation */}
      <ConfirmDialog
        open={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={() => disconnectTarget && handleDisconnect(disconnectTarget)}
        title="Disconnect"
        message={`Are you sure you want to disconnect from "${
          connections.find((c) => c.id === disconnectTarget)?.name || "this server"
        }"? Active subscriptions will be lost.`}
        confirmLabel="Disconnect"
        danger
      />
    </div>
  );
};
