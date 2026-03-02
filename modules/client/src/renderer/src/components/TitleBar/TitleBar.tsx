import React from 'react'
import { DiamondIcon, MinimizeIcon, MaximizeIcon, CloseIcon } from '../Icons'
import './TitleBar.css'

export const TitleBar: React.FC = () => {
  const handleMinimize = () => window.api.window.minimize()
  const handleMaximize = () => window.api.window.maximize()
  const handleClose = () => window.api.window.close()

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <DiamondIcon size={14} className="titlebar-logo-icon" />
          <span className="titlebar-logo-text">STELLARITY</span>
        </div>
      </div>

      <div className="titlebar-controls">
        <button className="titlebar-ctrl titlebar-ctrl--minimize" onClick={handleMinimize}>
          <MinimizeIcon size={10} />
        </button>
        <button className="titlebar-ctrl titlebar-ctrl--maximize" onClick={handleMaximize}>
          <MaximizeIcon size={10} />
        </button>
        <button className="titlebar-ctrl titlebar-ctrl--close" onClick={handleClose}>
          <CloseIcon size={10} />
        </button>
      </div>
    </div>
  )
}
