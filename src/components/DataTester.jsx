/* Full File Update to support dynamic rules passed from App state */
import React, { useState } from 'react';
import { sanitizeLeadData } from '../utils/sanitize';
import SafeIcon from '../common/SafeIcon';
import { FiArrowRight, FiCheckCircle, FiXCircle, FiPlay, FiLayers } from 'react-icons/fi';
import { motion } from 'framer-motion';

const sampleData = {
  source: "B2B_Lead_Portal",
  records: [
    { name: "john DOE", email: " JOHNDOE@example.com ", phone: "123-456-7890", company: "Acme Corp." },
    { name: "jane smith", email: "invalid-email", phone: "+1 987 654 3210", company: "Globex LLC" }
  ]
};

export default function DataTester({ onPipelineRun, activeRules }) {
  const [inputJson, setInputJson] = useState(JSON.stringify(sampleData, null, 2));
  const [outputResult, setOutputResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTest = () => {
    setIsProcessing(true);
    setTimeout(() => {
      try {
        const parsed = JSON.parse(inputJson);
        if (parsed.records && Array.isArray(parsed.records)) {
          const cleaned = parsed.records.map(record => sanitizeLeadData(record, activeRules));
          setOutputResult(cleaned);
          if (onPipelineRun) onPipelineRun(cleaned);
        } else {
          setOutputResult({ error: "Invalid format. Must contain 'records' array." });
        }
      } catch (e) {
        setOutputResult({ error: "Invalid JSON input." });
      } finally {
        setIsProcessing(false);
      }
    }, 600);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
            <h2 className="text-slate-200 font-bold text-xs uppercase tracking-widest">Ingress Payload</h2>
            <button 
              disabled={isProcessing} 
              onClick={handleTest} 
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black px-5 py-2.5 rounded-xl shadow-lg transition-all active:scale-95"
            >
              {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><SafeIcon icon={FiPlay} /> <span>RUN PIPELINE</span></>}
            </button>
          </div>
          <textarea 
            className="flex-1 w-full bg-slate-950 text-blue-400 font-mono text-[13px] p-6 focus:outline-none resize-none leading-relaxed" 
            value={inputJson} 
            onChange={(e) => setInputJson(e.target.value)} 
            spellCheck="false" 
          />
        </div>

        <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20">
            <h2 className="text-slate-200 font-bold text-xs uppercase tracking-widest">Egress Results</h2>
          </div>
          <div className="flex-1 bg-slate-950 overflow-auto p-6 custom-scrollbar">
            {!outputResult ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4 opacity-30">
                <SafeIcon icon={FiLayers} className="text-6xl" />
                <p className="font-black text-xs uppercase tracking-[0.3em]">Awaiting execution...</p>
              </div>
            ) : outputResult.error ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 font-mono text-xs">{outputResult.error}</div>
            ) : (
              <div className="space-y-4">
                {outputResult.map((record, idx) => (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={idx} className={`p-5 rounded-2xl border ${record.isValid ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-slate-600 font-mono text-[10px] font-black uppercase tracking-widest">LOG_ENT_{idx}</span>
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full border flex items-center gap-1 uppercase ${record.isValid ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                        <SafeIcon icon={record.isValid ? FiCheckCircle : FiXCircle} /> {record.isValid ? 'PASSED' : 'REJECTED'}
                      </span>
                    </div>
                    <pre className="text-blue-300 font-mono text-[11px] bg-slate-900/30 p-4 rounded-xl border border-slate-800/50 overflow-x-auto">
                      {JSON.stringify(record, null, 2)}
                    </pre>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}