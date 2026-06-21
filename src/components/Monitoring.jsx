import React, { useState } from 'react';
import SafeIcon from '../common/SafeIcon';
import { FiActivity, FiClock, FiTerminal, FiSearch, FiFilter } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

export default function Monitoring({ logs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.msg.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         log.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' || log.severity === filter;
    return matchesSearch && matchesFilter;
  });

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'CRITICAL': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'HIGH': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      default: return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800/20">
        <h3 className="text-white font-medium flex items-center gap-2">
          <SafeIcon icon={FiActivity} className="text-blue-400" />
          Live Telemetry Stream
        </h3>
        
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-64">
            <SafeIcon icon={FiSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
            <input 
              type="text" 
              placeholder="Filter logs..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 transition-colors"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-400 focus:outline-none focus:border-blue-500/50"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">ALL SEVERITY</option>
            <option value="INFO">INFO</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>
      </div>
      
      <div className="min-h-[400px] max-h-[600px] overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-900 z-10 shadow-sm">
            <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800">
              <th className="px-6 py-3 font-semibold">Event Type</th>
              <th className="px-6 py-3 font-semibold">Severity</th>
              <th className="px-6 py-3 font-semibold">Message</th>
              <th className="px-6 py-3 font-semibold text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            <AnimatePresence initial={false}>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-20 text-center text-slate-600 text-sm italic">
                    No matching telemetry events found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={log.id} 
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="px-6 py-4 text-[11px] text-blue-400 font-bold">{log.type}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityColor(log.severity)}`}>
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300 group-hover:text-white transition-colors">
                      {log.msg}
                    </td>
                    <td className="px-6 py-4 text-[10px] text-slate-500 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <SafeIcon icon={FiClock} className="text-slate-600" /> {log.time}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <SafeIcon icon={FiTerminal} />
          <span>Ingress Node: i-0842-axim-prod</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono uppercase tracking-tighter">
          Buffer Usage: 12%
        </span>
      </div>
    </div>
  );
}