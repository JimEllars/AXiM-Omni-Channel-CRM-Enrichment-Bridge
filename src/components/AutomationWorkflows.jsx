import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiGitCommit, FiPlus, FiTrash2, FiPlay, FiSettings, FiZap, FiLoader, FiCheck } from 'react-icons/fi';
import { configService } from '../services/configService';

export default function AutomationWorkflows() {
  const [savingId, setSavingId] = useState(null);
  const [syncedId, setSyncedId] = useState(null);
  const [configVersion, setConfigVersion] = useState("1.0.0");
  const [configLastUpdated, setConfigLastUpdated] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
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

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const savedWorkflows = await configService.get('automation_workflows', null);
        if (savedWorkflows && Array.isArray(savedWorkflows)) {
          setWorkflows(savedWorkflows);
        } else if (savedWorkflows && Array.isArray(savedWorkflows.rules)) {
          setWorkflows(savedWorkflows.rules);
          setConfigVersion(savedWorkflows.version || "1.0.0");
          if (savedWorkflows.last_updated) {
            setConfigLastUpdated(new Date(savedWorkflows.last_updated).toLocaleString());
          }
        }
      } catch (err) {
        console.error('Failed to fetch workflows from configService:', err);
      }
    };
    fetchWorkflows();
  }, []);


  const syncWorkflows = async (newWorkflows, savingId) => {
    setWorkflows(newWorkflows);
    if (savingId) setSavingId(savingId);

    try {
      // 1. Save to Google Sheets Config via configService
      const payload = {
        version: "1.0.0",
        last_updated: new Date().toISOString(),
        rules: newWorkflows
      };
      await configService.set('automation_workflows', payload);

      // 2. Fire authenticated POST request to Worker's sync endpoint
      const syncResponse = await fetch('/v1/management/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        }
      }).catch(err => {
        // gracefully handle fetch errors
        console.error('Fetch to /v1/management/sync failed:', err);
        setErrorMsg("Network error trying to sync.");
      });
      if (syncResponse && !syncResponse.ok) {
        if (syncResponse.status === 401) setErrorMsg("Unauthorized: Invalid Session Key for sync.");
        else if (syncResponse.status === 429) setErrorMsg("Rate limited syncing workflows.");
        else setErrorMsg(`Failed to sync: ${syncResponse.status}`);
      } else if (syncResponse) {
        setErrorMsg(null);
      }

      if (savingId) {
        setSyncedId(savingId);
        setTimeout(() => setSyncedId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to sync workflows to edge:', err);
      // Not reverting here for simplicity, but could revert to previous state
    } finally {
      if (savingId) setSavingId(null);
    }
  };

  const toggleWorkflow = async (id) => {
    const wf = workflows.find(w => w.id === id);
    if (!wf) return;
    const newActiveState = !wf.active;
    const newWorkflows = workflows.map(w => w.id === id ? { ...w, active: newActiveState } : w);
    await syncWorkflows(newWorkflows, id);
  };

  const addWorkflow = async () => {
    const newWf = {
      id: `wf_${Date.now()}`,
      name: 'New Workflow',
      conditionField: 'linkedin_url',
      conditionOperator: 'is_empty',
      action: 'API_ENRICH',
      provider: 'Apollo',
      active: false
    };
    const newWorkflows = [...workflows, newWf];
    await syncWorkflows(newWorkflows, newWf.id);
  };

  const deleteWorkflow = async (id) => {
    const newWorkflows = workflows.filter(wf => wf.id !== id);
    await syncWorkflows(newWorkflows, id);
  };
  const revertToPrevious = async () => {
    try {
      const response = await fetch('/v1/management/rollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AXiM-Internal-Auth': sessionStorage.getItem('AXIM_AUTH_KEY') || '',
          'Authorization': `Bearer ${sessionStorage.getItem('AXIM_AUTH_KEY') || ''}`
        }
      });
      if (response.ok) {
        setErrorMsg(null);
        // Refresh local state by fetching workflows again
        const savedWorkflows = await configService.get('automation_workflows', null);
        if (savedWorkflows && Array.isArray(savedWorkflows)) {
          setWorkflows(savedWorkflows);
        } else if (savedWorkflows && Array.isArray(savedWorkflows.rules)) {
          setWorkflows(savedWorkflows.rules);
          setConfigVersion(savedWorkflows.version || "1.0.0");
          if (savedWorkflows.last_updated) {
            setConfigLastUpdated(new Date(savedWorkflows.last_updated).toLocaleString());
          }
        }
      } else {
        console.error('Rollback failed');
        if (response.status === 401) setErrorMsg("Unauthorized: Invalid Session Key for rollback.");
        else setErrorMsg("Rollback failed.");
      }
    } catch (e) {
      console.error('Rollback fetch failed', e);
      setErrorMsg("Network error during rollback.");
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <span className="text-sm font-bold">{errorMsg}</span>
        </div>
      )}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3 uppercase italic">
            <SafeIcon icon={FiZap} className="text-blue-400" />
            Automation Engine
          </h2>
          <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">If/Then Trigger Configuration</p>
          {configLastUpdated && (
            <span className="text-xs text-gray-500 mt-2 block">
              Live Config v{configVersion} (Updated {configLastUpdated})
            </span>
          )}
          {!configLastUpdated && (
            <span className="text-xs text-gray-500 mt-2 block">
              Live Config v{configVersion}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={revertToPrevious}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 border border-slate-700"
          >
            REVERT TO PREVIOUS VERSION
          </button>
          <button
            onClick={addWorkflow}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <SafeIcon icon={FiPlus} /> ADD TRIGGER
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {workflows.map((wf) => (
          <div key={wf.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 transition-all hover:border-blue-500/50 group flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                {savingId === wf.id ? (
                  <SafeIcon icon={FiLoader} className="text-blue-400 animate-spin" />
                ) : syncedId === wf.id ? (
                  <div className="flex items-center gap-1">
                    <SafeIcon icon={FiCheck} className="text-green-400" />
                    <span className="text-green-400 text-[10px] font-bold">SYNCED</span>
                  </div>
                ) : (
                  <div onClick={() => toggleWorkflow(wf.id)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${wf.active ? 'bg-blue-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${wf.active ? 'right-1' : 'left-1'}`}></div>
                  </div>
                )}
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
