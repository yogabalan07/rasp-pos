import { SyncRecord, SystemStatus, SyncState, NetworkStatus } from '../types';
import { INITIAL_SYNC_RECORDS } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';

let syncRecords: SyncRecord[] = [...INITIAL_SYNC_RECORDS];
let isSimulatedOffline: boolean = false;
let syncState: SyncState = 'SYNCHRONIZED';
let listeners: Array<(status: SystemStatus) => void> = [];

export const syncService = {
  getStatus(): SystemStatus {
    const pendingCount = syncRecords.filter(r => r.status === 'PENDING').length;
    return {
      localServer: 'ONLINE',
      localIp: '10.205.100.50',
      cloudServer: isSimulatedOffline ? 'OFFLINE' : 'ONLINE',
      syncState: isSimulatedOffline ? (pendingCount > 0 ? 'PENDING' : 'SYNCHRONIZED') : syncState,
      pendingSyncCount: pendingCount,
      lastSyncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSimulatedOffline,
    };
  },

  isCloudOnline(): boolean {
    return !isSimulatedOffline;
  },

  subscribe(listener: (status: SystemStatus) => void): () => void {
    listeners.push(listener);
    listener(this.getStatus());
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  notify(): void {
    const status = this.getStatus();
    listeners.forEach(l => l(status));
  },

  simulateOffline(): void {
    isSimulatedOffline = true;
    syncState = 'PENDING';
    this.notify();
  },

  async restoreInternet(): Promise<void> {
    isSimulatedOffline = false;
    syncState = 'SYNCING';
    this.notify();
    
    // Simulate sync in progress
    await delay(1200);
    
    // Mark all pending as synced
    syncRecords = syncRecords.map(r => 
      r.status === 'PENDING' ? { ...r, status: 'SYNCED', retryCount: r.retryCount + 1 } : r
    );
    
    syncState = 'SYNCHRONIZED';
    this.notify();
  },

  addRecord(record: { transactionId: string; type: SyncRecord['type']; status: 'SYNCED' | 'PENDING' }): void {
    const newRecord: SyncRecord = {
      id: `sync-${Date.now()}`,
      transactionId: record.transactionId,
      type: record.type,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: isSimulatedOffline ? 'PENDING' : record.status,
      retryCount: 0,
    };
    syncRecords.unshift(newRecord);
    this.notify();
  },

  async getRecords(): Promise<ApiResponse<SyncRecord[]>> {
    await delay(30);
    return createResponse([...syncRecords]);
  },

  async triggerManualSync(): Promise<ApiResponse<number>> {
    if (isSimulatedOffline) {
      throw new Error('Cannot sync: Cloud server unreachable (Offline mode)');
    }
    syncState = 'SYNCING';
    this.notify();
    await delay(900);
    let count = 0;
    syncRecords = syncRecords.map(r => {
      if (r.status === 'PENDING' || r.status === 'FAILED') {
        count++;
        return { ...r, status: 'SYNCED' };
      }
      return r;
    });
    syncState = 'SYNCHRONIZED';
    this.notify();
    return createResponse(count, `Successfully synchronized ${count} pending records`);
  }
};
