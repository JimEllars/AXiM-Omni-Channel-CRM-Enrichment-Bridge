import { logToSheets } from './workerSheets.js';

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

  // Conditionally route to Google Sheets Logs tab for UI monitoring
  await logToSheets(env, eventTypeStr, severityStr, messageStr);

  try {
    // Push directly to AXiM Core Ingestion Gateway
    await fetch('https://api.axim.us.com/v1/telemetry/ingest', {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.AXIM_INTERNAL_KEY}`
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // Failsafe catch: Do not bring down the worker if telemetry fails
    console.error("Telemetry Delivery Failure:", error);
  }
}
