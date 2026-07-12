import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiGlobe, FiLinkedin, FiMail, FiPlus, FiTrash2, FiActivity } from 'react-icons/fi';
import { sourceService } from '../services/sourceService';
import { motion, AnimatePresence } from 'framer-motion';

export default function SourcesView() {
  const [sources, setSources] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', type: 'Webhook' });
  const [loading, setLoading] = useState(true);
  const [agentUploads, setAgentUploads] = useState(0);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await sourceService.getAll();
      setSources(data);
      try {
        const response = await fetch('/v1/management/analytics', {
          headers: {
            'X-AXiM-Internal-Auth': sessionStorage.getItem('AXIM_AUTH_KEY') || ''
          }
        });
        if (response.ok) {
          const analyticsData = await response.json();
          setAgentUploads(analyticsData.agent_uploads || 0);
        }
      } catch (err) {
        console.error('Failed to fetch analytics in SourcesView:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const addSource = async () => {
    if (!newSource.name) return;
    const added = await sourceService.add({
      ...newSource,
      icon: newSource.type === 'Webhook' ? 'Globe' : 'Activity'
    });
    setSources([...sources, added]);
    setShowAdd(false);
    setNewSource({ name: '', type: 'Webhook' });
  };

  const deleteSource = async (id) => {
    await sourceService.delete(id);
    setSources(sources.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white font-bold text-xl tracking-tight">Ingress Gateways</h3>
          <p className="text-slate-500 text-xs text uppercase tracking-widest mt-1">Cloud-connected Source Registry</p>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <SafeIcon icon={FiPlus} /> REGISTER SOURCE
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-30">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-indigo-900/40 border border-indigo-500/30 p-6 rounded-2xl transition-all group relative overflow-hidden shadow-lg shadow-indigo-900/20"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="p-3 rounded-xl bg-indigo-950 border border-indigo-800 text-indigo-400 group-hover:scale-110 transition-transform shadow-inner shadow-indigo-500/10">
                <SafeIcon icon={FiActivity} className="text-2xl" />
              </div>
            </div>

            <h4 className="text-white font-bold text-lg">Onyx Desktop Agent</h4>
            <p className="text-[10px] text-indigo-300 uppercase tracking-[0.2em] mb-6 font-black">AI BATCH INGESTION</p>

            <div className="flex justify-between items-end border-t border-indigo-800/50 pt-4">
              <div>
                <p className="text-[10px] text-indigo-300 uppercase font-bold tracking-tighter">Total Ingested</p>
                <p className="text-2xl font-black text-white">{agentUploads.toLocaleString()}</p>
              </div>
              <span className="px-2 py-1 rounded text-[9px] font-black border text-indigo-400 bg-indigo-400/10 border-indigo-400/20 uppercase">
                Active / Secured
              </span>
            </div>
          </motion.div>
          <AnimatePresence>
            {sources.map((source) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={source.id} 
                className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-blue-500/30 transition-all group relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-blue-400 group-hover:scale-110 transition-transform">
                    <SafeIcon name={source.icon} className="text-2xl" />
                  </div>
                  <button 
                    onClick={() => deleteSource(source.id)}
                    className="text-slate-700 hover:text-red-400 p-2 transition-colors"
                  >
                    <SafeIcon icon={FiTrash2} />
                  </button>
                </div>
                
                <h4 className="text-white font-bold text-lg">{source.name}</h4>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mb-6 font-black">{source.type}</p>
                
                <div className="flex justify-between items-end border-t border-slate-800 pt-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Total Ingested</p>
                    <p className="text-2xl font-black text-white">{source.count.toLocaleString()}</p>
                  </div>
                  <span className="px-2 py-1 rounded text-[9px] font-black border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 uppercase">
                    {source.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h4 className="text-xl font-bold text-white mb-6">Register New Gateway</h4>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Source Name</label>
                <input 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="e.g. Apollo Export Hub"
                  value={newSource.name}
                  onChange={e => setNewSource({...newSource, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Protocol</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none appearance-none"
                  value={newSource.type}
                  onChange={e => setNewSource({...newSource, type: e.target.value})}
                >
                  <option>Webhook</option>
                  <option>API Ingest</option>
                  <option>IMAP Stream</option>
                </select>
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => setShowAdd(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                CANCEL
              </button>
              <button 
                onClick={addSource}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
              >
                CREATE NODE
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}