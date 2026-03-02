import React, { useEffect, useCallback } from 'react'
import { useAdminDashboardStore } from '../../stores/adminDashboardStore'
import { adminApi } from '../../utils/adminApi'
import {
  UsersIcon,
  ServerIcon,
  MailIcon,
  ShieldIcon,
  CreditCardIcon,
  ActivityIcon,
  RefreshIcon,
  TrendUpIcon,
} from '../Icons'
import './Dashboard.css'

const REFRESH_INTERVAL = 60_000 // 1 minute

export const Dashboard: React.FC = () => {
  const { metrics, registrationHistory, isLoading, setMetrics, setRegistrationHistory, setLoading, setError } =
    useAdminDashboardStore()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [metricsRes, regRes] = await Promise.all([
        adminApi.metrics.dashboard(),
        adminApi.metrics.registrations(14),
      ])
      setMetrics(metricsRes.metrics)
      setRegistrationHistory(regRes.history)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [setMetrics, setRegistrationHistory, setLoading, setError])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchData])

  const statCards = metrics
    ? [
        { label: 'Total Users', value: metrics.totalUsers, icon: UsersIcon, color: 'accent' },
        { label: 'Online Now', value: metrics.onlineUsers, icon: ActivityIcon, color: 'success' },
        { label: 'Instances', value: metrics.totalInstances, icon: ServerIcon, color: 'info' },
        { label: 'Verified', value: metrics.verifiedInstances, icon: ServerIcon, color: 'accent' },
        { label: 'DM Buffer', value: metrics.dmBufferSize, icon: MailIcon, color: 'warning' },
        { label: 'Pending DMs', value: metrics.pendingDMs, icon: MailIcon, color: 'warning' },
        { label: 'Admins', value: metrics.totalAdmins, icon: ShieldIcon, color: 'accent' },
        { label: 'New (24h)', value: metrics.recentRegistrations24h, icon: TrendUpIcon, color: 'success' },
        { label: 'Subscriptions', value: metrics.totalSubscriptions, icon: CreditCardIcon, color: 'info' },
        { label: 'Active Subs', value: metrics.activeSubscriptions, icon: CreditCardIcon, color: 'success' },
      ]
    : []

  const maxReg = registrationHistory.length
    ? Math.max(...registrationHistory.map((r) => r.count), 1)
    : 1

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Platform Overview</h2>
        <button className="btn btn--ghost" onClick={fetchData} disabled={isLoading}>
          <RefreshIcon size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stat Grid */}
      <div className="dashboard-stats">
        {statCards.map((card) => {
          const IconComp = card.icon
          return (
            <div key={card.label} className="stat-card">
              <div className="stat-card__header">
                <span className="stat-card__label">{card.label}</span>
                <IconComp size={14} className={`stat-card__icon stat-card__icon--${card.color}`} />
              </div>
              <span className={`stat-card__value stat-card__value--${card.color}`}>
                {card.value.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Registration Chart */}
      {registrationHistory.length > 0 && (
        <div className="dashboard-chart panel">
          <div className="panel-header">
            <span className="panel-header__label">Registration Trend (14 Days)</span>
          </div>
          <div className="dashboard-chart__body">
            <div className="bar-chart">
              {registrationHistory.map((point, i) => (
                <div key={point.date} className="bar-chart__col">
                  <div
                    className="bar-chart__bar bar-grow"
                    style={{
                      height: `${(point.count / maxReg) * 100}%`,
                      animationDelay: `${i * 40}ms`,
                    }}
                    data-tooltip={`${point.date}: ${point.count}`}
                  />
                  <span className="bar-chart__label">
                    {new Date(point.date).getDate()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
