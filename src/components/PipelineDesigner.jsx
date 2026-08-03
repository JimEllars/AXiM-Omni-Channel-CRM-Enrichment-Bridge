import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiArrowRight, FiCheck, FiFilter, FiDatabase, FiShuffle, FiShield, FiExternalLink, FiSave, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { configService } from '../services/configService';

export default function PipelineDesigner() {
  const [steps, setSteps] = useState([
    { id: 1, name: 'Ingress Gateway', type: 'Source', icon: FiDatabase, status: 'Active', desc: 'Accepts Webhooks & API Ingest', enabled: true },
    { id: 2, name: 'Sanitization V8', type: 'Processor', icon: FiFilter, status: 'Active', desc: 'Normalization & Regex Cleaning', enabled: true },
    { id: 3, name: 'KV Deduplication', type: 'Logic', icon: FiShield, status: 'Active', desc: '30-day sliding window check', enabled: true },
    { id: 4, name: 'Enrichment Hub', type: 'Plugin', icon: FiShuffle, status: 'Warning', desc: 'Clearbit API (High Latency)', enabled: false, warning: true },
    { id: 5, name: 'Albato Egress', type: 'Destination', icon: FiExternalLink, status: 'Active', desc: 'CRM Dispatch & Sync', enabled: true },
  ]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      const savedSteps = await configService.get('pipeline_designer_state', null);
      if (savedSteps) setSteps(savedSteps);
    }
    loadConfig();
  }, []);

  const toggleStep = (id) => {
    setSteps(current => current.map(step => 
      step.id === id ? { ...step, enabled: !step.enabled } : step
    ));
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    try {
      await configService.set('pipeline_designer_state', steps);
      // Also save to backend worker for dynamic rule execution
      const key = sessionStorage.getItem('AXIM_AUTH_KEY') || import.meta.env.VITE_AXIM_INTERNAL_KEY || '';
      try {
        await fetch('/v1/management/pipeline-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AXiM-Internal-Auth': key
          },
          body: JSON.stringify(steps)
        });
      } catch (err) {
        console.error("Failed to deploy pipeline to edge worker", err);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <SafeIcon icon={FiShuffle} className="text-9xl text-blue-500" />
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h3 className="text-xl font-bold text-white mb-2 uppercase italic tracking-tighter">Visual Pipeline Orchestrator</h3>
              <p className="text-slate-500 text-sm max-w-2xl">
                Configure the synchronous execution flow. Toggling nodes updates the Cloudflare Worker manifest in real-time.
              </p>
            </div>
            <button 
              onClick={saveConfiguration}
              disabled={isSaving}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${isSaving ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'}`}
            >
              {isSaving ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> : <SafeIcon icon={FiSave} />}
              {isSaving ? 'DEPLOYING...' : 'SAVE & DEPLOY'}
            </button>
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {steps.map((step, i) => (
              <React.Fragment key={step.id}>
                <motion.div 
                  onClick={() => toggleStep(step.id)}
                  whileHover={{ y: -5 }}
                  className={`relative flex flex-col items-center p-6 rounded-2xl border-2 w-full lg:w-48 cursor-pointer transition-all ${!step.enabled ? 'bg-slate-900/20 border-slate-800/50 grayscale opacity-40' : step.warning ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-950 border-slate-800'}`}
                >
                  <div className={`p-4 rounded-xl mb-4 ${!step.enabled ? 'bg-slate-800 text-slate-600' : step.warning ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-600/10 text-blue-400'}`}>
                    <SafeIcon icon={step.icon} className="text-2xl" />
                  </div>
                  <h4 className="text-white text-[10px] font-black uppercase tracking-widest text-center">{step.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 text-center leading-tight h-8">{step.desc}</p>
                  
                  <div className="mt-4 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${!step.enabled ? 'bg-slate-700' : step.warning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{step.enabled ? step.status : 'Disabled'}</span>
                  </div>
                </motion.div>
                {i < steps.length - 1 && (
                  <div className="hidden lg:block">
                    <SafeIcon icon={FiArrowRight} className={`text-xl ${steps[i].enabled && steps[i+1].enabled ? 'text-blue-500/40' : 'text-slate-800'}`} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase">
            <SafeIcon icon={FiShield} className="text-emerald-400" /> Active Security Policies
          </h4>
          <div className="space-y-3">
            {['TLS 1.3 Mandatory', 'IP Whitelisting (NOC Only)', 'AES-256 Payload Encryption', 'HMAC Signature Verification'].map(policy => (
              <div key={policy} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-lg group hover:border-emerald-500/30 transition-colors">
                <span className="text-xs text-slate-400 group-hover:text-slate-200">{policy}</span>
                <SafeIcon icon={FiCheck} className="text-emerald-500 text-sm" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase">
            <SafeIcon icon={FiExternalLink} className="text-blue-400" /> Egress Endpoints
          </h4>
          <div className="space-y-3">
            {[
              { name: 'Albato Production', url: 'h.albato.com/wh/prod_882', delay: '12ms', status: 'Healthy' },
              { name: 'Cold Storage (S3)', url: 'archive.axim.us/ingest', delay: '42ms', status: 'Healthy' },
            ].map(dest => (
              <div key={dest.name} className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg hover:border-blue-500/30 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-200">{dest.name}</span>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase font-black">{dest.status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <code className="text-[10px] text-blue-400/60 truncate">{dest.url}</code>
                  <span className="text-[10px] text-slate-600 font-mono">{dest.delay}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}