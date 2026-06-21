import React from 'react';
import SafeIcon from '../common/SafeIcon';
import AnalyticsChart from './AnalyticsChart';
import { FiUsers, FiFilter, FiZap, FiAlertTriangle, FiTrendingUp, FiActivity } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function Dashboard({ stats }) {
  const cards = [
    { title: 'Total Ingress', value: stats.total, icon: FiUsers, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { title: 'Cleansed & Routed', value: stats.passed, icon: FiFilter, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { title: 'Filtered/Dropped', value: stats.dropped, icon: FiAlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { title: 'Avg Latency', value: '42ms', icon: FiZap, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={card.title} 
            className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl shadow-sm hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <SafeIcon icon={card.icon} className={`text-xl ${card.color}`} />
              </div>
              <SafeIcon icon={FiTrendingUp} className="text-slate-600 text-xs" />
            </div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{card.title}</p>
            <h4 className="text-2xl font-bold text-white mt-1">{card.value}</h4>
          </motion.div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-white font-medium flex items-center gap-2">
            <SafeIcon icon={FiActivity} className="text-blue-400" />
            Lead Velocity Timeline
          </h3>
          <div className="flex gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div> Ingress
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Egress
            </span>
          </div>
        </div>
        <AnalyticsChart />
      </div>
    </div>
  );
}