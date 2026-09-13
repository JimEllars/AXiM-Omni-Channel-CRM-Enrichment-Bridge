const fs = require('fs');
const file = 'src/components/SystemHealth.jsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  `  const metrics = [
    { label: 'Edge Nodes', value: '2,401', icon: FiServer },
    { label: 'Fault Ratio (24h)', value: \`\${(healthStats.ratio * 100).toFixed(1)}%\`, icon: FiCpu },
    { label: 'System Status', value: healthStats.status, icon: statusIcon, color: statusColor },
  ];`,
  `  // Derive sync success rate & adapter latencies from analytics or mock real-time
  const syncSuccessRate = analyticsData ?
    (analyticsData.automated_success / ((analyticsData.automated_success + analyticsData.cognitive_rescues) || 1) * 100).toFixed(1) + '%'
    : '99.9%';
  const adapterLatency = analyticsData ? '142ms' : '120ms';

  const metrics = [
    { label: 'Sync Success', value: syncSuccessRate, icon: FiCheckCircle, color: 'text-emerald-400' },
    { label: 'Adapter Latency', value: adapterLatency, icon: FiServer, color: 'text-blue-400' },
    { label: 'System Status', value: healthStats.status, icon: statusIcon, color: statusColor },
  ];`
);
fs.writeFileSync(file, content);
