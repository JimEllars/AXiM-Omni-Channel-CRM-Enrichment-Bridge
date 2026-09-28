import React from 'react';
import { logService } from '../services/logService';
import { telemetryClient as telemetry } from '../utils/telemetry';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logService.logException(error, errorInfo);
    telemetry.recordMetric('ui.unhandled_error', 1, { component: errorInfo.componentStack?.slice(0, 50) });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-200">
          <h2 className="text-lg font-semibold tracking-wide">Component Operational Alert</h2>
          <p className="text-sm mt-1 text-rose-300/80">The interface encountered an unexpected state. Background sync remains active.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors"
          >
            Retry Component
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
