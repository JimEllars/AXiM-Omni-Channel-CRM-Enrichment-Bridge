import React, { useState, useEffect } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiServer, FiGlobe, FiCpu, FiHardDrive, FiCheckCircle, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { configService } from '../services/configService';
import { logService } from '../services/logService';

export default function SystemHealth() {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [healthStats, setHealthStats] = useState({ faults: 0, successes: 0, ratio: 0, status: 'Operational' });
  const [error, setError] = useState(null);

  const defaultRegions = [
    { name: 'US-East (Virginia)', status: 'Optimal', latency: '12ms', load: '24%', icon: 'Globe' },
    { name: 'EU-West (London)', status: 'Optimal', latency: '45ms', load: '18%', icon: 'Globe' },
    { name: 'AP-South (Singapore)', status: 'Optimal', latency: '88ms', load: '12%', icon: 'Globe' },
    { name: 'US-West (Oregon)', status: 'Degraded', latency: '142ms', load: '89%', icon: 'Globe', warning: true },
  ];

  useEffect(() => {
    loadHealth();
    fetchLogStats();
  }, []);

  const loadHealth = async () => {
    try {
      setLoading(true);
      const saved = await configService.get('system_health_regions', defaultRegions);
      setRegions(saved);
    } catch (err) {
      console.error('Failed to load system health regions:', err);
      // Fallback
      setRegions(defaultRegions);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogStats = async () => {
    try {
      const logs = await logService.getAll();

      // Filter for last 24 hours
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const recentLogs = logs.filter(log => {
        try {
          const logDate = new Date(log.created_at);
          return logDate >= oneDayAgo;
        } catch(e) {
           return false;
        }
      });

      let faultCount = 0;
      let successCount = 0;

      const faultTypes = ['SYNC_FAULT', 'INGRESS_FAULT', 'BATCH_PROCESS_FAULT', 'EGRESS_FAULT_ALBATO', 'EGRESS_FAULT_CORE', 'DISPATCH_FAULT', 'SWEEP_FAULT', 'PRE_FLIGHT_VALIDATION_FAILED'];
      const successTypes = ['CRON RUN', 'SYNC_SUCCESS_ALBATO', 'SYNC_SUCCESS_CORE', 'SWEEP_COMPLETE'];

      recentLogs.forEach(log => {
         if (faultTypes.includes(log.type)) {
            faultCount++;
         } else if (successTypes.includes(log.type)) {
            successCount++;
         }
      });

      const totalEvents = faultCount + successCount;
      const ratio = totalEvents > 0 ? (faultCount / totalEvents) : 0;

      let status = 'Operational';
      if (ratio > 0.1) status = 'Degraded';
      if (ratio > 0.5) status = 'Critical';

      setHealthStats({ faults: faultCount, successes: successCount, ratio: ratio, status: status });
    } catch (err) {
      console.error('Failed to fetch log stats for health:', err);
      setError(err);
    }
  };

  const simulateFailover = async () => {
    const updated = regions.map(r => ({
      ...r,
      status: r.warning ? 'Recovering' : 'Optimal',
      latency: r.warning ? '62ms' : r.latency,
      warning: false
    }));
    setRegions(updated);
    await configService.set('system_health_regions', updated);
  };

  const forceUnlock = async () => {
    try {
      const response = await fetch('/v1/management/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AXiM-Internal-Auth': import.meta.env.VITE_AXIM_INTERNAL_KEY || ''
        }
      });
      if (response.ok) {
        // toast or update state
        console.log('Force unlock successful');
      } else {
        console.error('Force unlock failed');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Ensure robust mapping even if healthStats is not updated
  const statusColor = healthStats.status === 'Operational' ? 'text-emerald-400' :
                      healthStats.status === 'Degraded' ? 'text-amber-400' : 'text-red-400';
  const statusIcon = healthStats.status === 'Operational' ? FiCheckCircle : FiAlertCircle;

  const metrics = [
    { label: 'Edge Nodes', value: '2,401', icon: FiServer },
    { label: 'Fault Ratio (24h)', value: `${(healthStats.ratio * 100).toFixed(1)}%`, icon: FiCpu },
    { label: 'System Status', value: healthStats.status, icon: statusIcon, color: statusColor },
  ];

  if (error) {
     return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
           <p className="text-red-400">Error loading system health.</p>
        </div>
     );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl flex items-center gap-4 shadow-lg group hover:border-slate-700 transition-all">
            <div className={`p-3 ${m.color ? m.color.replace('text-', 'bg-').replace('400', '500/10') : 'bg-blue-500/10'} rounded-xl ${m.color || 'text-blue-400'} group-hover:${m.color ? m.color.replace('text-', 'bg-').replace('400', '600') : 'bg-blue-600'} group-hover:text-white transition-all`}>
              <SafeIcon icon={m.icon} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">{m.label}</p>
              <p className={`text-2xl font-black ${m.color || 'text-white'}`}>{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
          <div>
            <h3 className="text-white font-bold flex items-center gap-3 text-lg">
              <SafeIcon name="Globe" className="text-blue-400" />
              Global Edge Distribution
            </h3>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mt-1">Real-time Latency Mesh</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500 font-mono hidden md:block">REPLICATION_FACTOR: 3x</span>
            <button 
              onClick={simulateFailover}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-slate-700"
            >
              <SafeIcon icon={FiRefreshCw} /> RE-BALANCE TRAFFIC
            </button>
            <button
              onClick={forceUnlock}
              className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-red-800"
            >
              FORCE UNLOCK
            </button>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/30">
          {loading ? (
             <div className="col-span-2 py-12 text-center text-slate-600 animate-pulse font-black uppercase text-xs tracking-[0.2em]">Resolving Global Mesh...</div>
          ) : regions.map((region, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: i * 0.1 }}
              key={region.name} 
              className={`p-5 rounded-2xl border transition-all flex justify-between items-center group ${region.warning ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${region.warning ? 'bg-red-500/20 text-red-400' : 'bg-slate-900 text-blue-400'}`}>
                   <SafeIcon name={region.icon} className="text-xl" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-200 mb-0.5">{region.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                    <span className="inline-block w-1 h-1 rounded-full bg-slate-700"></span>
                    LOAD_FACTOR: {region.load}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-[10px] font-black uppercase tracking-[0.1em] mb-1 ${region.warning ? 'text-red-400' : 'text-emerald-400'}`}>
                  {region.status}
                </p>
                <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500 font-mono">
                  <SafeIcon icon={FiRefreshCw} className="text-[10px]" />
                  {region.latency}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
