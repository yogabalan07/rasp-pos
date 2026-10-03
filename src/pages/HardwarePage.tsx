import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Cpu, 
  Printer, 
  Barcode, 
  Coins, 
  Scale, 
  Monitor, 
  CheckCircle, 
  XCircle, 
  Play,
  RotateCcw
} from 'lucide-react';

export const HardwarePage: React.FC = () => {
  const { showToast } = useApp();

  const [peripherals, setPeripherals] = useState([
    {
      id: 'scan-1',
      name: 'Honeywell Voyager 1250g Barcode Scanner',
      type: 'BARCODE_SCANNER',
      port: 'USB HID Keyboard Emulation',
      status: 'CONNECTED',
      lastPing: '2s ago',
    },
    {
      id: 'prn-1',
      name: 'Epson TM-T82X 80mm Thermal Receipt Printer',
      type: 'THERMAL_PRINTER',
      port: 'USB /dev/usb/lp0 (9600 baud)',
      status: 'CONNECTED',
      lastPing: '5s ago',
    },
    {
      id: 'drw-1',
      name: 'Cash Drawer 4-Bill 8-Coin Metal Till',
      type: 'CASH_DRAWER',
      port: 'RJ11 via Thermal Printer Kick Pulse',
      status: 'CONNECTED',
      lastPing: 'Active',
    },
    {
      id: 'scl-1',
      name: 'Essae Teraoka Weighing Scale 30kg',
      type: 'WEIGHING_SCALE',
      port: 'RS-232 /dev/ttyUSB0 (9600 8N1)',
      status: 'CONNECTED',
      lastPing: 'Live Stream 0.000 kg',
    },
    {
      id: 'lbl-1',
      name: 'TVS LP 46 Neo Barcode Label Printer',
      type: 'LABEL_PRINTER',
      port: 'USB /dev/usb/lp1',
      status: 'CONNECTED',
      lastPing: 'Ready',
    },
    {
      id: 'vfd-1',
      name: 'Pole Customer 2-Line VFD Display',
      type: 'CUSTOMER_DISPLAY',
      port: 'USB Serial (COM3 emulation)',
      status: 'CONNECTED',
      lastPing: 'Displaying "Welcome"',
    },
  ]);

  const handleTestPrinter = () => {
    showToast('Sent ESC/POS test feed print to thermal receipt printer', 'success');
  };

  const handleTestDrawer = () => {
    showToast('Sent 24V RJ11 kick pulse to cash drawer (Opened)', 'success');
  };

  const handleTestScale = () => {
    showToast('Tare & Zero calibration signal sent to weighing scale', 'info');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Hardware &amp; POS Peripherals
          </h1>
          <p className="text-xs text-neutral-500">
            Configure barcode scanners, thermal receipt printers, electronic cash drawers, and weighing scales
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTestPrinter}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Test Print</span>
          </button>
          <button
            onClick={handleTestDrawer}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
          >
            <Coins className="h-3.5 w-3.5" />
            <span>Open Cash Drawer</span>
          </button>
        </div>
      </div>

      {/* Peripherals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {peripherals.map(p => (
          <div
            key={p.id}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono text-neutral-400">{p.type}</span>
                <span className="flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                  <CheckCircle className="h-3 w-3 text-emerald-600" />
                  {p.status}
                </span>
              </div>

              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mt-1.5 leading-tight">{p.name}</h3>
              <p className="text-xs font-mono text-neutral-500 mt-2 bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
                Port: {p.port}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-[11px] text-neutral-400 font-mono">{p.lastPing}</span>
              <button
                onClick={() => {
                  if (p.type === 'THERMAL_PRINTER') handleTestPrinter();
                  else if (p.type === 'CASH_DRAWER') handleTestDrawer();
                  else if (p.type === 'WEIGHING_SCALE') handleTestScale();
                  else showToast(`Diagnostic signal sent to ${p.name}`, 'info');
                }}
                className="font-semibold text-neutral-900 dark:text-white hover:underline"
              >
                Diagnostic Test →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
