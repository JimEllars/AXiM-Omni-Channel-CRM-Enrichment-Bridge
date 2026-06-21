import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiLock, FiExternalLink, FiTerminal, FiKey, FiSave, FiCheck } from 'react-icons/fi';
import { storage } from '../utils/storage';

export default function ConfigView() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setWebhookUrl(storage.get('egress_url', 'https://h.albato.com/wh/prod_882'));
  }, []);

  const handleSave = () => {
    storage.set('egress_url', webhookUrl);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const envVars = [
    { key: 'AXIM_INTERNAL_KEY', desc: 'Secure token for AXiM internal service auth', status: 'Encrypted' },
    { key: 'ENVIRONMENT', desc: 'Execution context (production/staging)', status: 'Active' },
    { key: 'KV_REPLICATION', desc: 'Global edge consistency level', status: 'Optimal' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-8 shadow-xl">
          <h3 className="text-white font-bold mb-6 flex items-center gap-3 text-lg">
            <SafeIcon icon={FiTerminal} className="text-blue-400" />
            Environment Secrets & Routing
          </h3>
          
          <div className="mb-8">
            <label className="text-[10px] font-black text-slate-500 uppercase mb-3 block tracking-widest">Albato Egress Webhook</label>
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none transition-all"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <button 
                onClick={handleSave}
                className={`px-6 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${isSaved ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                <SafeIcon icon={isSaved ? FiCheck : FiSave} /> {isSaved ? 'SAVED' : 'UPDATE'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {envVars.map((v) => (
              <div key={v.key} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 group hover:border-slate-700 transition-colors">
                <div>
                  <p className="text-xs font-mono text-blue-400 group-hover:text-blue-300 transition-colors">{v.key}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{v.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-3 py-1 rounded-full uppercase font-black tracking-tighter">{v.status}</span>
                  <SafeIcon icon={FiLock} className="text-slate-700 text-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl border border-blue-500/20 p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-700">
          <SafeIcon icon={FiKey} className="text-9xl text-white" />
        </div>
        
        <div className="relative z-10">
          <h3 className="text-white font-black text-2xl mb-4 leading-tight">Ready for Edge Deployment</h3>
          <p className="text-blue-100/70 text-sm leading-relaxed mb-8">
            The worker is optimized for Cloudflare's V8 isolate architecture. Once satisfied with the sandbox results, push your logic to production.
          </p>
        </div>
        
        <div className="relative z-10">
          <code className="block bg-slate-950/40 backdrop-blur-md p-4 rounded-xl text-xs text-blue-100 font-mono mb-6 border border-white/10">
            $ axim deploy --prod
          </code>
          <button className="w-full flex items-center justify-center gap-2 bg-white text-blue-900 py-3 rounded-xl text-xs font-black transition-all hover:bg-blue-50 shadow-xl">
            GO LIVE NOW <SafeIcon icon={FiExternalLink} />
          </button>
        </div>
      </div>
    </div>
  );
}