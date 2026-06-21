import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DataTester from './components/DataTester';
import Monitoring from './components/Monitoring';
import Dashboard from './components/Dashboard';
import RuleManifest from './components/RuleManifest';
import SourcesView from './components/SourcesView';
import SystemHealth from './components/SystemHealth';
import DuplicateStats from './components/DuplicateStats';
import PipelineDesigner from './components/PipelineDesigner';
import RecoveryCenter from './components/RecoveryCenter';
import SettingsView from './components/SettingsView';
import ConfigView from './components/ConfigView';
import SafeIcon from './common/SafeIcon';
import { storage } from './utils/storage';
import { FiCode, FiActivity, FiLayout, FiShield, FiRefreshCw, FiSettings, FiShuffle, FiDatabase } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [activeRules, setActiveRules] = useState(storage.get('pipeline_rules', {}));
  const [stats, setStats] = useState(storage.get('stats', { total: 242, passed: 210, dropped: 32 }));

  useEffect(() => {
    storage.set('stats', stats);
  }, [stats]);

  useEffect(() => {
    setLogs(storage.get('logs', []));
  }, []);

  const addLog = (newLog) => {
    const updated = [newLog, ...logs].slice(0, 50);
    setLogs(updated);
    storage.set('logs', updated);
  };

  const handlePipelineRun = (results) => {
    const passedCount = results.filter(r => r.isValid).length;
    const droppedCount = results.length - passedCount;

    setStats(prev => ({
      total: prev.total + results.length,
      passed: prev.passed + passedCount,
      dropped: prev.dropped + droppedCount
    }));

    addLog({
      id: Date.now(),
      type: passedCount > 0 ? 'SYNC_SUCCESS' : 'INGRESS_FAULT',
      severity: passedCount > 0 ? 'INFO' : 'HIGH',
      msg: `Sandbox execution: ${results.length} processed. Valid: ${passedCount}.`,
      time: new Date().toLocaleTimeString()
    });
  };

  const tabs = [
    { id: 'dashboard', label: 'Overview', icon: FiLayout },
    { id: 'orchestrator', label: 'Pipeline', icon: FiShuffle },
    { id: 'sources', label: 'Sources', icon: FiDatabase },
    { id: 'recovery', label: 'Recovery', icon: FiRefreshCw },
    { id: 'sandbox', label: 'Sandbox', icon: FiCode },
    { id: 'telemetry', label: 'Logs', icon: FiActivity },
    { id: 'settings', label: 'Settings', icon: FiSettings },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-blue-500/30">
      <Header />
      
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-4 border-b border-slate-900 pb-6">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3 uppercase italic">
              AXiM Core <span className="text-blue-500">v4.2</span>
            </h2>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-slate-500 text-[10px] font-bold uppercase flex items-center gap-2 tracking-[0.2em]">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></div>
                SYSTEM_MODE: PRODUCTION
              </span>
            </div>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 shadow-xl overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <SafeIcon icon={tab.icon} /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <Dashboard stats={stats} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Monitoring logs={logs.slice(0, 8)} />
                  </div>
                  <DuplicateStats />
                </div>
              </div>
            )}

            {activeTab === 'orchestrator' && (
              <div className="space-y-8">
                <PipelineDesigner />
                <RuleManifest onRulesChange={setActiveRules} />
                <ConfigView />
              </div>
            )}

            {activeTab === 'sources' && <SourcesView />}
            {activeTab === 'recovery' && <RecoveryCenter onRetrySuccess={() => setStats(s => ({...s, passed: s.passed + 1, dropped: s.dropped - 1}))} />}
            {activeTab === 'sandbox' && <DataTester onPipelineRun={handlePipelineRun} activeRules={activeRules} />}
            {activeTab === 'telemetry' && <Monitoring logs={logs} />}
            {activeTab === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}