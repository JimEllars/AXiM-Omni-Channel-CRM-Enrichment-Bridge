import React, { useState } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiGitCommit, FiPlus, FiTrash2, FiPlay, FiSettings, FiZap } from 'react-icons/fi';

export default function AutomationWorkflows() {
  const [workflows, setWorkflows] = useState([
    {
      id: 'wf_1',
      name: 'Missing Company Fill',
      conditionField: 'company',
      conditionOperator: 'is_empty',
      action: 'TRIGGER_SCRAPER',
      provider: 'LinkedIn',
      active: true
    },
    {
      id: 'wf_2',
      name: 'Firmographic Enrichment',
      conditionField: 'company_size',
      conditionOperator: 'is_empty',
      action: 'API_ENRICH',
      provider: 'Clearbit',
      active: false
    }
  ]);

  const toggleWorkflow = (id) => {
    setWorkflows(workflows.map(wf =>
      wf.id === id ? { ...wf, active: !wf.active } : wf
    ));
  };

  const addWorkflow = () => {
    const newWf = {
      id: `wf_${Date.now()}`,
      name: 'New Workflow',
      conditionField: 'linkedin_url',
      conditionOperator: 'is_empty',
      action: 'API_ENRICH',
      provider: 'Apollo',
      active: false
    };
    setWorkflows([...workflows, newWf]);
  };

  const deleteWorkflow = (id) => {
    setWorkflows(workflows.filter(wf => wf.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3 uppercase italic">
            <SafeIcon icon={FiZap} className="text-amber-400" />
            Automation Engine
          </h2>
          <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">If/Then Trigger Configuration</p>
        </div>
        <button
          onClick={addWorkflow}
          className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20"
        >
          <SafeIcon icon={FiPlus} /> ADD TRIGGER
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {workflows.map((wf) => (
          <div key={wf.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 transition-all hover:border-amber-500/50 group flex flex-col md:flex-row md:items-center justify-between gap-6">

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div onClick={() => toggleWorkflow(wf.id)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${wf.active ? 'bg-amber-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${wf.active ? 'right-1' : 'left-1'}`}></div>
                </div>
                <h3 className="text-white font-bold text-sm">{wf.name}</h3>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-400">IF</span>
                <span className="px-3 py-1 bg-blue-900/30 border border-blue-800 rounded-lg text-blue-400">{wf.conditionField}</span>
                <span className="px-3 py-1 bg-slate-800 rounded-lg text-amber-400">{wf.conditionOperator}</span>
                <SafeIcon icon={FiGitCommit} className="text-slate-600" />
                <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-400">THEN</span>
                <span className="px-3 py-1 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-400">{wf.action}</span>
                <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-400">VIA</span>
                <span className="px-3 py-1 bg-purple-900/30 border border-purple-800 rounded-lg text-purple-400">{wf.provider}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
               <button className="p-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors">
                  <SafeIcon icon={FiSettings} />
               </button>
               <button onClick={() => deleteWorkflow(wf.id)} className="p-2.5 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors">
                  <SafeIcon icon={FiTrash2} />
               </button>
            </div>

          </div>
        ))}
        {workflows.length === 0 && (
          <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-slate-800 border-dashed">
            <SafeIcon icon={FiGitCommit} className="text-4xl text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-bold text-sm">No automation triggers configured.</p>
          </div>
        )}
      </div>
    </div>
  );
}
