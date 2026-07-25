import { apiFetch } from "../utils/api";
import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import AnalyticsChart from './AnalyticsChart';
import { FiUsers, FiFilter, FiZap, FiAlertTriangle, FiTrendingUp, FiActivity, FiShieldOff } from 'react-icons/fi';
import { FiCpu } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function Dashboard({ stats }) {
  const [aiRescues, setAiRescues] = useState(null);
  const [rateLimitDrops, setRateLimitDrops] = useState(null);
  const [edgeAiSuccess, setEdgeAiSuccess] = useState(0);
  const [edgeAiFallback, setEdgeAiFallback] = useState(0);
  const [automatedRecoveries, setAutomatedRecoveries] = useState(0);
  const [loadingRescues, setLoadingRescues] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await apiFetch('/v1/management/analytics', {
          headers: {
            'X-AXiM-Internal-Auth': sessionStorage.getItem('AXIM_AUTH_KEY') || ''
          }
        });
        if (response.ok) {
          const data = await response.json();
          setAiRescues(data.cognitive_rescues);
          setRateLimitDrops(data.rate_limit_drops);
          setEdgeAiSuccess(data.edge_ai_success || 0);
          setEdgeAiFallback(data.edge_ai_fallback || 0);
          setAutomatedRecoveries(data.automated_success || 0);
          setErrorMsg(null);
        } else {
          setAiRescues(0);
          setRateLimitDrops(0);
          setAutomatedRecoveries(0);
          if (response.status === 401) setErrorMsg("Unauthorized: Invalid Session Key for analytics.");
          else if (response.status === 429) setErrorMsg("Rate limited fetching analytics.");
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setAiRescues(0);
        setRateLimitDrops(0);
        setErrorMsg("Network error fetching analytics.");
      } finally {
        setLoadingRescues(false);
      }
    };
    fetchAnalytics();
  }, []);

  const cards = [
    { title: 'Total Ingress', value: stats.total, icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-400/10', trend: '+12%' },
    { title: 'Cleansed & Routed', value: stats.passed, icon: FiFilter, color: 'text-emerald-400', bg: 'bg-emerald-400/10', trend: '+18%' },
    { title: 'Filtered/Dropped', value: stats.dropped, icon: FiAlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', trend: '-2%' },
    {
      title: 'Cognitive Rescues',
      value: loadingRescues ? '...' : (aiRescues || 0),
      icon: FiCpu,
      color: 'text-indigo-400',
      bg: 'bg-indigo-400/10',
      trend: '+NEW',
      split: {
        local: loadingRescues ? 0 : edgeAiSuccess,
        external: loadingRescues ? 0 : edgeAiFallback
      }
    },
    { title: 'Avg Latency', value: '42ms', icon: FiZap, color: 'text-purple-400', bg: 'bg-purple-400/10', trend: 'STABLE' },
    { title: 'Blocked Volumetric Attacks', value: loadingRescues ? '...' : (rateLimitDrops || 0), icon: FiShieldOff, color: 'text-rose-400', bg: 'bg-rose-400/10', trend: 'LIVE' },
    { title: 'Automated Recoveries (24h)', value: loadingRescues ? '...' : (automatedRecoveries || 0), icon: FiActivity, color: 'text-emerald-400', bg: 'bg-emerald-400/10', trend: 'AUTO' },
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
            className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-lg hover:border-slate-700 hover:bg-slate-900 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${card.bg} group-hover:scale-110 transition-transform`}>
                <SafeIcon icon={card.icon} className={`text-xl ${card.color}`} />
              </div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${card.trend.startsWith('+') ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-slate-500 border-slate-800'}`}>
                {card.trend}
              </span>
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">{card.title}</p>
            <h4 className="text-3xl font-black text-white italic tracking-tighter">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</h4>
            {card.split && (
              <div className="mt-2 flex gap-2 text-[9px] font-bold tracking-widest text-slate-400">
                <span className="bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">LOCAL: {card.split.local}</span>
                <span className="bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">EXT: {card.split.external}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-white font-bold flex items-center gap-3 text-lg uppercase italic tracking-tighter">
                <SafeIcon icon={FiActivity} className="text-blue-400" />
                Lead Velocity Timeline
              </h3>
              <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mt-1">Real-time Ingress/Egress Parity</p>
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-2 text-[9px] text-slate-400 font-black uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> Ingress
              </span>
              <span className="flex items-center gap-2 text-[9px] text-slate-400 font-black uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Egress
              </span>
            </div>
          </div>
          <AnalyticsChart />
        </div>
        
        <div className="bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-2xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <SafeIcon icon={FiZap} className="text-9xl text-blue-400" />
          </div>
          <div className="relative z-10">
            <div className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-600/30">
               <SafeIcon icon={FiZap} className="text-xl" />
            </div>
            <h3 className="text-white font-black text-2xl mb-4 italic leading-tight uppercase tracking-tighter">Enterprise Optimization</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Your pipeline is currently utilizing <strong className="text-blue-400 font-black">V8 Isolate caching</strong>. 
              Deduplication checks are executing in <span className="text-emerald-400 font-bold">~4ms</span> per record.
            </p>
          </div>
          <button className="relative z-10 w-full bg-white text-blue-900 py-4 rounded-xl text-xs font-black transition-all hover:bg-blue-50 shadow-xl uppercase tracking-widest">
            UPGRADE COMPUTE CAPACITY
          </button>
        </div>
      </div>
    </div>
  );
}