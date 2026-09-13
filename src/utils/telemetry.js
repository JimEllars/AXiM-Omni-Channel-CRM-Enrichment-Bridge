class ObservabilityClient {
  constructor() {
    this.queue = [];
    this.maxBatchSize = 20;
    this.flushIntervalMs = 5000;
    this.timer = null;
  }

  _startTimer() {
    if (!this.timer && typeof window !== 'undefined') {
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    }
  }

  _enqueue(event) {
    this.queue.push({
      ...event,
      timestamp: new Date().toISOString(),
      idempotency_key: `evt_crm_${crypto.randomUUID()}`
    });

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else {
      this._startTimer();
    }
  }

  recordMetric(metricName, value, tags = {}) {
    this._enqueue({
      type: 'metric',
      metricName,
      value,
      tags
    });
  }

  recordSpan(operationName, durationMs, metadata = {}) {
    this._enqueue({
      type: 'span',
      operationName,
      durationMs,
      metadata
    });
  }

  recordError(errorContext, errorObject) {
    this._enqueue({
      type: 'error',
      errorContext,
      errorObject: errorObject ? (errorObject.message || errorObject.toString()) : 'Unknown Error'
    });
  }

  async flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    try {
      const endpoint = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TELEMETRY_ENDPOINT) || '/api/telemetry';
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Optional: Add auth token if required
        },
        body: JSON.stringify({ events: batch })
      }).catch(err => console.warn('Telemetry flush failed quietly:', err)); // Fail safely
    } catch (error) {
      console.warn('Telemetry delivery failed quietly:', error); // Fail safely
    }
  }
}

export const telemetryClient = new ObservabilityClient();

export async function logTelemetry(env, payloadOrEventType, severity, message) {
  let payload;
  let eventTypeStr = payloadOrEventType;
  let severityStr = severity;
  let messageStr = message;

  if (typeof payloadOrEventType === 'object') {
    payload = payloadOrEventType;
    eventTypeStr = payload?.event_payload?.event_type || 'unknown_event';
    severityStr = payload?.event_payload?.severity || 'info';
    messageStr = payload?.event_payload?.error_message || '';
    if (payload.telemetry_envelope && !payload.telemetry_envelope.idempotency_key) {
        payload.telemetry_envelope.idempotency_key = `evt_crm_${crypto.randomUUID()}`;
    }
  } else {
    payload = {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env?.ENVIRONMENT || "production",
        timestamp: new Date().toISOString(),
        idempotency_key: `evt_crm_${crypto.randomUUID()}`
      },
      event_payload: {
        event_type: eventTypeStr,
        severity: severityStr,
        component_origin: "worker_pipeline",
        error_message: messageStr
      }
    };
  }

  telemetryClient.recordError(eventTypeStr, messageStr);

  try {
    fetch('https://api.axim.us.com/v1/telemetry/ingest', {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env?.AXIM_INTERNAL_KEY || ''}`
      },
      body: JSON.stringify(payload)
    }).catch(err => console.error("Telemetry Delivery Failure:", err));
  } catch (error) {
    console.error("Telemetry Processing Error:", error);
  }
}

export async function logToRecovery(env, source, reason, payload) {
  try {
    const coreRestUrl = env?.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
    const endpoint = `${coreRestUrl}/rest/v1/dlq_records`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env?.AXIM_INTERNAL_KEY || '',
        'Authorization': `Bearer ${env?.AXIM_INTERNAL_KEY || ''}`
      },
      body: JSON.stringify({
        source: source,
        error_reason: reason,
        payload: payload
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (error) {
    console.error("Failed to write to Supabase DLQ:", error);
  }
}
