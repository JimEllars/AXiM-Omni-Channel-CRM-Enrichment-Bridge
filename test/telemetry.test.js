import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { telemetryClient } from '../src/utils/telemetry.js';

describe('Telemetry Ring Buffer', () => {

    beforeEach(() => {
        telemetryClient.ringBuffer = [];
        telemetryClient.queue = [];
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should enforce ring buffer limits', () => {
        const limit = telemetryClient.ringBufferLimit;

        for (let i = 0; i < limit + 10; i++) {
            telemetryClient.recordEvent('test_event', `Message ${i}`);
        }

        expect(telemetryClient.ringBuffer.length).toBe(limit);
        // The newest item is at the front (unshifted), so the last item in array should be the 11th one added
        expect(telemetryClient.ringBuffer[0].message).toBe(`Message ${limit + 9}`);
    });

    it('should calculate metrics correctly', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        // Add 10 events over a minute
        for (let i = 0; i < 10; i++) {
            telemetryClient.recordEvent('test_event', `Msg ${i}`);
            // Advance time slightly
            vi.advanceTimersByTime(100);
        }

        // Add 2 errors
        telemetryClient.recordError('test_context', new Error('Something went wrong'));
        telemetryClient.recordEvent('sync_failure', 'Failure occurred', 'HIGH');

        // Add 2 spans (durations: 100, 200)
        telemetryClient.recordSpan('db_query', 100);
        telemetryClient.recordSpan('db_query', 200);

        const metrics = telemetryClient.getRecentMetrics(50);

        // Total events in the last minute: 10 + 2 + 2 = 14
        const expectedThroughput = (14 / 60).toFixed(2);

        // Errors: 2 out of 14
        const expectedErrorRate = ((2 / 14) * 100).toFixed(2);

        // Avg Latency: (100 + 200) / 2 = 150
        const expectedAvgLatency = (150).toFixed(2);

        expect(metrics.throughput).toBe(expectedThroughput);
        expect(metrics.errorRate).toBe(expectedErrorRate);
        expect(metrics.avgLatency).toBe(expectedAvgLatency);
    });

    it('should degrade gracefully without throwing uncaught exceptions when environment is mocked', async () => {
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        telemetryClient.recordEvent('test_event', 'Testing flush');

        // flush should catch the error and not throw it up
        await expect(telemetryClient.flush()).resolves.not.toThrow();

        global.fetch = originalFetch;
    });
});

describe('Telemetry Edge Flush Queue', () => {
    beforeEach(() => {
        telemetryClient.ringBuffer = [];
        telemetryClient.queue = [];
        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should queue batching and retry gracefully on failed telemetry dispatches', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        telemetryClient.trackEvent('system', 'start', 'test_event');

        await telemetryClient.flush();

        // Queue should be emptied even on failure (fallback failure mode)
        expect(telemetryClient.queue.length).toBe(0);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should track errors properly', () => {
        telemetryClient.trackError(new Error('Syntax Error'), { file: 'index.js' });
        expect(telemetryClient.ringBuffer[0].type).toBe('error');
        expect(telemetryClient.ringBuffer[0].errorObject).toBe('Syntax Error');
        expect(telemetryClient.ringBuffer[0].errorContext).toEqual({ file: 'index.js' });
    });
});
