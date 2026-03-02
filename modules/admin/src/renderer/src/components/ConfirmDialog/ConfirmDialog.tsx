import React, { useEffect, useRef } from 'react'
import { useAdminUIStore } from '../../stores/adminUIStore'
import { AlertTriangleIcon, XIcon } from '../Icons'
import './ConfirmDialog.css'

export const ConfirmDialog: React.FC = () => {
  const dialog = useAdminUIStore((s) => s.confirmDialog)
  const hideConfirm = useAdminUIStore((s) => s.closeConfirmDialog)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (dialog) {
      confirmRef.current?.focus()
    }
  }, [dialog])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialog) {
        hideConfirm()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog, hideConfirm])

  if (!dialog) return null

  const handleConfirm = async () => {
    await dialog.onConfirm()
    hideConfirm()
  }

  return (
    <div className="confirm-overlay" onClick={hideConfirm}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-dialog__close" onClick={hideConfirm}>
          <XIcon size={14} />
        </button>

        <div className={`confirm-dialog__icon confirm-dialog__icon--${dialog.variant || 'warning'}`}>
          <AlertTriangleIcon size={24} />
        </div>

        <h3 className="confirm-dialog__title">{dialog.title}</h3>
        <p className="confirm-dialog__message">{dialog.message}</p>

        <div className="confirm-dialog__actions">
          <button className="btn btn--ghost" onClick={hideConfirm}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className={`btn btn--${dialog.variant === 'danger' ? 'danger' : 'primary'}`}
            onClick={handleConfirm}
          >
            {dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
