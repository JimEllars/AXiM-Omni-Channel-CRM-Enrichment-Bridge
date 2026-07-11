import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiLock, FiExternalLink, FiTerminal, FiKey, FiSave, FiCheck, FiShield } from 'react-icons/fi';
import { configService } from '../services/configService';

export default function ConfigView() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [envVars, setEnvVars] = useState([
    { key: 'AXIM_INTERNAL_KEY', desc: 'Secure token for AXiM internal service auth', status: 'Encrypted' },
    { key: 'ENVIRONMENT', desc: 'Execution context (production/staging)', status: 'Active' },
    { key: 'KV_REPLICATION', desc: 'Global edge consistency level', status: 'Optimal' },
  ]);

  useEffect(() => {
    async function load() {
      const url = await configService.get('egress_url', 'https://h.albato.com/wh/prod_882');
      setWebhookUrl(url);
    }
    load();
  }, []);


  const handleSave = async () => {
    // 1. Save to Google Sheets
    await configService.set('egress_url', webhookUrl);

    // 2. Trigger KV Sync Endpoint
    try {
      const syncRes = await fetch('/v1/management/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY')}`
        }
      });
      if (!syncRes.ok) {
        console.error('Failed to sync KV cache on the edge', await syncRes.text());
      }
    } catch (e) {
      console.error('Error triggering KV sync:', e);
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-8 shadow-xl">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-white font-bold flex items-center gap-3 text-lg uppercase italic tracking-tighter">
                <SafeIcon icon={FiTerminal} className="text-blue-400" />
                Environment Secrets & Routing
              </h3>
              <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">Backend: Google Sheets Config Hub</p>
            </div>
            <SafeIcon icon={FiShield} className="text-slate-700 text-xl" />
          </div>

          <div className="mb-10">
            <label className="text-[10px] font-black text-slate-500 uppercase mb-3 block tracking-widest">Albato Egress Webhook</label>
            <div className="flex gap-3">
              <input 
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none transition-all shadow-inner"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <button 
                onClick={handleSave}
                className={`px-8 rounded-xl font-black text-xs flex items-center gap-2 transition-all shadow-lg ${isSaved ? 'bg-emerald-600 text-white shadow-emerald-600/20' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20'}`}
              >
                <SafeIcon icon={isSaved ? FiCheck : FiSave} />
                {isSaved ? 'SYNCED' : 'UPDATE'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Global Environment Variables</p>
            {envVars.map((v) => (
              <div key={v.key} className="flex items-center justify-between p-5 bg-slate-950/50 rounded-2xl border border-slate-800 group hover:border-slate-600 transition-all">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-slate-900 rounded-lg text-slate-600 group-hover:text-blue-400 transition-colors">
                    <SafeIcon icon={FiLock} />
                  </div>
                  <div>
                    <p className="text-xs font-mono text-blue-400 group-hover:text-blue-300 transition-colors">{v.key}</p>
                    <p className="text-[10px] text-slate-600 mt-1 font-bold">{v.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-slate-400 bg-slate-800 px-3 py-1 rounded-full uppercase font-black tracking-widest border border-slate-700">
                    {v.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl border border-blue-500/20 p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
          <SafeIcon icon={FiKey} className="text-9xl text-white" />
        </div>
        <div className="relative z-10">
          <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center text-white mb-8 backdrop-blur-md border border-white/10">
             <SafeIcon icon={FiKey} className="text-xl" />
          </div>
          <h3 className="text-white font-black text-2xl mb-4 leading-tight uppercase italic tracking-tighter">Ready for Edge Deployment</h3>
          <p className="text-blue-100/60 text-sm leading-relaxed mb-10">
            The worker is optimized for Cloudflare's V8 isolate architecture. Once satisfied with the sandbox results, push your logic to production.
          </p>
        </div>
        <div className="relative z-10">
          <code className="block bg-slate-950/60 backdrop-blur-md p-5 rounded-xl text-xs text-emerald-400 font-mono mb-8 border border-white/5 shadow-inner">
            $ axim deploy --prod --skip-ci
          </code>
          <button className="w-full flex items-center justify-center gap-3 bg-white text-blue-900 py-4 rounded-xl text-xs font-black transition-all hover:bg-blue-50 shadow-2xl uppercase tracking-widest">
            GO LIVE NOW
            <SafeIcon icon={FiExternalLink} />
          </button>
        </div>
      </div>
    </div>
  );
}