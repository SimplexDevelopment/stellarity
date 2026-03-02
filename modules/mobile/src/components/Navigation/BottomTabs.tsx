import React from 'react'
import { ServerIcon, MessageIcon, GearIcon } from '../Icons'
import './BottomTabs.css'

interface BottomTabsProps {
  activeTab: string
  onTabChange: (tab: any) => void
}

const tabs = [
  { id: 'comms', label: 'Comms', icon: ServerIcon },
  { id: 'dms', label: 'Messages', icon: MessageIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon },
]

export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="bottom-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            className={`bottom-tab ${isActive ? 'bottom-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <Icon size={20} className="bottom-tab__icon" />
            <span className="bottom-tab__label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
