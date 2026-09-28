Changes made:
- Cleaned up lingering patch artifacts (`patch_*.cjs`, `*.patch`, etc.) and `quest-react-starter@0.0.0` folder.
- Updated `.gitignore` to prevent committing `.patch` and `patch_*.cjs` files.
- Added `getMetrics` to `src/utils/telemetry.js` to provide resilient fallback values for system health metrics.
- Refactored `src/components/SystemHealth.jsx` to gracefully catch network fetch errors for analytics and fallback to the local `getMetrics` values, ensuring UI stability.
- Updated `src/components/Monitoring.jsx` to filter out null log objects safely.
- Added a "Refresh Pulse" button to `Monitoring.jsx` which manually triggers a health check.
- Updated `src/App.jsx` to persist the active operator tab inside `localStorage` (`axim_bridge_active_tab`).
- Tests and build verified to pass.
