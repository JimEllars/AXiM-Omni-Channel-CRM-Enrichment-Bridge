import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { logService } from '../services/logService';

export default function AnalyticsChart() {
  const [chartData, setChartData] = useState({
    dates: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'],
    successData: [0, 0, 0, 0, 0, 0, 0],
    faultData: [0, 0, 0, 0, 0, 0, 0]
  });

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const logs = await logService.getAll();

        // Lightweight parser for the last 7 days
        const now = new Date();
        const dates = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }

        const successCounts = new Array(7).fill(0);
        const faultCounts = new Array(7).fill(0);

        for (const log of logs) {
          if (!log.created_at) continue;
          const logDate = new Date(log.created_at);
          const diffTime = now.getTime() - logDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          // Logs are fetched newest first (from logService.js: .reverse())
          // If we encounter a log older than 7 days, we can stop processing entirely
          // since all subsequent logs will be even older.
          if (diffDays >= 7) {
            break;
          }

          if (diffDays >= 0) {
            const index = 6 - diffDays;
            if (log.type === 'SYNC_SUCCESS') {
              successCounts[index]++;
            } else if (log.type === 'INGRESS_FAULT' || log.type === 'ENRICHMENT_FAULT') {
              faultCounts[index]++;
            }
          }
        }

        setChartData({
          dates,
          successData: successCounts,
          faultData: faultCounts
        });
      } catch (error) {
        console.error("Failed to fetch logs for analytics", error);
      }
    };

    fetchLogs();
  }, []);

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
        data: chartData.dates,
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
        name: 'Sync Success',
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
        data: chartData.successData
      },
      {
        name: 'Ingress Faults',
        type: 'line',
        smooth: true,
        lineStyle: { width: 3, color: '#ef4444' }, // red for faults
        showSymbol: false,
        areaStyle: {
          opacity: 0.1,
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#ef4444' }, { offset: 1, color: 'transparent' }]
          }
        },
        data: chartData.faultData
      }
    ]
  };

  return (
    <div className="h-[300px] w-full">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
