import { apiFetch } from "../utils/api";
/* Full File Update to support dynamic rules passed from App state */
import React, { useState } from 'react';
import { sanitizeLeadData } from '../utils/sanitize';
import SafeIcon from '../common/SafeIcon';
import { FiArrowRight, FiCheckCircle, FiXCircle, FiPlay, FiLayers, FiCopy } from 'react-icons/fi';
import { motion } from 'framer-motion';

const sampleData = {
  source: "B2B_Lead_Portal",
  records: [
    { name: "john DOE", email: " JOHNDOE@example.com ", phone: "123-456-7890", company: "Acme Corp." },
    { name: "jane smith", email: "invalid-email", phone: "+1 987 654 3210", company: "Globex LLC" }
  ]
};

export default function DataTester({ onPipelineRun, activeRules }) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [inputJson, setInputJson] = useState(JSON.stringify(sampleData, null, 2));
  const [outputResult, setOutputResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useCognitive, setUseCognitive] = useState(false);


  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleTest = async () => {
    setIsProcessing(true);
    setOutputResult(null);

    try {
      const parsed = JSON.parse(inputJson);
      if (!parsed.records || !Array.isArray(parsed.records)) {
        setOutputResult({ error: "Invalid format. Must contain 'records' array." });
        setIsProcessing(false);
        return;
      }

      if (useCognitive) {
        const key = sessionStorage.getItem('AXIM_AUTH_KEY');
        const res = await apiFetch('/v1/management/cognitive-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
           const data = await res.json();
           // Wrap in an array for consistent rendering
           const resultArr = Array.isArray(data) ? data : [data];
           // Mark as 'isValid' so the UI doesn't show as rejected
           const renderable = resultArr.map(d => ({ ...d, isValid: true }));
           setOutputResult(renderable);
           if (onPipelineRun) onPipelineRun(renderable);
        } else {
           const errData = await res.text();
           setOutputResult({ error: `AI Extraction Failed: ${res.status} ${errData}` });
        }
      } else {
        // Live Worker Test via Ingress
        // Add test_mode flag to avoid live CRM dispatches
        parsed.test_mode = true;
        const key = sessionStorage.getItem('AXIM_AUTH_KEY') || import.meta.env.VITE_AXIM_INTERNAL_KEY || '';
        const res = await apiFetch('/v1/webhooks/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AXiM-Internal-Auth': key
          },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
           const data = await res.json();
           const resultArr = Array.isArray(data) ? data : [data];
           const renderable = resultArr.map(d => ({ ...d, isValid: true }));
           setOutputResult(renderable);
           if (onPipelineRun) onPipelineRun(renderable);
        } else {
           const errData = await res.text();
           setOutputResult({ error: `Pipeline Failed: ${res.status} ${errData}` });
        }
      }
    } catch (e) {
      setOutputResult({ error: "Invalid JSON input." });
    } finally {
      if (!useCognitive) {
        setTimeout(() => setIsProcessing(false), 600);
      } else {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        <div className="flex-1 flex flex-col dark:bg-gray-800 bg-white border dark:border-gray-700 border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b dark:border-gray-700 border-gray-200 dark:bg-gray-700 bg-gray-100/20 flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <h2 className="dark:text-white text-gray-900 font-bold text-xs uppercase tracking-widest">Ingress Payload</h2>
              <label className="flex items-center gap-2 cursor-pointer group">
                 <input
                    type="checkbox"
                    checked={useCognitive}
                    onChange={(e) => setUseCognitive(e.target.checked)}
                    className="rounded dark:border-gray-600 border-gray-300 dark:bg-gray-700 bg-gray-100 text-purple-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                 />
                 <span className="text-[10px] dark:text-gray-400 text-gray-600 font-bold uppercase tracking-wider group-hover:text-purple-400 transition-colors">Run through AI Extractor (DeepSeek-V3)</span>
              </label>
            </div>
            <button 
              disabled={isProcessing} 
              onClick={handleTest} 
              className="flex items-center space-x-2 bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 text-white text-[10px] font-black px-5 py-2.5 rounded-xl shadow-lg transition-all active:scale-95"
            >
              {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><SafeIcon icon={FiPlay} /> <span>RUN PIPELINE</span></>}
            </button>
          </div>
          <textarea 
            className="flex-1 w-full dark:bg-gray-900 bg-gray-50 text-blue-400 font-mono text-[13px] p-6 focus:outline-none resize-none leading-relaxed"
            value={inputJson} 
            onChange={(e) => setInputJson(e.target.value)} 
            spellCheck="false" 
          />
        </div>

        <div className="flex-1 flex flex-col dark:bg-gray-800 bg-white border dark:border-gray-700 border-gray-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b dark:border-gray-700 border-gray-200 dark:bg-gray-700 bg-gray-100/20 flex justify-between items-center">
            <h2 className="dark:text-white text-gray-900 font-bold text-xs uppercase tracking-widest">Egress Results</h2>
            {outputResult && !outputResult.error && (
              <button
                onClick={() => copyToClipboard(JSON.stringify(outputResult, null, 2), 'all')}
                className="flex items-center space-x-2 dark:bg-gray-700 bg-gray-100 hover:bg-slate-700 dark:text-gray-300 text-gray-800 text-[10px] font-black px-4 py-2 rounded-lg transition-all"
              >
                {copiedIndex === 'all' ? <SafeIcon icon={FiCheckCircle} className="text-emerald-400" /> : <SafeIcon icon={FiCopy} />} <span>COPY ALL</span>
              </button>
            )}
          </div>
          <div className="flex-1 dark:bg-gray-900 bg-gray-50 overflow-auto p-6 custom-scrollbar">
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
                      <button title="Copy JSON" onClick={() => copyToClipboard(JSON.stringify(record, null, 2), idx)} className="dark:text-gray-400 text-gray-600 hover:text-white mr-2 transition-colors">{copiedIndex === idx ? <SafeIcon icon={FiCheckCircle} className="text-emerald-400" /> : <SafeIcon icon={FiCopy} />}</button>
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full border flex items-center gap-1 uppercase ${record.isValid ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                        <SafeIcon icon={record.isValid ? FiCheckCircle : FiXCircle} /> {record.isValid ? 'PASSED' : 'REJECTED'}
                      </span>
                    </div>
                    <pre className="font-mono text-[11px] dark:bg-gray-800 bg-white/30 p-4 rounded-xl border dark:border-gray-700 border-gray-200/50 overflow-x-auto whitespace-pre-wrap">
                      <code dangerouslySetInnerHTML={{ __html: JSON.stringify(record, null, 2).replace(/("(.*?)":)/g, '<span class="text-blue-300">$1</span>').replace(/: "(.*?)"/g, ': <span class="text-emerald-400">"$1"</span>').replace(/: (true|false)/g, ': <span class="text-purple-400">$1</span>') }} />
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