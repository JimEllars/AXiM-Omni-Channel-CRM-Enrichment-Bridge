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

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await recoveryService.getAll();
      setItems(data);
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
    try {
      setItems(items.filter(i => i.id !== id)); // optimistic UI update
      const key = import.meta.env.VITE_AXIM_INTERNAL_KEY;
      const response = await fetch(`/v1/management/dlq-dismiss?recordId=${encodeURIComponent(id)}`, {
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
      // reload to revert optimistic UI update on error
      loadItems();
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
      const payload = JSON.parse(item.payload);
      const result = sanitizeLeadData(payload);
      if (result.isValid) {
        const response = await fetch('/v1/webhooks/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AXiM-Internal-Auth': import.meta.env.VITE_AXIM_INTERNAL_KEY
          },
          body: JSON.stringify({ source: 'dlq_retry', records: [result] })
        });

        if (response.status === 202) {
          await recoveryService.remove(item.id);
          if (!isBulk) {
            setItems(prev => prev.filter(i => i.id !== item.id));
          }
          if (onRetrySuccess) onRetrySuccess(result);
          // Optional toast
          // alert(`Successfully re-queued payload for ID: ${item.id}`);
        } else {
           const errText = await response.text();
           alert(`Failed to retry: ${response.status} ${errText}`);
        }
      } else {
        alert(`Validation Failed: ${result._error || 'Check fields'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Invalid JSON payload");
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
          <p className="text-slate-500 text-xs mt-1">Manual intervention required for {items.length} failed records.</p>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-4">
            {isBulkRetrying && (
              <span className="text-slate-400 text-xs font-mono">
                Retrying {bulkProgress.current} of {bulkProgress.total}...
              </span>
            )}
            <button
              onClick={handleBulkRetry}
              disabled={isBulkRetrying}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
            >
              <SafeIcon icon={FiRefreshCw} className={isBulkRetrying ? "animate-spin" : ""} />
              {isBulkRetrying ? "PROCESSING..." : `RETRY SELECTED (${selectedIds.length})`}
            </button>
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl overflow-x-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length && items.length > 0}
                  onChange={handleSelectAll}
                  disabled={items.length === 0 || isBulkRetrying}
                  className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
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
                    className={`hover:bg-slate-800/20 group transition-colors ${selectedIds.includes(item.id) ? 'bg-slate-800/40' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelect(item.id)}
                        disabled={isBulkRetrying}
                        className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-blue-400 font-mono text-[10px]">{item.id}</div>
                      <div className="text-[11px] text-slate-400 font-bold">{item.source}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                        <SafeIcon icon={FiAlertCircle} /> {item.reason}
                      </div>
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
                        return <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-800 text-slate-300 border-slate-700">{dest}</span>;
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
                          <code className="text-[10px] text-slate-500 truncate max-w-[200px] block">
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
                              className={`p-2 bg-slate-800 rounded-lg transition-colors ${isSystemAlert ? 'text-slate-600 opacity-50 cursor-not-allowed' : 'hover:bg-blue-600/20 text-slate-400 hover:text-blue-400'}`}
                            >
                              <SafeIcon icon={FiEdit3} />
                            </button>
                            {isSystemAlert ? (
                              <button
                                onClick={() => handleDismiss(item.id)}
                                className="p-2 bg-slate-800 hover:bg-orange-600/20 text-orange-400 rounded-lg transition-colors flex items-center gap-1"
                                title="Dismiss Alert"
                              >
                                <span className="text-[10px] font-bold">DISMISS</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRetry(item)}
                                disabled={retryingId === item.id}
                                className={`p-2 bg-slate-800 rounded-lg transition-colors flex items-center gap-1 ${retryingId === item.id ? 'text-slate-600 opacity-50 cursor-not-allowed' : 'hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400'}`}
                              >
                                {retryingId === item.id ? <span className="text-[10px] animate-pulse">Retrying...</span> : <SafeIcon icon={FiRefreshCw} />}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-2 bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h4 className="text-white font-bold flex items-center gap-2">
                <SafeIcon icon={FiEdit3} className="text-blue-400" />
                Repair Payload: {editingItem.id}
              </h4>
              <button onClick={() => setEditingItem(null)} className="text-slate-500 hover:text-white"><SafeIcon icon={FiX} /></button>
            </div>
            <div className="p-6">
              <textarea 
                className="w-full h-64 bg-slate-950 text-blue-400 font-mono text-sm p-4 rounded-xl border border-slate-800 focus:border-blue-500 outline-none"
                value={editPayload}
                onChange={(e) => setEditPayload(e.target.value)}
              />
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setEditingItem(null)} className="px-4 py-2 text-xs font-bold text-slate-400">CANCEL</button>
                <button 
                  onClick={handleUpdate}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2"
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