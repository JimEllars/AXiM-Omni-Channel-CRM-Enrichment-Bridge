import React from 'react';
import { apiFetch } from '../utils/api';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);

    // Silently POST error stack to worker telemetry
    apiFetch('/v1/webhooks/enrich', {
      method: 'POST',
      body: JSON.stringify({
        department: "support_c360",
        source: "bridge_ui_telemetry",
        error_message: error.toString(),
        stack_trace: errorInfo.componentStack || error.stack
      })
    }).catch(e => {
        // Fallback for telemetry failure
        console.error("Failed to log telemetry", e);
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
          <div className="bg-red-950/50 border border-red-500 p-6 rounded-xl max-w-lg text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong.</h2>
            <p className="text-sm text-slate-300">
              The application encountered a critical error. Our team has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
