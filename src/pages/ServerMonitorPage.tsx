import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { serverMonitorService } from '../services/serverMonitor';
import { ServerTelemetry } from '../types';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Thermometer, 
  Clock, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Activity, 
  Wifi,
  Terminal
} from 'lucide-react';

export const ServerMonitorPage: React.FC = () => {
  const { systemStatus, showToast } = useApp();
  const [telemetry, setTelemetry] = useState<ServerTelemetry | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadTelemetry();
    const interval = setInterval(loadTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTelemetry = async () => {
    const res = await serverMonitorService.getTelemetry();
    setTelemetry(res.data);
  };

  const handleRestartService = async (serviceKey: keyof ServerTelemetry['services']) => {
    setIsRefreshing(true);
    await serverMonitorService.restartService(serviceKey);
    setIsRefreshing(false);
    showToast(`Restarted ${String(serviceKey)} daemon on Raspberry Pi`, 'success');
    loadTelemetry();
  };

  if (!telemetry) return null;

  const ramPercent = Math.round((telemetry.ramUsedMb / telemetry.ramTotalMb) * 100);
  const storagePercent = Math.round((telemetry.storageUsedGb / telemetry.storageTotalGb) * 100);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Raspberry Pi Edge Server Monitor
            </h1>
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Hardware health, thermal telemetry, and systemd services on Raspberry Pi 3B+
          </p>
        </div>

        <button
          onClick={() => { setIsRefreshing(true); loadTelemetry().then(() => setIsRefreshing(false)); }}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Poll Metrics</span>
        </button>
      </div>

      {/* Main Hardware Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* IP Address */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">IP Address</span>
          <p className="mt-1 text-base font-bold font-mono text-neutral-900 dark:text-white">{telemetry.ipAddress}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Static wlan0 / eth0</p>
        </div>

        {/* CPU Usage */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">CPU Utilization</span>
          <p className="mt-1 text-base font-bold font-mono text-neutral-900 dark:text-white">{telemetry.cpuUsagePercent}%</p>
          <div className="h-1.5 w-full bg-neutral-100 rounded-full mt-1.5 overflow-hidden dark:bg-neutral-800">
            <div className="h-full bg-neutral-900 dark:bg-white rounded-full" style={{ width: `${telemetry.cpuUsagePercent}%` }} />
          </div>
        </div>

        {/* RAM */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">RAM Memory</span>
          <p className="mt-1 text-base font-bold font-mono text-neutral-900 dark:text-white">{telemetry.ramUsedMb} MB</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">of {telemetry.ramTotalMb} MB ({ramPercent}%)</p>
        </div>

        {/* Storage */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">MicroSD Storage</span>
          <p className="mt-1 text-base font-bold font-mono text-neutral-900 dark:text-white">{telemetry.storageUsedGb} GB</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">of {telemetry.storageTotalGb} GB ({storagePercent}%)</p>
        </div>

        {/* CPU Temp */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">SoC Temperature</span>
          <p className="mt-1 text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">{telemetry.cpuTemperature}°C</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Normal (Passive Heatsink)</p>
        </div>

        {/* Uptime */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[11px] text-neutral-500 font-semibold">System Uptime</span>
          <p className="mt-1 text-base font-bold font-mono text-neutral-900 dark:text-white">2h 14m</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Booted cleanly</p>
        </div>
      </div>

      {/* System Specifications & Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Edge Hardware Specifications */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span>Hardware Specifications</span>
          </h3>

          <div className="space-y-2 text-xs divide-y divide-neutral-100 dark:divide-neutral-800">
            <div className="pt-2 flex justify-between">
              <span className="text-neutral-500">Device Model:</span>
              <strong className="text-neutral-900 dark:text-white font-mono">Raspberry Pi 3 Model B+ Rev 1.3</strong>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-neutral-500">Processor (SoC):</span>
              <span className="text-neutral-700 dark:text-neutral-300 font-mono text-[11px]">{telemetry.cpuModel}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-neutral-500">Operating System:</span>
              <span className="text-neutral-700 dark:text-neutral-300">{telemetry.os}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-neutral-500">Local Hostname:</span>
              <span className="font-mono text-neutral-900 dark:text-white">{telemetry.hostname}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-neutral-500">Active Terminals Attached:</span>
              <span className="font-bold text-emerald-600">3 POS Cashier Stations</span>
            </div>
          </div>
        </div>

        {/* Core Services Daemon Status */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Edge Systemd Services</span>
          </h3>

          <div className="space-y-2 text-xs">
            {[
              { key: 'sqlite', name: 'SQLite Edge Database Service', port: '8080/sqlite', status: telemetry.services.sqlite },
              { key: 'posServer', name: 'Local Fast POS Web Engine', port: '3000/http', status: telemetry.services.posServer },
              { key: 'syncDaemon', name: 'Differential Sync Daemon', port: 'Background Worker', status: telemetry.services.syncDaemon },
              { key: 'receiptPrinter', name: 'CUPS Thermal Receipt Spooler', port: 'USB/Serial', status: telemetry.services.receiptPrinter },
              { key: 'barcodeScanner', name: 'HID Barcode Input Listener', port: 'USB Port 1', status: telemetry.services.barcodeScanner },
            ].map(svc => (
              <div
                key={svc.key}
                className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-800/50"
              >
                <div>
                  <p className="font-bold text-neutral-900 dark:text-white">{svc.name}</p>
                  <p className="text-[10px] text-neutral-400 font-mono">{svc.port}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                    {svc.status}
                  </span>
                  <button
                    onClick={() => handleRestartService(svc.key as any)}
                    className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    title="Restart Service Daemon"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
