import { ServerTelemetry } from '../types';
import { INITIAL_SERVER_TELEMETRY } from '../data/mockData';
import { createResponse, ApiResponse, delay } from './api';

let telemetry: ServerTelemetry = { ...INITIAL_SERVER_TELEMETRY };

export const serverMonitorService = {
  async getTelemetry(): Promise<ApiResponse<ServerTelemetry>> {
    await delay(40);
    // Slight realistic fluctuation
    const jitter = Math.floor(Math.random() * 5) - 2;
    telemetry.cpuUsagePercent = Math.min(95, Math.max(12, telemetry.cpuUsagePercent + jitter));
    telemetry.cpuTemperature = Math.min(68, Math.max(40, telemetry.cpuTemperature + (jitter > 0 ? 0.2 : -0.2)));
    return createResponse({ ...telemetry });
  },

  async restartService(serviceKey: keyof ServerTelemetry['services']): Promise<ApiResponse<boolean>> {
    await delay(600);
    const services = telemetry.services as Record<string, string>;
    services[serviceKey] = serviceKey === 'receiptPrinter' || serviceKey === 'barcodeScanner' ? 'CONNECTED' : 'RUNNING';
    return createResponse(true, `Service ${String(serviceKey)} restarted successfully on Raspberry Pi`);
  }
};
