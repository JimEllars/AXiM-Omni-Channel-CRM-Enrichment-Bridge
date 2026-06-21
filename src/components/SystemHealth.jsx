import React from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiServer, FiGlobe, FiCpu, FiHardDrive, FiCheckCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function SystemHealth() {
  const regions = [
    { name: 'US-East (Virginia)', status: 'Optimal', latency: '12ms', load: '24%', icon: FiGlobe },
    { name: 'EU-West (London)', status: 'Optimal', latency: '45ms', load: '18%', icon: FiGlobe },
    { name: 'AP-South (Singapore)', status: 'Optimal', latency: '88ms', load: '12%', icon: FiGlobe },
    { name: 'US-West (Oregon)', status: 'Degraded', latency: '142ms', load: '89%', icon: FiGlobe, warning: true },
  ];

  const metrics = [
    { label: 'Edge Nodes', value: '2,401', icon: FiServer },
    { label: 'CPU Utilization', value: '32.4%', icon: FiCpu },
    { label: 'KV Store Writes', value: '4.2k/s', icon: FiHardDrive },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <SafeIcon icon={m.icon} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{m.label}</p>
              <p className="text-xl font-bold text-white">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
          <h3 className="text-white font-medium flex items-center gap-2">
            <SafeIcon icon={FiGlobe} className="text-blue-400" />
            Global Edge Distribution
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">REPLICATION_FACTOR: 3x</span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {regions.map((region, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              key={region.name} 
              className="p-4 bg-slate-950/50 border border-slate-800 rounded-lg flex justify-between items-center"
            >
              <div className="flex items-center gap-3">
                <SafeIcon icon={region.icon} className={region.warning ? 'text-amber-400' : 'text-emerald-400'} />
                <div>
                  <p className="text-sm font-semibold text-slate-200">{region.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">LOAD: {region.load}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-[10px] font-bold uppercase ${region.warning ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {region.status}
                </p>
                <p className="text-[10px] text-slate-500">{region.latency}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}