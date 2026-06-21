import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiCheck, FiInfo, FiCode, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { storage } from '../utils/storage';

export default function RuleManifest({ onRulesChange }) {
  const [activeRules, setActiveRules] = useState({});

  useEffect(() => {
    const saved = storage.get('pipeline_rules', {
      'R-01': true,
      'R-02': true,
      'R-03': true,
      'R-04': true
    });
    setActiveRules(saved);
  }, []);

  const toggleRule = (id) => {
    const updated = { ...activeRules, [id]: !activeRules[id] };
    setActiveRules(updated);
    storage.set('pipeline_rules', updated);
    if (onRulesChange) onRulesChange(updated);
  };

  const rules = [
    { id: 'R-01', name: 'Name Normalization', pattern: '/\\s+/', logic: 'Split full name into First/Last parts and apply Proper Case.' },
    { id: 'R-02', name: 'E.164 Formatting', pattern: '/\\D/g', logic: 'Strip non-digits. Format as +1 (XXX) XXX-XXXX for US numbers.' },
    { id: 'R-03', name: 'Entity Truncation', pattern: '/(LLC|Inc)/gi', logic: 'Remove legal suffixes to improve CRM search indexing.' },
    { id: 'R-04', name: 'Email Integrity', pattern: '/RFC 5322/', logic: 'Force lowercase and drop records without valid RFC syntax.' },
  ];

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
        <h3 className="text-white font-bold flex items-center gap-3">
          <SafeIcon icon={FiCode} className="text-blue-400 text-xl" />
          Sanitization Rule Manifest
        </h3>
        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full font-black border border-blue-500/20 uppercase tracking-widest">
          {Object.values(activeRules).filter(Boolean).length} Active
        </span>
      </div>
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div 
              key={rule.id} 
              onClick={() => toggleRule(rule.id)}
              className={`flex gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${activeRules[rule.id] ? 'bg-slate-950 border-blue-500/30' : 'bg-slate-900/20 border-slate-800 grayscale opacity-50'}`}
            >
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black border ${activeRules[rule.id] ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                  {rule.id}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-white">{rule.name}</h4>
                  <SafeIcon 
                    icon={activeRules[rule.id] ? FiToggleRight : FiToggleLeft} 
                    className={`text-2xl ${activeRules[rule.id] ? 'text-blue-500' : 'text-slate-700'}`} 
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{rule.logic}</p>
                <code className="text-[10px] bg-slate-900 px-2 py-1 rounded text-blue-400/60 font-mono">
                  {rule.pattern}
                </code>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-8 p-5 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex gap-4 items-start">
          <SafeIcon icon={FiInfo} className="text-blue-400 mt-1 text-xl" />
          <p className="text-xs text-blue-300/70 leading-relaxed">
            Rule modifications are applied <strong className="text-blue-400">immediately</strong> to the V8 processing isolate. 
            Toggling a rule here will impact all future ingress traffic and sandbox executions.
          </p>
        </div>
      </div>
    </div>
  );
}