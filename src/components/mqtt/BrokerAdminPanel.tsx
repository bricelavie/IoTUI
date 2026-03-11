import React, { useEffect } from "react";
import { useMqttBrokerStore } from "@/stores/mqttBrokerStore";
import { useMqttConnectionStore } from "@/stores/mqttConnectionStore";
import { Card, Badge, EmptyState, Tooltip } from "@/components/ui";
import {
  Server,
  Users,
  ArrowUpDown,
  Activity,
  Clock,
  Database,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const BrokerAdminPanel: React.FC = () => {
  const { activeConnectionId } = useMqttConnectionStore();
  const activeConnection = useMqttConnectionStore((s) =>
    s.connections.find((c) => c.id === s.activeConnectionId)
  );
  const { stats, clients, isPolling, error, startPolling, stopPolling } = useMqttBrokerStore();

  useEffect(() => {
    if (activeConnectionId && activeConnection?.mode === "broker") {
      startPolling(activeConnectionId);
    }
    return () => stopPolling();
  }, [activeConnectionId, activeConnection?.mode, startPolling, stopPolling]);

  if (!activeConnection) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Server size={32} />}
          title="No Connection"
          description="Connect to an MQTT broker to view admin stats"
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-iot-cyan" />
          <h2 className="text-sm font-semibold text-iot-text-primary">Broker Admin</h2>
          {isPolling && (
            <span className="flex items-center gap-1 text-2xs text-iot-cyan">
              <span className="w-1.5 h-1.5 rounded-full bg-iot-cyan animate-pulse-slow" />
              LIVE
            </span>
          )}
          {error && (
            <Tooltip content={error}>
              <Badge variant="danger">Error</Badge>
            </Tooltip>
          )}
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={<Users size={14} />} label="Active" value={String(stats.active_connections)} sub={`${stats.total_connections} total`} />
            <StatCard icon={<ArrowUpDown size={14} />} label="Msgs In" value={String(stats.messages_received)} />
            <StatCard icon={<ArrowUpDown size={14} />} label="Msgs Out" value={String(stats.messages_sent)} />
            <StatCard icon={<Activity size={14} />} label="Subs" value={String(stats.subscriptions_active)} />
            <StatCard icon={<Database size={14} />} label="Retained" value={String(stats.retained_messages)} />
            <StatCard icon={<Clock size={14} />} label="Uptime" value={formatUptime(stats.uptime_secs)} />
            <StatCard icon={<ArrowUpDown size={14} />} label="Bytes In" value={formatBytes(stats.bytes_received)} />
            <StatCard icon={<ArrowUpDown size={14} />} label="Bytes Out" value={formatBytes(stats.bytes_sent)} />
          </div>
        )}

        {/* Connected clients table */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-iot-text-primary mb-3 flex items-center gap-2">
            <Users size={14} className="text-iot-cyan" />
            Connected Clients
            <Badge variant="info">{clients.length}</Badge>
          </h3>

          {clients.length === 0 ? (
            <p className="text-xs text-iot-text-muted text-center py-6">No clients connected</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-iot-border text-iot-text-disabled uppercase tracking-wider text-2xs">
                    <th className="text-left py-2 pr-4">Client ID</th>
                    <th className="text-left py-2 pr-4">Connected At</th>
                    <th className="text-left py-2 pr-4">Subscriptions</th>
                    <th className="text-right py-2 pr-4">Msgs In</th>
                    <th className="text-right py-2">Msgs Out</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.client_id} className="border-b border-iot-border/30 hover:bg-iot-bg-hover">
                      <td className="py-2 pr-4 font-mono text-iot-text-primary">{client.client_id}</td>
                      <td className="py-2 pr-4 text-iot-text-muted">
                        {(() => { try { return new Date(client.connected_at).toLocaleString(); } catch { return client.connected_at; } })()}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {client.subscriptions.slice(0, 3).map((sub) => (
                            <Badge key={sub} variant="default">{sub}</Badge>
                          ))}
                          {client.subscriptions.length > 3 && (
                            <Badge>+{client.subscriptions.length - 3}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-iot-text-muted">{client.messages_in}</td>
                      <td className="py-2 text-right font-mono text-iot-text-muted">{client.messages_out}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({
  icon,
  label,
  value,
  sub,
}) => (
  <Card className="p-3">
    <div className="flex items-center gap-1.5 text-iot-text-muted mb-1">
      {icon}
      <span className="text-2xs uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-lg font-mono font-bold text-iot-text-primary">{value}</p>
    {sub && <p className="text-2xs text-iot-text-disabled mt-0.5">{sub}</p>}
  </Card>
);
