import React, { useState, useEffect, useCallback } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useBrowserStore } from "@/stores/browserStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useAppStore } from "@/stores/appStore";
import { errorMessage } from "@/types/opcua";
import {
  Button, Input, Select, Card, Badge, StatusDot, EmptyState, Tooltip,
  WizardContainer, ModeCard, ReviewRow, ReviewSection,
} from "@/components/ui";
import type { WizardStep } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toast } from "@/stores/notificationStore";
import {
  Search, Server, Shield, Trash2, Plus, Save, BookOpen, Clock,
  AlertCircle, FileKey, MonitorSmartphone, Wifi, ChevronRight,
  Lock, Settings2, Network,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

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

// ─── Saved Profiles ──────────────────────────────────────────────

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

// ─── Wizard Step Definitions ─────────────────────────────────────

const SIMULATOR_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose a connection mode" },
  { id: "sim_config", label: "Connect", description: "Name your simulator connection" },
];

const LIVE_STEPS: WizardStep[] = [
  { id: "mode", label: "Mode", description: "Choose a connection mode" },
  { id: "server", label: "Server", description: "Configure the OPC UA server endpoint" },
  { id: "security", label: "Security", description: "Set up security and authentication" },
  { id: "session", label: "Session", description: "Configure session parameters" },
  { id: "review", label: "Review", description: "Review your settings and connect" },
];

// ─── Component ───────────────────────────────────────────────────

export const ConnectionPanel: React.FC = () => {
  const {
    connections, activeConnectionId, endpoints, isConnecting, isDiscovering,
    error, discover, connect, disconnect, setActiveConnection, clearError,
  } = useConnectionStore();
  const { loadRootNodes, reset: resetBrowser } = useBrowserStore();
  const { clearAll: clearSubs } = useSubscriptionStore();
  const { setActiveView } = useAppStore();

  // ─── View state ────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [useSimulator, setUseSimulator] = useState(false);

  // ─── Form state ────────────────────────────────────────────────
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

  // ─── Profiles & recents ────────────────────────────────────────
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [recentEndpoints, setRecentEndpoints] = useState<string[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [deleteProfileTarget, setDeleteProfileTarget] = useState<string | null>(null);

  useEffect(() => {
    setProfiles(loadProfiles());
    setRecentEndpoints(loadRecentEndpoints());
  }, []);

  // URL validation
  useEffect(() => {
    if (endpointUrl && !isValidOpcUrl(endpointUrl)) {
      setUrlError("Must start with opc.tcp://");
    } else {
      setUrlError("");
    }
  }, [endpointUrl]);

  // ─── Derived ───────────────────────────────────────────────────
  const steps = useSimulator ? SIMULATOR_STEPS : LIVE_STEPS;

  const canProceedForStep = useCallback(
    (step: number): boolean => {
      const stepId = steps[step]?.id;
      if (stepId === "mode") return true;
      if (stepId === "sim_config") return !!name.trim();
      if (stepId === "server") return isValidOpcUrl(endpointUrl) && !!name.trim();
      if (stepId === "security") return true;
      if (stepId === "session") return true;
      if (stepId === "review") return isValidOpcUrl(endpointUrl);
      return true;
    },
    [steps, endpointUrl, name],
  );

  // ─── Handlers ──────────────────────────────────────────────────

  const resetForm = () => {
    setUseSimulator(false);
    setEndpointUrl("opc.tcp://localhost:4840");
    setName("Local Server");
    setSecPolicy("None");
    setSecMode("None");
    setAuthType("anonymous");
    setUsername("");
    setPassword("");
    setCertPath("");
    setKeyPath("");
    setSessionTimeout("60000");
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
      setName("OPC UA Simulator");
    } else {
      setName("Local Server");
    }
  };

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
    if (!useSimulator && !isValidOpcUrl(endpointUrl)) {
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
      setShowWizard(false);
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
                      Connect to a real server or explore with the built-in simulator
                    </p>
                  </div>
                  <div className="flex gap-4 w-full max-w-lg">
                    <ModeCard
                      icon={<MonitorSmartphone size={24} />}
                      title="Simulator"
                      description="Explore OPC UA with a built-in simulator that provides sample nodes, values, and events"
                      selected={useSimulator}
                      onClick={() => handleModeChange(true)}
                    />
                    <ModeCard
                      icon={<Server size={24} />}
                      title="Live Server"
                      description="Connect to a real OPC UA server on your network to browse, monitor, and interact"
                      selected={!useSimulator}
                      onClick={() => handleModeChange(false)}
                    />
                  </div>
                </div>
              )}

              {/* Step: Simulator Config */}
              {steps[activeStep]?.id === "sim_config" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Input
                    label="Connection Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="OPC UA Simulator"
                  />
                  <div className="p-4 rounded-lg bg-iot-cyan/5 border border-iot-cyan/20">
                    <h4 className="text-xs font-semibold text-iot-cyan mb-2">What the simulator provides</h4>
                    <ul className="text-xs text-iot-text-muted space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-iot-cyan mt-0.5">&#8226;</span>
                        Sample address space with folders, variables, and objects
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-iot-cyan mt-0.5">&#8226;</span>
                        Live-updating values (temperature, pressure, counters)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-iot-cyan mt-0.5">&#8226;</span>
                        Simulated events and alarms for testing subscriptions
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-iot-cyan mt-0.5">&#8226;</span>
                        Callable methods for exploring method invocation
                      </li>
                    </ul>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-iot-red/10 border border-iot-red/20">
                      <AlertCircle size={14} className="text-iot-red flex-shrink-0" />
                      <span className="text-xs text-iot-red flex-1">{error}</span>
                      <button onClick={clearError} className="text-iot-red hover:text-iot-red/80">
                        <span className="text-xs">&times;</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Server Details (Live) */}
              {steps[activeStep]?.id === "server" && (
                <div className="space-y-4 max-w-md mx-auto">
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
                    <div className="space-y-1.5">
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
                </div>
              )}

              {/* Step: Security & Auth (Live) */}
              {steps[activeStep]?.id === "security" && (
                <div className="space-y-4 max-w-md mx-auto">
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

                  <div className="pt-2 border-t border-iot-border">
                    <Select
                      label="Authentication"
                      options={AUTH_TYPES}
                      value={authType}
                      onChange={(e) => setAuthType(e.target.value as typeof authType)}
                    />
                  </div>

                  {authType === "username_password" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                  )}

                  {authType === "certificate" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2 rounded bg-iot-amber/5 border border-iot-amber/20">
                        <FileKey size={14} className="text-iot-amber flex-shrink-0" />
                        <span className="text-xs text-iot-amber">
                          Certificate auth is not yet implemented for live connections
                        </span>
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
                </div>
              )}

              {/* Step: Session Settings (Live) */}
              {steps[activeStep]?.id === "session" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <Input
                    label="Session Timeout (ms)"
                    type="number"
                    value={sessionTimeout}
                    min="10000"
                    max="300000"
                    step="1000"
                    onChange={(e) => setSessionTimeout(e.target.value)}
                  />
                  <div className="p-3 rounded-lg bg-iot-bg-base border border-iot-border">
                    <p className="text-xs text-iot-text-muted leading-relaxed">
                      Session timeout defines how long the server keeps the session alive without
                      communication. Default is <span className="font-mono text-iot-text-secondary">60000ms</span> (60s).
                    </p>
                  </div>
                </div>
              )}

              {/* Step: Review (Live) */}
              {steps[activeStep]?.id === "review" && (
                <div className="space-y-4 max-w-md mx-auto">
                  <ReviewSection title="Server" icon={<Network size={12} />} onEdit={() => goToStep(1)}>
                    <ReviewRow label="Name" value={name} />
                    <ReviewRow label="Endpoint" value={<span className="font-mono text-2xs">{endpointUrl}</span>} />
                  </ReviewSection>
                  <ReviewSection title="Security" icon={<Lock size={12} />} onEdit={() => goToStep(2)}>
                    <ReviewRow label="Policy" value={secPolicy} />
                    <ReviewRow label="Mode" value={secMode} />
                    <ReviewRow label="Authentication" value={authType === "anonymous" ? "Anonymous" : authType === "username_password" ? `Username (${username})` : "Certificate"} />
                  </ReviewSection>
                  <ReviewSection title="Session" icon={<Settings2 size={12} />} onEdit={() => goToStep(3)}>
                    <ReviewRow label="Timeout" value={`${sessionTimeout}ms`} />
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
            <Network size={28} className="text-iot-cyan" />
          </div>
          <h1 className="text-xl font-bold text-iot-text-primary">OPC UA Connections</h1>
          <p className="text-xs text-iot-text-muted mt-1.5 max-w-sm mx-auto">
            Connect to an OPC UA server or explore with the built-in simulator
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
                description="Create a new connection to get started with OPC UA"
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
                        <Badge variant={conn.is_simulator ? "info" : "success"}>
                          {conn.is_simulator ? "SIM" : "LIVE"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-2xs font-mono text-iot-text-muted truncate">
                      {conn.endpoint_url}
                    </p>
                    {conn.security_policy !== "None" && (
                      <div className="mt-1.5">
                        <Badge variant="info">{conn.security_policy}</Badge>
                      </div>
                    )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setDisconnectTarget(conn.id);
                        }}
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
                      ? <MonitorSmartphone size={14} className="text-iot-text-muted" />
                      : <Server size={14} className="text-iot-text-muted" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-iot-text-primary truncate">{profile.name}</p>
                    <p className="text-2xs font-mono text-iot-text-disabled truncate">
                      {profile.use_simulator ? "Simulator" : profile.endpoint_url}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteProfileTarget(profile.id);
                    }}
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
          connections.find((c) => c.id === disconnectTarget)?.name || "this server"
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
