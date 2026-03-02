import React, { useEffect, useState, useCallback } from 'react';
import { panelApi } from '../../utils/panelApi';
import './Dashboard.css';

interface Metrics {
  members: { total: number; banned: number; active: number };
  servers: { total: number };
  channels: { total: number; text: number; voice: number };
  messages: { total: number; last24h: number; last7d: number; last30d: number };
  voice: { activeConnections: number };
  moderation: { activeActions: number };
  storage: { dbSizeBytes: number; dbSizeMB: number };
  system: { uptime: number; redisStatus: string; nodeVersion: string; memoryUsage: any };
  messageVolume: { day: string; count: number }[];
  topServers: { id: string; name: string; memberCount: number; messageCount: number }[];
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await panelApi.metrics.get();
      setMetrics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return <div className="loading-state"><span className="spinner" /> LOADING METRICS</div>;
  }

  if (error || !metrics) {
    return <div className="empty-state">FAILED TO LOAD METRICS: {error}</div>;
  }

  const maxVolume = Math.max(...metrics.messageVolume.map(v => v.count), 1);

  return (
    <div className="dashboard">
      <div className="dashboard__grid">
        <div className="stat-card">
          <span className="stat-card__label">Members</span>
          <span className="stat-card__value">{metrics.members.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Servers</span>
          <span className="stat-card__value">{metrics.servers.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Channels</span>
          <span className="stat-card__value">{metrics.channels.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Messages (24h)</span>
          <span className="stat-card__value">{metrics.messages.last24h}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Active Voice</span>
          <span className="stat-card__value">{metrics.voice.activeConnections}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Active Mod Actions</span>
          <span className="stat-card__value">{metrics.moderation.activeActions}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Banned Users</span>
          <span className="stat-card__value text-danger">{metrics.members.banned}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Storage</span>
          <span className="stat-card__value">{formatBytes(metrics.storage.dbSizeBytes)}</span>
        </div>
      </div>

      <div className="dashboard__row">
        <div className="panel dashboard__chart">
          <div className="panel-header">Message Volume (14 Days)</div>
          <div className="dashboard__chart-body">
            {metrics.messageVolume.length === 0 ? (
              <div className="empty-state">NO MESSAGE DATA YET</div>
            ) : (
              <div className="dashboard__bars">
                {metrics.messageVolume.map((v, i) => (
                  <div key={v.day} className="dashboard__bar-col">
                    <div
                      className="dashboard__bar bar-grow"
                      style={{
                        height: `${(v.count / maxVolume) * 100}%`,
                        animationDelay: `${i * 40}ms`,
                      }}
                    />
                    <span className="dashboard__bar-label">
                      {new Date(v.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="dashboard__bar-value">{v.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel dashboard__info">
          <div className="panel-header">System</div>
          <div className="dashboard__info-body">
            <div className="dashboard__info-row">
              <span>Uptime</span>
              <span className="text-accent">{formatUptime(metrics.system.uptime)}</span>
            </div>
            <div className="dashboard__info-row">
              <span>Cache</span>
              <span className={metrics.system.redisStatus === 'connected' ? 'text-success' : 'text-warning'}>
                {metrics.system.redisStatus.toUpperCase()}
              </span>
            </div>
            <div className="dashboard__info-row">
              <span>Node.js</span>
              <span className="text-secondary">{metrics.system.nodeVersion}</span>
            </div>
            <div className="dashboard__info-row">
              <span>Heap Used</span>
              <span className="text-secondary">{formatBytes(metrics.system.memoryUsage.heapUsed)}</span>
            </div>
            <div className="dashboard__info-row">
              <span>Total Messages</span>
              <span className="text-accent">{metrics.messages.total.toLocaleString()}</span>
            </div>
            <div className="dashboard__info-row">
              <span>Messages (7d)</span>
              <span className="text-secondary">{metrics.messages.last7d}</span>
            </div>
            <div className="dashboard__info-row">
              <span>Messages (30d)</span>
              <span className="text-secondary">{metrics.messages.last30d}</span>
            </div>
          </div>

          {metrics.topServers.length > 0 && (
            <>
              <div className="panel-header" style={{ borderTop: '1px solid var(--color-panel-border)' }}>
                Top Servers
              </div>
              <div className="dashboard__info-body">
                {metrics.topServers.map((s) => (
                  <div key={s.id} className="dashboard__info-row">
                    <span className="truncate" style={{ maxWidth: 140 }}>{s.name}</span>
                    <span className="text-secondary">{s.memberCount} members</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
