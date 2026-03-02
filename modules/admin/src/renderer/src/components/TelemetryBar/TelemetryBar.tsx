import React, { useEffect, useState } from 'react'
import { useAdminAuthStore } from '../../stores/adminAuthStore'
import { SignalIcon } from '../Icons'
import './TelemetryBar.css'

export const TelemetryBar: React.FC = () => {
  const { admin } = useAdminAuthStore()
  const [uptime, setUptime] = useState('00:00:00')
  const [startTime] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0')
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
      const s = String(elapsed % 60).padStart(2, '0')
      setUptime(`${h}:${m}:${s}`)
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  return (
    <div className="telemetry-bar">
      <div className="telemetry-cell">
        <SignalIcon size={12} className="telemetry-icon telemetry-icon--online" />
        <span className="telemetry-label">SYS</span>
        <span className="telemetry-value telemetry-value--online">OPERATIONAL</span>
      </div>

      <div className="telemetry-divider" />

      <div className="telemetry-cell">
        <span className="telemetry-label">ROLE</span>
        <span className="telemetry-value telemetry-value--accent">
          {admin?.role?.toUpperCase() || '---'}
        </span>
      </div>

      <div className="telemetry-divider" />

      <div className="telemetry-cell">
        <span className="telemetry-label">OPR</span>
        <span className="telemetry-value">
          {admin?.username?.toUpperCase() || 'UNKNOWN'}
        </span>
      </div>

      <div className="telemetry-spacer" />

      <div className="telemetry-ticker">
        <span className="data-ticker">
          STELLARITY COMMAND CENTER v1.0 &nbsp;|&nbsp;
          SESSION: {uptime} &nbsp;|&nbsp;
          CLEARANCE: {admin?.role === 'superadmin' ? 'LEVEL 5' : 'LEVEL 3'} &nbsp;|&nbsp;
          PLATFORM ADMIN PANEL
        </span>
      </div>
    </div>
  )
}
