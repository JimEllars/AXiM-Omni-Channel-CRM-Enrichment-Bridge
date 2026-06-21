import React from 'react';
import ReactECharts from 'echarts-for-react';

export default function DuplicateStats() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#0f172a', borderColor: '#1e293b', textStyle: { color: '#94a3b8' } },
    legend: { bottom: '0%', left: 'center', textStyle: { color: '#64748b', fontSize: 10 } },
    series: [
      {
        name: 'Lead Uniqueness',
        type: 'pie',
        radius: ['60%', '85%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#0f172a', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#fff' } },
        data: [
          { value: 1048, name: 'Unique Leads', itemStyle: { color: '#3b82f6' } },
          { value: 235, name: 'KV Blocked (Dupes)', itemStyle: { color: '#f59e0b' } },
          { value: 180, name: 'Invalid Syntax', itemStyle: { color: '#ef4444' } }
        ]
      }
    ]
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 h-full flex flex-col">
      <h3 className="text-white font-medium mb-4 text-sm uppercase tracking-wider">KV Intelligence</h3>
      <div className="flex-1 min-h-[250px]">
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}