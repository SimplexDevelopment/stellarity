import React, { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { useServerStore, ServerFeatures } from '../../stores/serverStore'
import { instanceManager } from '../../utils/instanceManager'
import {
  GearIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  CloseIcon,
  BuildLobbyIcon,
} from '../Icons'
import './ServerSettingsModal.css'

interface ServerSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'categories' | 'features'

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentServerId,
    categories,
    serverFeatures,
    servers,
    setCategories,
    addCategory,
    updateCategory,
    removeCategory,
    setServerFeatures,
  } = useServerStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('categories')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [features, setFeatures] = useState<ServerFeatures>(serverFeatures)
  const [saving, setSaving] = useState(false)

  const currentServer = servers.find(s => s.id === currentServerId)
  const instanceId = (currentServer as any)?.instanceId

  useEffect(() => {
    setFeatures(serverFeatures)
  }, [serverFeatures])

  // Load features when opening
  useEffect(() => {
    if (isOpen && currentServerId && instanceId) {
      const api = instanceManager.getApi(instanceId)
      api?.features.get(currentServerId).then(res => {
        if (res.features) {
          setServerFeatures(res.features)
          setFeatures(res.features)
        }
      }).catch(() => {})
    }
  }, [isOpen, currentServerId, instanceId])

  const api = instanceId ? instanceManager.getApi(instanceId) : undefined

  // ── Category handlers ─────────────────────────────────

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !currentServerId || !api) return
    try {
      const result = await api.categories.create(currentServerId, { name: newCategoryName.trim() })
      if (result.category) {
        addCategory(result.category)
      }
      setNewCategoryName('')
    } catch (err) {
      console.error('Failed to create category:', err)
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    if (!currentServerId || !api) return
    try {
      await api.categories.delete(currentServerId, categoryId)
      removeCategory(categoryId)
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  const handleStartEditCategory = (cat: { id: string; name: string }) => {
    setEditingCategoryId(cat.id)
    setEditingCategoryName(cat.name)
  }

  const handleSaveCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim() || !currentServerId || !api) return
    try {
      const result = await api.categories.update(currentServerId, editingCategoryId, {
        name: editingCategoryName.trim(),
      })
      if (result.category) {
        updateCategory(editingCategoryId, result.category)
      }
      setEditingCategoryId(null)
    } catch (err) {
      console.error('Failed to update category:', err)
    }
  }

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  // ── Feature handlers ──────────────────────────────────

  const handleSaveFeatures = async () => {
    if (!currentServerId || !api) return
    setSaving(true)
    try {
      const result = await api.features.update(currentServerId, features)
      if (result.features) {
        setServerFeatures(result.features)
      }
    } catch (err) {
      console.error('Failed to update features:', err)
    }
    setSaving(false)
  }

  const sortedCategories = [...categories].sort((a, b) => a.position - b.position)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Server Settings">
      <div className="server-settings">
        {/* Tab bar */}
        <div className="server-settings__tabs">
          <button
            className={`server-settings__tab ${activeTab === 'categories' ? 'server-settings__tab--active' : ''}`}
            onClick={() => setActiveTab('categories')}
          >
            <FolderIcon size={14} /> Categories
          </button>
          <button
            className={`server-settings__tab ${activeTab === 'features' ? 'server-settings__tab--active' : ''}`}
            onClick={() => setActiveTab('features')}
          >
            <GearIcon size={14} /> Features
          </button>
        </div>

        {/* Categories tab */}
        {activeTab === 'categories' && (
          <div className="server-settings__content">
            <div className="settings-section">
              <h3 className="settings-section__title">Channel Categories</h3>
              <p className="settings-section__desc">
                Organize channels into collapsible categories.
              </p>

              <div className="category-list">
                {sortedCategories.map((cat) => (
                  <div key={cat.id} className="category-list__item">
                    {editingCategoryId === cat.id ? (
                      <div className="category-list__edit">
                        <input
                          className="form-input form-input--sm"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCategory()
                            if (e.key === 'Escape') handleCancelEditCategory()
                          }}
                          autoFocus
                        />
                        <button className="btn btn--icon btn--sm" onClick={handleSaveCategory}>
                          <CheckIcon size={12} />
                        </button>
                        <button className="btn btn--icon btn--sm" onClick={handleCancelEditCategory}>
                          <CloseIcon size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <FolderIcon size={14} className="category-list__icon" />
                        <span className="category-list__name">{cat.name}</span>
                        <div className="category-list__actions">
                          <button
                            className="btn btn--icon btn--sm"
                            onClick={() => handleStartEditCategory(cat)}
                            data-tooltip="Rename"
                          >
                            <EditIcon size={12} />
                          </button>
                          <button
                            className="btn btn--icon btn--sm btn--danger"
                            onClick={() => handleDeleteCategory(cat.id)}
                            data-tooltip="Delete"
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Add category */}
              <div className="category-create">
                <input
                  className="form-input form-input--sm"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  maxLength={64}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={handleCreateCategory}
                  disabled={!newCategoryName.trim()}
                >
                  <PlusIcon size={12} /> Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Features tab */}
        {activeTab === 'features' && (
          <div className="server-settings__content">
            <div className="settings-section">
              <h3 className="settings-section__title">Voice Lobby Features</h3>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={features.buildALobbyEnabled}
                  onChange={(e) => setFeatures(f => ({ ...f, buildALobbyEnabled: e.target.checked }))}
                />
                <BuildLobbyIcon size={14} />
                <div>
                  <span className="settings-toggle__label">Build-a-Lobby</span>
                  <span className="settings-toggle__desc">
                    Allow members to create temporary voice lobbies that self-destruct when empty.
                  </span>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={features.autoOverflowEnabled}
                  onChange={(e) => setFeatures(f => ({ ...f, autoOverflowEnabled: e.target.checked }))}
                />
                <div>
                  <span className="settings-toggle__label">Auto-Overflow Lobbies</span>
                  <span className="settings-toggle__desc">
                    Automatically create overflow lobbies when a voice channel is full.
                  </span>
                </div>
              </label>

              <div className="modal-actions" style={{ marginTop: 'var(--spacing-md)' }}>
                <button
                  className="btn btn--primary"
                  onClick={handleSaveFeatures}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Features'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
