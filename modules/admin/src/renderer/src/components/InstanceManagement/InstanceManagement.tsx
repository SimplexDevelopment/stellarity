import React, { useEffect, useState, useCallback } from 'react'
import { adminApi } from '../../utils/adminApi'
import { useAdminUIStore } from '../../stores/adminUIStore'
import {
  SearchIcon,
  RefreshIcon,
  VerifiedIcon,
  TrashIcon,
  EyeIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../Icons'
import '../UserManagement/UserManagement.css'
import './InstanceManagement.css'

interface InstanceRow {
  id: string
  instance_name: string
  url: string
  owner_username?: string
  owner_id: string
  is_public: boolean
  is_verified: boolean
  member_count: number
  max_members: number
  region: string | null
  last_heartbeat: string | null
  created_at: string
}

export const InstanceManagement: React.FC = () => {
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [search, setSearch] = useState('')
  const [verifiedFilter, setVerifiedFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { showConfirmDialog } = useAdminUIStore()

  const fetchInstances = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.instances.list({
        page,
        limit,
        search: search || undefined,
        isVerified: verifiedFilter || undefined,
      })
      setInstances(res.instances)
      setTotal(res.total)
    } catch (err) {
      console.error('Failed to fetch instances', err)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, verifiedFilter])

  useEffect(() => {
    fetchInstances()
  }, [fetchInstances])

  const totalPages = Math.ceil(total / limit)

  const handleView = async (id: string) => {
    try {
      const res = await adminApi.instances.get(id)
      setSelectedInstance(res.instance)
      setDetailOpen(true)
    } catch (err) {
      console.error('Failed to get instance', err)
    }
  }

  const handleVerify = async (id: string) => {
    try {
      await adminApi.instances.verify(id)
      fetchInstances()
    } catch (err) {
      console.error('Failed to verify instance', err)
    }
  }

  const handleUnverify = async (id: string) => {
    try {
      await adminApi.instances.unverify(id)
      fetchInstances()
    } catch (err) {
      console.error('Failed to unverify instance', err)
    }
  }

  const handleRemove = (inst: InstanceRow) => {
    showConfirmDialog({
      title: 'Remove Instance',
      message: `Remove "${inst.instance_name}" from the registry? This cannot be undone.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await adminApi.instances.remove(inst.id)
          fetchInstances()
        } catch (err) {
          console.error('Failed to remove instance', err)
        }
      },
    })
  }

  return (
    <div className="instance-management">
      <div className="view-header">
        <h2 className="view-title">Instance Management</h2>
        <span className="view-count">{total} instances</span>
        <button className="btn btn--ghost" onClick={fetchInstances} disabled={loading}>
          <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="view-filters">
        <div className="search-bar">
          <SearchIcon size={14} className="search-bar__icon" />
          <input
            className="search-bar__input"
            placeholder="Search instances..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select value={verifiedFilter} onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
      </div>

      <div className="view-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>URL</th>
              <th>Owner</th>
              <th>Members</th>
              <th>Verified</th>
              <th>Region</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.id}>
                <td className="text-primary">{inst.instance_name}</td>
                <td className="mono">{inst.url}</td>
                <td>{inst.owner_username || inst.owner_id.slice(0, 8)}</td>
                <td>{inst.member_count}/{inst.max_members}</td>
                <td>
                  {inst.is_verified ? (
                    <span className="badge badge--success">Yes</span>
                  ) : (
                    <span className="badge">No</span>
                  )}
                </td>
                <td>{inst.region || '—'}</td>
                <td>{new Date(inst.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn btn--icon" onClick={() => handleView(inst.id)} data-tooltip="View">
                      <EyeIcon size={14} />
                    </button>
                    {inst.is_verified ? (
                      <button className="btn btn--icon" onClick={() => handleUnverify(inst.id)} data-tooltip="Unverify">
                        <XIcon size={14} />
                      </button>
                    ) : (
                      <button className="btn btn--icon" onClick={() => handleVerify(inst.id)} data-tooltip="Verify">
                        <VerifiedIcon size={14} />
                      </button>
                    )}
                    <button className="btn btn--icon" onClick={() => handleRemove(inst)} data-tooltip="Remove">
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {instances.length === 0 && !loading && (
              <tr><td colSpan={8} className="text-muted" style={{ textAlign: 'center', padding: '24px' }}>No instances found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeftIcon size={12} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button className="pagination__btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}

      {detailOpen && selectedInstance && (
        <div className="detail-overlay" onClick={() => setDetailOpen(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <span className="panel-header__label">Instance Detail</span>
              <button className="btn btn--ghost" onClick={() => setDetailOpen(false)}>Close</button>
            </div>
            <div className="detail-body">
              <div className="detail-row"><span className="detail-key">ID</span><span className="detail-val mono">{selectedInstance.id}</span></div>
              <div className="detail-row"><span className="detail-key">Name</span><span className="detail-val">{selectedInstance.instance_name}</span></div>
              <div className="detail-row"><span className="detail-key">URL</span><span className="detail-val mono">{selectedInstance.url}</span></div>
              <div className="detail-row"><span className="detail-key">Description</span><span className="detail-val">{selectedInstance.description || '—'}</span></div>
              <div className="detail-row"><span className="detail-key">Owner</span><span className="detail-val">{selectedInstance.owner_id}</span></div>
              <div className="detail-row"><span className="detail-key">Public</span><span className="detail-val">{selectedInstance.is_public ? 'Yes' : 'No'}</span></div>
              <div className="detail-row"><span className="detail-key">Verified</span><span className="detail-val">{selectedInstance.is_verified ? 'Yes' : 'No'}</span></div>
              <div className="detail-row"><span className="detail-key">Members</span><span className="detail-val">{selectedInstance.member_count}/{selectedInstance.max_members}</span></div>
              <div className="detail-row"><span className="detail-key">Region</span><span className="detail-val">{selectedInstance.region || '—'}</span></div>
              <div className="detail-row"><span className="detail-key">Created</span><span className="detail-val">{new Date(selectedInstance.created_at).toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
