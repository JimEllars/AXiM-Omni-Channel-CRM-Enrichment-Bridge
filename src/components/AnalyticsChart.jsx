import React from 'react';
import ReactECharts from 'echarts-for-react';

export default function AnalyticsChart() {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0f172a',
      borderColor: '#1e293b',
      textStyle: { color: '#94a3b8' },
      axisPointer: { type: 'cross', label: { backgroundColor: '#1e293b' } }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true, top: '10%' },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      }
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      }
    ],
    series: [
      {
        name: 'Ingress Throughput',
        type: 'line',
        smooth: true,
        lineStyle: { width: 3, color: '#3b82f6' },
        showSymbol: false,
        areaStyle: {
          opacity: 0.1,
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: 'transparent' }]
          }
        },
        data: [120, 132, 101, 134, 90, 230, 210]
      },
      {
        name: 'Cleaned Leads',
        type: 'line',
        smooth: true,
        lineStyle: { width: 3, color: '#10b981' },
        showSymbol: false,
        areaStyle: {
          opacity: 0.1,
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: 'transparent' }]
          }
        },
        data: [100, 110, 80, 120, 70, 210, 190]
      }
    ]
  };

  return (
    <div className="h-[300px] w-full">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}