import React from 'react';
import { usePanelUIStore } from '../../stores/panelUIStore';

export const ConfirmDialog: React.FC = () => {
  const dialog = usePanelUIStore((s) => s.confirmDialog);
  const closeConfirmDialog = usePanelUIStore((s) => s.closeConfirmDialog);

  if (!dialog) return null;

  const handleConfirm = () => {
    dialog.onConfirm();
    closeConfirmDialog();
  };

  return (
    <div className="confirm-overlay" onClick={closeConfirmDialog}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{dialog.title}</h3>
        <p>{dialog.message}</p>
        <div className="confirm-dialog__actions">
          <button className="btn btn--ghost" onClick={closeConfirmDialog}>
            CANCEL
          </button>
          <button
            className={`btn ${dialog.variant === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={handleConfirm}
          >
            {dialog.confirmLabel || 'CONFIRM'}
          </button>
        </div>
      </div>
    </div>
  );
};
