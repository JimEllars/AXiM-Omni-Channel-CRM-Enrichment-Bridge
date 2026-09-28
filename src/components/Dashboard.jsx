import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiUsers, FiFilter, FiAlertTriangle, FiCpu, FiZap, FiShieldOff, FiActivity } from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import AnalyticsChart from './AnalyticsChart';
import { telemetryClient, getMetrics } from '../utils/telemetry';

export default function Dashboard({ stats: propStats }) {
  const [stats, setStats] = useState(propStats || { total: 0, passed: 0, dropped: 0 });
  const [loadingRescues, setLoadingRescues] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [liveMetrics, setLiveMetrics] = useState(getMetrics());

  useEffect(() => {
    if (propStats) {
       setStats(propStats);
    }
  }, [propStats]);

  useEffect(() => {
    // Bind to real-time telemetry metrics and log service
    const fetchRecentLogs = async () => {
      const { logService } = await import('../services/logService');
      const logs = await logService.getRecentLogs();
      // You could use logs to derive additional metrics here, for example:
      const recentErrors = logs.filter(l => l.type === 'error').length;
    };

    fetchRecentLogs();

    const timer = setInterval(() => {
      setLiveMetrics(getMetrics());
      setLoadingRescues(false);
      fetchRecentLogs();
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const cards = [
    { title: 'Total Ingress', value: stats.total || (loadingRescues ? '...' : 0), icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-500/10', trend: '+12%' },
    { title: 'Cleansed & Routed', value: stats.passed || (loadingRescues ? '...' : 0), icon: FiFilter, color: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: '+18%' },
    { title: 'Filtered/Dropped', value: stats.dropped || (loadingRescues ? '...' : 0), icon: FiAlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', trend: '-2%' },
    {
      title: 'Cognitive Rescues',
      value: loadingRescues ? '...' : liveMetrics.cognitive_rescues,
      icon: FiCpu,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      trend: '+NEW',
      split: {
        local: loadingRescues ? 0 : liveMetrics.edge_ai_success,
        external: loadingRescues ? 0 : liveMetrics.edge_ai_fallback
      }
    },
    { title: 'Avg Latency', value: loadingRescues ? '...' : liveMetrics.latency, icon: FiZap, color: 'text-purple-400', bg: 'bg-purple-500/10', trend: 'STABLE' },
    { title: 'Throughput (ops/s)', value: loadingRescues ? '...' : liveMetrics.throughput, icon: FiShieldOff, color: 'text-rose-400', bg: 'bg-rose-500/10', trend: 'LIVE' },
    { title: 'Automated Recoveries', value: loadingRescues ? '...' : liveMetrics.automated_success, icon: FiActivity, color: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: 'AUTO' },
  ];

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <span className="text-sm font-bold">{errorMsg}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.1 }}
            key={card.title} 
            className="bg-slate-900/80 backdrop-blur-md border border-slate-800 p-6 rounded-2xl shadow-lg hover:border-slate-700 hover:bg-slate-800/80 transition-all group relative overflow-hidden"
          >
            {loadingRescues && <div className="absolute inset-0 bg-slate-800/50 animate-pulse z-10" />}
            <div className="flex items-center justify-between mb-4 relative z-20">
              <div className={`p-3 rounded-xl ${card.bg} border border-white/5 group-hover:scale-110 transition-transform`}>
                <SafeIcon icon={card.icon} className={`text-xl ${card.color}`} />
              </div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${card.trend.startsWith('+') ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' : 'text-slate-400 border-slate-700 bg-slate-800'}`}>
                {card.trend}
              </span>
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1 relative z-20">{card.title}</p>
            <h4 className="text-3xl font-black text-white tracking-tight relative z-20">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</h4>
            {card.split && (
              <div className="mt-3 flex gap-2 text-[9px] font-bold tracking-widest text-slate-300 relative z-20">
                <span className="bg-indigo-500/20 px-2 py-1 rounded-md border border-indigo-500/30 text-indigo-300">LOCAL: {card.split.local}</span>
                <span className="bg-amber-500/20 px-2 py-1 rounded-md border border-amber-500/30 text-amber-300">EXT: {card.split.external}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-8 shadow-2xl relative">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 flex items-center justify-center">
                  <SafeIcon icon={FiActivity} className="text-white text-[10px]" />
                </span>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg tracking-tight">Lead Velocity Timeline</h3>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">Real-time Ingress/Egress Parity</p>
              </div>
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-2 text-[9px] text-slate-400 font-black uppercase tracking-widest bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div> Ingress
              </span>
              <span className="flex items-center gap-2 text-[9px] text-slate-400 font-black uppercase tracking-widest bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Egress
              </span>
            </div>
          </div>
          {loadingRescues ? (
            <div className="h-64 flex items-center justify-center">
               <div className="animate-pulse flex flex-col items-center gap-4">
                 <div className="h-4 w-48 bg-slate-800 rounded-full"></div>
                 <div className="h-2 w-32 bg-slate-800 rounded-full"></div>
               </div>
            </div>
          ) : (
             <AnalyticsChart />
          )}
        </div>
        
        <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-2xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <SafeIcon icon={FiZap} className="text-9xl text-blue-400" />
          </div>
          <div className="relative z-10">
            <div className="bg-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center text-blue-400 mb-6 shadow-lg shadow-blue-500/20 border border-blue-500/30 backdrop-blur-md">
               <SafeIcon icon={FiZap} className="text-2xl" />
            </div>
            <h3 className="text-white font-black text-2xl mb-4 tracking-tight">Enterprise Optimization</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-8">
              Your pipeline is currently utilizing <strong className="text-blue-400 font-black px-1">V8 Isolate caching</strong>.
              Deduplication checks are executing in <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 inline-block mt-1">~4ms</span> per record.
            </p>
          </div>
          <button className="relative z-10 w-full bg-blue-600/90 text-white py-4 rounded-xl text-xs font-black transition-all hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] uppercase tracking-widest border border-blue-400/50">
            Upgrade Compute Capacity
          </button>
        </div>
      </div>
    </div>
  );
}