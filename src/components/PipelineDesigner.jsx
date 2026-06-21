import React from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiArrowRight, FiCheck, FiFilter, FiDatabase, FiShuffle, FiShield, FiExternalLink } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function PipelineDesigner() {
  const steps = [
    { id: 1, name: 'Ingress Gateway', type: 'Source', icon: FiDatabase, status: 'Active', desc: 'Accepts Webhooks & API Ingest' },
    { id: 2, name: 'Sanitization V8', type: 'Processor', icon: FiFilter, status: 'Active', desc: 'Normalization & Regex Cleaning' },
    { id: 3, name: 'KV Deduplication', type: 'Logic', icon: FiShield, status: 'Active', desc: '30-day sliding window check' },
    { id: 4, name: 'Enrichment Hub', type: 'Plugin', icon: FiShuffle, status: 'Warning', desc: 'Clearbit API (High Latency)', warning: true },
    { id: 5, name: 'Albato Egress', type: 'Destination', icon: FiExternalLink, status: 'Active', desc: 'CRM Dispatch & Sync' },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <SafeIcon icon={FiShuffle} className="text-9xl text-blue-500" />
        </div>
        
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-white mb-2">Visual Pipeline Orchestrator</h3>
          <p className="text-slate-500 text-sm max-w-2xl mb-12">
            Configure how data traverses the edge. Each node represents a synchronous execution block within the Cloudflare Worker isolate.
          </p>

          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {steps.map((step, i) => (
              <React.Fragment key={step.id}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative flex flex-col items-center p-6 rounded-2xl border-2 w-full lg:w-48 transition-all hover:scale-105 ${step.warning ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-950 border-slate-800'}`}
                >
                  <div className={`p-4 rounded-xl mb-4 ${step.warning ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-600/10 text-blue-400'}`}>
                    <SafeIcon icon={step.icon} className="text-2xl" />
                  </div>
                  <h4 className="text-white text-xs font-black uppercase tracking-tighter text-center">{step.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 text-center leading-tight h-8">{step.desc}</p>
                  
                  <div className="mt-4 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${step.warning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{step.status}</span>
                  </div>
                </motion.div>
                {i < steps.length - 1 && (
                  <div className="hidden lg:block">
                    <SafeIcon icon={FiArrowRight} className="text-slate-800 text-xl" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2">
            <SafeIcon icon={FiShield} className="text-emerald-400" />
            Active Security Policies
          </h4>
          <div className="space-y-3">
            {['TLS 1.3 Mandatory', 'IP Whitelisting (NOC Only)', 'AES-256 Payload Encryption', 'HMAC Signature Verification'].map(policy => (
              <div key={policy} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-300">{policy}</span>
                <SafeIcon icon={FiCheck} className="text-emerald-500 text-sm" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h4 className="text-white font-bold mb-4 flex items-center gap-2">
            <SafeIcon icon={FiExternalLink} className="text-blue-400" />
            Egress Endpoints
          </h4>
          <div className="space-y-3">
            {[
              { name: 'Albato Production', url: 'h.albato.com/wh/prod_882', delay: '12ms' },
              { name: 'Cold Storage (S3)', url: 'archive.axim.us/ingest', delay: '42ms' },
            ].map(dest => (
              <div key={dest.name} className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-200">{dest.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{dest.delay}</span>
                </div>
                <code className="text-[10px] text-blue-400/60 mt-1 block truncate">{dest.url}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}