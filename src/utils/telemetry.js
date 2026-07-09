
export async function logTelemetry(env, payloadOrEventType, severity, message) {
  let payload;
  let eventTypeStr = payloadOrEventType;
  let severityStr = severity;
  let messageStr = message;

  if (typeof payloadOrEventType === 'object') {
    payload = payloadOrEventType;
    eventTypeStr = payload.event_payload.event_type;
    severityStr = payload.event_payload.severity;
    messageStr = payload.event_payload.error_message;
    // ensure idempotency key exists
    if (!payload.telemetry_envelope.idempotency_key) {
        payload.telemetry_envelope.idempotency_key = `evt_crm_${crypto.randomUUID()}`;
    }
  } else {
    payload = {
      telemetry_envelope: {
        project_id: "AXIM_CRM_BRIDGE",
        environment: env.ENVIRONMENT || "production",
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

  // Sheets logging is handled inside this async function, but we shouldn't await it here if we want to ensure
  // nothing blocks. We remove await to enforce that telemetry log itself is fire and forget, even within ctx.waitUntil.
  try {
    // Push directly to AXiM Core Ingestion Gateway
    fetch('https://api.axim.us.com/v1/telemetry/ingest', {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
      },
      body: JSON.stringify(payload)
    }).catch(err => console.error("Telemetry Delivery Failure:", err));
  } catch (error) {
    // Failsafe catch: Do not bring down the worker if telemetry fails
    console.error("Telemetry Processing Error:", error);
  }
}


export async function logToRecovery(env, source, reason, payload) {
  try {
    const coreRestUrl = env.AXIM_CORE_REST_URL || 'https://api.axim.us.com';
    const endpoint = `${coreRestUrl}/rest/v1/dlq_records`;

    // Ensure timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.AXIM_INTERNAL_KEY,
        'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
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
