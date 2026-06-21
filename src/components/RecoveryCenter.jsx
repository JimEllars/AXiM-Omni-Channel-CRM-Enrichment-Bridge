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

  const handleRetry = async (item) => {
    try {
      const payload = JSON.parse(item.payload);
      const result = sanitizeLeadData(payload);
      if (result.isValid) {
        await recoveryService.remove(item.id);
        setItems(items.filter(i => i.id !== item.id));
        if (onRetrySuccess) onRetrySuccess(result);
      } else {
        alert(`Validation Failed: ${result._error || 'Check fields'}`);
      }
    } catch (e) {
      alert("Invalid JSON payload");
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
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-slate-800/30 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Origin</th>
              <th className="px-6 py-4">Reason</th>
              <th className="px-6 py-4">Payload Preview</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            <AnimatePresence>
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-20 text-center text-slate-600 animate-pulse">Loading recovery queue...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-20 text-center text-slate-600 italic">Queue is currently empty.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: 20 }}
                    key={item.id} 
                    className="hover:bg-slate-800/20 group transition-colors"
                  >
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
                      <code className="text-[10px] text-slate-500 truncate max-w-[200px] block">
                        {item.payload}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => { setEditingItem(item); setEditPayload(item.payload); }}
                          className="p-2 bg-slate-800 hover:bg-blue-600/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiEdit3} />
                        </button>
                        <button 
                          onClick={() => handleRetry(item)}
                          className="p-2 bg-slate-800 hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiRefreshCw} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                        >
                          <SafeIcon icon={FiTrash2} />
                        </button>
                      </div>
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