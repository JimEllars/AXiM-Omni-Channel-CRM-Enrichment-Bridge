import { apiFetch } from "../utils/api";
import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiAlertCircle, FiRefreshCw, FiTrash2, FiEdit3, FiCheck, FiX } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { recoveryService } from '../services/recoveryService';
import { sanitizeLeadData } from '../utils/sanitize';

export default function RecoveryCenter({ onRetrySuccess }) {
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [editPayload, setEditPayload] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    loadItems();
  }, [offset, limit]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const key = sessionStorage.getItem('AXIM_AUTH_KEY');
      const res = await apiFetch(`/v1/management/dlq?limit=${limit}&offset=${offset}`, {
        headers: {
           'Authorization': `Bearer ${key}`
        }
      });
      if (res.ok) {
         const data = await res.json();
         setItems(data.map(item => ({
            id: item.id,
            source: item.source,
            reason: item.error_reason,
            payload: typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload),
            created_at: item.created_at
         })));
         setHasMore(data.length === limit);
         setErrorMsg(null);
      } else {
         if (res.status === 401) setErrorMsg("Unauthorized: Invalid Session Key.");
         else if (res.status === 429) setErrorMsg("Too Many Requests: Rate limit exceeded. Try again later.");
         else setErrorMsg(`Error ${res.status}: Failed to fetch DLQ.`);
      }
    } catch(e) {
      console.error(e);
      setErrorMsg("Network error: Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(items.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };


  const handleDismiss = async (id) => {
    if (!window.confirm("Are you sure you want to dismiss this system alert?")) return;
    const oldItems = [...items];
    setItems(items.filter(i => i.id !== id)); // optimistic UI update

    // Briefly show a loading/dismissing state?
    // We can just rely on the optimistic update which removes it immediately.
    try {
      const key = sessionStorage.getItem('AXIM_AUTH_KEY');
      const response = await apiFetch(`/v1/management/dlq-dismiss?recordId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      if (!response.ok) {
         throw new Error("Failed to dismiss alert");
      }
    } catch (e) {
      console.error(e);
      // revert optimistic UI update on error
      setItems(oldItems);
      alert("Failed to dismiss alert. Check console.");
    }
  };

  const handleBulkRetry = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkRetrying(true);
    setBulkProgress({ current: 0, total: selectedIds.length });

    let currentItems = [...items];

    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const item = currentItems.find(i => i.id === id);
      if (item) {
        await handleRetry(item, true); // true for bulk flag to avoid full UI reload
        setBulkProgress(prev => ({ ...prev, current: i + 1 }));
        // wait 500ms to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setSelectedIds([]);
    setIsBulkRetrying(false);
    setBulkProgress({ current: 0, total: 0 });
    loadItems(); // reload from source after bulk
  };

  const handleRetry = async (item, isBulk = false) => {
    setRetryingId(item.id);
    try {
      const key = sessionStorage.getItem('AXIM_AUTH_KEY');
      const response = await apiFetch('/v1/management/dlq-retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ record_id: item.id })
      });

      if (response.ok) {
        if (!isBulk) {
          setItems(prev => prev.filter(i => i.id !== item.id));
        }
        if (onRetrySuccess) onRetrySuccess();
      } else {
        const errText = await response.text();
        alert(`Failed to retry: ${response.status} ${errText}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error retrying record");
    } finally {
      setRetryingId(null);
    }
  };

  const handleUpdate = async () => {
    await recoveryService.update(editingItem.id, editPayload);
    setItems(items.map(i => i.id === editingItem.id ? { ...i, payload: editPayload } : i));
    setEditingItem(null);
  };

  const handleDelete = async (id) => {
    await recoveryService.remove(id);
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white font-bold text-xl tracking-tight">Dead Letter Queue</h3>
          <p className="dark:text-gray-500 text-gray-500 text-xs mt-1">Manual intervention required.</p>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1 dark:bg-gray-700 bg-gray-100 dark:text-gray-300 text-gray-800 rounded text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <span className="dark:text-gray-400 text-gray-600 text-xs">Page {Math.floor(offset / limit) + 1}</span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={!hasMore}
              className="px-3 py-1 dark:bg-gray-700 bg-gray-100 dark:text-gray-300 text-gray-800 rounded text-xs disabled:opacity-50"
            >
              Next
            </button>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-4">
            {isBulkRetrying && (
              <span className="dark:text-gray-400 text-gray-600 text-xs font-mono">
                Retrying {bulkProgress.current} of {bulkProgress.total}...
              </span>
            )}
            <button
              onClick={handleBulkRetry}
              disabled={isBulkRetrying}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
            >
              <SafeIcon icon={FiRefreshCw} className={isBulkRetrying ? "animate-spin" : ""} />
              {isBulkRetrying ? "PROCESSING..." : `RETRY SELECTED (${selectedIds.length})`}
            </button>
          </div>
        )}
      </div>

      <div className="dark:bg-gray-800 bg-white/50 border dark:border-gray-700 border-gray-200 rounded-2xl overflow-hidden shadow-2xl overflow-x-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 dark:bg-gray-800 bg-white dark:text-gray-500 text-gray-500 text-[10px] uppercase font-black tracking-widest border-b dark:border-gray-700 border-gray-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length && items.length > 0}
                  onChange={handleSelectAll}
                  disabled={items.length === 0 || isBulkRetrying}
                  className="rounded dark:border-gray-600 border-gray-300 dark:bg-gray-700 bg-gray-100 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </th>
              <th className="px-6 py-4">Origin</th>
              <th className="px-6 py-4">Reason</th>
              <th className="px-6 py-4">Destination</th>
              <th className="px-6 py-4">Payload Preview</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            <AnimatePresence>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center text-slate-600 animate-pulse">Loading recovery queue...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center text-slate-600 italic">Queue is currently empty.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: 20 }}
                    key={item.id} 
                    className={`hover:dark:bg-gray-700 bg-gray-100/20 group transition-colors ${selectedIds.includes(item.id) ? 'dark:bg-gray-700 bg-gray-100/40' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelect(item.id)}
                        disabled={isBulkRetrying}
                        className="rounded dark:border-gray-600 border-gray-300 dark:bg-gray-700 bg-gray-100 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-blue-400 font-mono text-[10px]">{item.id}</div>
                      <div className="text-[11px] dark:text-gray-400 text-gray-600 font-bold">{item.source}</div>
                    </td>
                    <td className="px-6 py-4">
                      {item.reason === '[OUTBOUND_SYNC_FAILED]' ? (
                        <div className="flex items-center gap-2 text-orange-400 text-xs font-medium bg-orange-900/30 px-2 py-1 rounded-full border border-orange-800/50 w-fit">
                          <SafeIcon icon={FiAlertCircle} /> Deskera Sync Failed
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                          <SafeIcon icon={FiAlertCircle} /> {item.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        let dest = 'Unknown';
                        try {
                          const parsed = JSON.parse(item.payload);
                          dest = parsed.destination || (item.reason.includes('Albato') ? 'Albato' : (item.reason.includes('Core') ? 'Core' : 'Unknown'));
                        } catch(e) {
                          dest = item.reason.includes('Albato') ? 'Albato' : (item.reason.includes('Core') ? 'Core' : 'Unknown');
                        }
                        if (dest === 'Albato') return <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-900 text-blue-300 border-blue-700">Sales CRM</span>;
                        if (dest === 'Core') return <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-900 text-purple-300 border-purple-700">AXiM Core</span>;
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold border dark:bg-gray-700 bg-gray-100 dark:text-gray-300 text-gray-800 dark:border-gray-600 border-gray-300">{dest}</span>;
                      })()}
                    </td>
                    <td className="px-6 py-4">
{(() => {
                        if (item.payload.includes('[SYSTEM_DEGRADED]')) {
                             return <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-red-900/50 text-red-300 border-red-700">System Alert</span>;
                        }
                        try {
                          const parsed = JSON.parse(item.payload);
                          if (parsed.telemetry_envelope) {
                             return <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-red-900/50 text-red-300 border-red-700">System Alert</span>;
                          }
                        } catch(e) { /* ignore */ }
                        return (
                          <code className="text-[10px] dark:text-gray-500 text-gray-500 truncate max-w-[200px] block">
                            {item.payload}
                          </code>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(() => {
                        let isSystemAlert = item.payload.includes('[SYSTEM_DEGRADED]');
                        if (!isSystemAlert) {
                          try {
                            const parsed = JSON.parse(item.payload);
                            if (parsed.telemetry_envelope) {
                               isSystemAlert = true;
                            }
                          } catch(e) { /* ignore */ }
                        }

                        return (
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => { setEditingItem(item); setEditPayload(item.payload); }}
                              disabled={isSystemAlert}
                              className={`p-2 dark:bg-gray-700 bg-gray-100 rounded-lg transition-colors ${isSystemAlert ? 'text-slate-600 opacity-50 cursor-not-allowed' : 'hover:bg-blue-600 dark:bg-blue-600/20 dark:text-gray-400 text-gray-600 hover:text-blue-400'}`}
                            >
                              <SafeIcon icon={FiEdit3} />
                            </button>
                            {isSystemAlert ? (
                              <button
                                onClick={() => handleDismiss(item.id)}
                                className="p-2 dark:bg-gray-700 bg-gray-100 hover:bg-orange-600/20 text-orange-400 rounded-lg transition-colors flex items-center gap-1"
                                title="Dismiss Alert"
                              >
                                <span className="text-[10px] font-bold">DISMISS</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRetry(item)}
                                disabled={retryingId === item.id}
                                className={`p-2 dark:bg-gray-700 bg-gray-100 rounded-lg transition-colors flex items-center gap-1 ${retryingId === item.id ? 'text-slate-600 opacity-50 cursor-not-allowed' : 'hover:bg-emerald-600/20 dark:text-gray-400 text-gray-600 hover:text-emerald-400'}`}
                              >
                                {retryingId === item.id ? <span className="text-[10px] animate-pulse">Retrying...</span> : <SafeIcon icon={FiRefreshCw} />}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-2 dark:bg-gray-700 bg-gray-100 hover:bg-red-600/20 dark:text-gray-400 text-gray-600 hover:text-red-400 rounded-lg transition-colors"
                            >
                              <SafeIcon icon={FiTrash2} />
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {editingItem && (
        <div className="fixed inset-0 dark:bg-gray-900 bg-gray-50/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="dark:bg-gray-800 bg-white border dark:border-gray-700 border-gray-200 w-full max-w-2xl rounded-2xl shadow-2xl">
            <div className="p-6 border-b dark:border-gray-700 border-gray-200 flex justify-between items-center">
              <h4 className="text-white font-bold flex items-center gap-2">
                <SafeIcon icon={FiEdit3} className="text-blue-400" />
                Repair Payload: {editingItem.id}
              </h4>
              <button onClick={() => setEditingItem(null)} className="dark:text-gray-500 text-gray-500 hover:text-white"><SafeIcon icon={FiX} /></button>
            </div>
            <div className="p-6">
              <textarea 
                className="w-full h-64 dark:bg-gray-900 bg-gray-50 text-blue-400 font-mono text-sm p-4 rounded-xl border dark:border-gray-700 border-gray-200 focus:border-blue-500 outline-none"
                value={editPayload}
                onChange={(e) => setEditPayload(e.target.value)}
              />
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-xs font-bold dark:text-gray-400 text-gray-600">CANCEL</button>
                <button 
                  onClick={handleUpdate}
                  className="px-6 py-2 bg-blue-600 dark:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2"
                >
                  <SafeIcon icon={FiCheck} /> SAVE CHANGES
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}