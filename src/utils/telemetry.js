/**
 * Pushes asynchronous telemetry logs to AXiM Core Ingestion Gateway.
 * @param {Object} env - Cloudflare Worker environment bindings
 * @param {string} eventType - The classification of the event
 * @param {string} severity - 'INFO', 'HIGH', 'CRITICAL'
 * @param {string} message - Descriptive log message
 */
export async function logTelemetry(env, eventType, severity, message) {
  const payload = {
    telemetry_envelope: {
      project_id: "AXIM_CRM_BRIDGE", // Critical: Exact routing tag for Core
      environment: env.ENVIRONMENT || "production",
      timestamp: new Date().toISOString(),
      idempotency_key: `evt_crm_${crypto.randomUUID()}`
    },
    event_payload: {
      event_type: eventType,
      severity: severity,
      component_origin: "worker_pipeline",
      error_message: message
    }
  };

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