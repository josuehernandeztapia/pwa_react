import IndexedDBService, { DocumentStorage } from '../storage/indexedDBService.ts';
import OdooApiService from '../api/odooApiService.ts';
import ServiceWorkerService from '../pwa/serviceWorkerService.ts';

export interface SyncConfig {
  autoSyncInterval?: number; // minutes
  maxRetries?: number;
  batchSize?: number;
  enableRealTimeSync?: boolean;
  conflictResolution?: 'client' | 'server' | 'manual';
}

export interface SyncItem {
  id: string;
  type: 'client' | 'document' | 'opportunity' | 'payment' | 'contract';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount?: number;
  synced: boolean;
  error?: string;
  clientId?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: number | null;
  pendingItems: number;
  failedItems: number;
  syncInProgress: boolean;
  nextSyncTime: number | null;
}

export interface ConflictItem {
  id: string;
  type: string;
  localData: any;
  serverData: any;
  timestamp: number;
}

class DataSyncService {
  private config: SyncConfig;
  private storageService: IndexedDBService;
  private apiService: OdooApiService;
  private serviceWorkerService: ServiceWorkerService;
  private syncTimer: number | null = null;
  private syncInProgress = false;
  private websocket: WebSocket | null = null;

  constructor(
    config: SyncConfig = {},
    storageService: IndexedDBService,
    apiService: OdooApiService,
    serviceWorkerService: ServiceWorkerService
  ) {
    this.config = {
      autoSyncInterval: 15, // 15 minutes
      maxRetries: 3,
      batchSize: 50,
      enableRealTimeSync: true,
      conflictResolution: 'server',
      ...config
    };

    this.storageService = storageService;
    this.apiService = apiService;
    this.serviceWorkerService = serviceWorkerService;

    this.initializeSync();
  }

  private async initializeSync(): Promise<void> {
    // Initialize storage
    await this.storageService.initDB();

    // Start auto-sync if enabled
    if (this.config.autoSyncInterval && this.config.autoSyncInterval > 0) {
      this.startAutoSync();
    }

    // Setup real-time sync if enabled
    if (this.config.enableRealTimeSync) {
      this.setupRealTimeSync();
    }

    // Listen for online/offline changes
    this.serviceWorkerService.onOnlineStatusChange((online) => {
      if (online) {
        console.log('[DataSync] Connection restored, starting sync...');
        this.syncAll();
      } else {
        console.log('[DataSync] Connection lost, stopping real-time sync');
        this.disconnectWebSocket();
      }
    });
  }

  // Auto Sync Management
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    const intervalMs = this.config.autoSyncInterval! * 60 * 1000;
    this.syncTimer = window.setInterval(() => {
      if (this.serviceWorkerService.isOnline() && !this.syncInProgress) {
        this.syncAll();
      }
    }, intervalMs);

    console.log(`[DataSync] Auto-sync started (${this.config.autoSyncInterval} minutes)`);
  }

  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Real-time Sync via WebSocket
  private async setupRealTimeSync(): Promise<void> {
    if (!this.serviceWorkerService.isOnline()) return;

    try {
      const wsUrl = process.env.VITE_WS_URL || 'ws://localhost:3001/ws';
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('[DataSync] WebSocket connected');
        this.sendWebSocketMessage({ type: 'subscribe', topics: ['client_updates', 'document_updates'] });
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleRealTimeUpdate(message);
        } catch (error) {
          console.error('[DataSync] WebSocket message parse error:', error);
        }
      };

      this.websocket.onclose = () => {
        console.log('[DataSync] WebSocket disconnected');
        setTimeout(() => this.setupRealTimeSync(), 5000);
      };

      this.websocket.onerror = (error) => {
        console.error('[DataSync] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[DataSync] WebSocket setup failed:', error);
    }
  }

  private disconnectWebSocket(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  private sendWebSocketMessage(message: any): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  private async handleRealTimeUpdate(message: any): Promise<void> {
    const { type, data } = message;

    try {
      switch (type) {
        case 'client_updated':
          await this.handleServerUpdate('client', data);
          break;
        case 'document_updated':
          await this.handleServerUpdate('document', data);
          break;
        case 'notification_new':
          this.onRealTimeNotification?.(data);
          break;
      }
    } catch (error) {
      console.error('[DataSync] Real-time update handling failed:', error);
    }
  }

  // Sync Operations
  async syncAll(): Promise<boolean> {
    if (this.syncInProgress) {
      console.log('[DataSync] Sync already in progress');
      return false;
    }

    if (!this.serviceWorkerService.isOnline()) {
      console.log('[DataSync] Cannot sync while offline');
      return false;
    }

    this.syncInProgress = true;
    console.log('[DataSync] Starting full sync...');

    try {
      // 1. Sync pending local changes to server
      await this.syncToServer();

      // 2. Pull latest changes from server
      await this.syncFromServer();

      // 3. Resolve conflicts
      await this.resolveConflicts();

      // 4. Update last sync timestamp
      await this.storageService.setMetadata('lastSyncTime', Date.now());

      console.log('[DataSync] Full sync completed');
      this.onSyncCompleted?.(true);
      return true;
    } catch (error) {
      console.error('[DataSync] Full sync failed:', error);
      this.onSyncCompleted?.(false);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncToServer(): Promise<void> {
    const pendingItems = await this.getPendingSyncItems();
    
    if (pendingItems.length === 0) {
      console.log('[DataSync] No pending items to sync');
      return;
    }

    console.log(`[DataSync] Syncing ${pendingItems.length} items to server...`);

    const batches = this.createBatches(pendingItems, this.config.batchSize!);

    for (const batch of batches) {
      await this.processBatch(batch);
    }
  }

  private async syncFromServer(): Promise<void> {
    try {
      const lastSyncTime = await this.storageService.getMetadata('lastSyncTime') || 0;
      
      // Get updated clients
      const clients = await this.apiService.getClients();
      for (const client of clients) {
        await this.handleServerUpdate('client', client);
      }

      // Get updated documents
      const documents = await this.apiService.getDocuments(new Date(lastSyncTime));
      for (const document of documents) {
        await this.handleServerUpdate('document', document);
      }

      console.log('[DataSync] Server sync completed');
    } catch (error) {
      console.error('[DataSync] Server sync failed:', error);
      throw error;
    }
  }

  private async handleServerUpdate(type: string, serverData: any): Promise<void> {
    const localData = await this.getLocalData(type, serverData.id);
    
    if (!localData) {
      // New item from server
      await this.storeLocalData(type, serverData);
      return;
    }

    // Check for conflicts
    if (localData.lastModified > serverData.lastModified) {
      await this.addConflict({
        id: serverData.id,
        type,
        localData,
        serverData,
        timestamp: Date.now()
      });
    } else {
      // Server version is newer, update local
      await this.storeLocalData(type, serverData);
    }
  }

  private async resolveConflicts(): Promise<void> {
    const conflicts = await this.getConflicts();
    
    for (const conflict of conflicts) {
      try {
        const resolution = await this.resolveConflict(conflict);
        if (resolution) {
          await this.storeLocalData(conflict.type, resolution);
          await this.removeConflict(conflict.id);
        }
      } catch (error) {
        console.error('[DataSync] Conflict resolution failed:', error);
      }
    }
  }

  private async resolveConflict(conflict: ConflictItem): Promise<any> {
    switch (this.config.conflictResolution) {
      case 'client':
        return conflict.localData;
      case 'server':
        return conflict.serverData;
      case 'manual':
        // Emit conflict for manual resolution
        this.onConflictDetected?.(conflict);
        return null;
      default:
        return conflict.serverData;
    }
  }

  // Batch Processing
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  private async processBatch(batch: SyncItem[]): Promise<void> {
    const promises = batch.map(item => this.processSyncItem(item));
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('[DataSync] Batch processing failed:', error);
    }
  }

  private async processSyncItem(item: SyncItem): Promise<void> {
    try {
      let result: any;
      
      switch (item.type) {
        case 'client':
          result = await this.syncClient(item);
          break;
        case 'document':
          result = await this.syncDocument(item);
          break;
        case 'opportunity':
          result = await this.syncOpportunity(item);
          break;
        case 'payment':
          result = await this.syncPayment(item);
          break;
        case 'contract':
          result = await this.syncContract(item);
          break;
        default:
          throw new Error(`Unknown sync item type: ${item.type}`);
      }

      // Mark as synced
      await this.markItemAsSynced(item.id);
      console.log(`[DataSync] Item synced: ${item.type}:${item.id}`);
    } catch (error) {
      console.error(`[DataSync] Sync failed for ${item.type}:${item.id}:`, error);
      await this.handleSyncError(item, error as Error);
    }
  }

  // Individual sync methods
  private async syncClient(item: SyncItem): Promise<any> {
    switch (item.action) {
      case 'create':
        return this.apiService.createClient(item.data);
      case 'update':
        return this.apiService.updateClient(item.data.id, item.data);
      case 'delete':
        return this.apiService.deleteClient(item.data.id);
    }
  }

  private async syncDocument(item: SyncItem): Promise<any> {
    switch (item.action) {
      case 'create':
        return this.apiService.uploadDocument(item.data);
      case 'update':
        return this.apiService.updateDocument(item.data.id, item.data);
      case 'delete':
        return this.apiService.deleteDocument(item.data.id);
    }
  }

  private async syncOpportunity(item: SyncItem): Promise<any> {
    switch (item.action) {
      case 'create':
        return this.apiService.createOpportunity(item.data);
      case 'update':
        return this.apiService.updateOpportunity(item.data.id, item.data);
      case 'delete':
        return this.apiService.deleteOpportunity(item.data.id);
    }
  }

  private async syncPayment(item: SyncItem): Promise<any> {
    // Payment sync would typically only be creates/updates from server
    switch (item.action) {
      case 'create':
        return this.apiService.recordPayment(item.data);
      case 'update':
        return this.apiService.updatePayment(item.data.id, item.data);
    }
  }

  private async syncContract(item: SyncItem): Promise<any> {
    switch (item.action) {
      case 'create':
        return this.apiService.createContract(item.data);
      case 'update':
        return this.apiService.updateContract(item.data.id, item.data);
    }
  }

  // Queue Management
  async queueForSync(
    type: SyncItem['type'],
    action: SyncItem['action'],
    data: any,
    clientId?: string
  ): Promise<string> {
    const syncItem: SyncItem = {
      id: this.generateId(),
      type,
      action,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      synced: false,
      clientId
    };

    await this.storageService.addToSyncQueue(syncItem);
    
    // Trigger immediate sync if online
    if (this.serviceWorkerService.isOnline() && !this.syncInProgress) {
      this.syncAll();
    }

    return syncItem.id;
  }

  async getPendingSyncItems(): Promise<SyncItem[]> {
    return this.storageService.getSyncQueue();
  }

  private async markItemAsSynced(itemId: string): Promise<void> {
    await this.storageService.markSyncItemCompleted(itemId);
  }

  private async handleSyncError(item: SyncItem, error: Error): Promise<void> {
    const retryCount = (item.retryCount || 0) + 1;
    
    if (retryCount <= this.config.maxRetries!) {
      item.retryCount = retryCount;
      item.error = error.message;
      await this.storageService.updateSyncItem(item);
    } else {
      console.error(`[DataSync] Item failed after ${retryCount} retries: ${item.type}:${item.id}`);
      item.error = `Failed after ${retryCount} retries: ${error.message}`;
      await this.storageService.updateSyncItem(item);
    }
  }

  // Data Management
  private async getLocalData(type: string, id: string): Promise<any> {
    switch (type) {
      case 'client':
        return this.storageService.getClient(id);
      case 'document':
        return this.storageService.getDocument(id);
      default:
        return null;
    }
  }

  private async storeLocalData(type: string, data: any): Promise<void> {
    data.lastSynced = Date.now();
    
    switch (type) {
      case 'client':
        await this.storageService.storeClient(data);
        break;
      case 'document':
        await this.storageService.storeDocument(data);
        break;
    }
  }

  // Conflict Management
  private async addConflict(conflict: ConflictItem): Promise<void> {
    await this.storageService.storeConflict(conflict);
  }

  private async getConflicts(): Promise<ConflictItem[]> {
    return this.storageService.getConflicts();
  }

  private async removeConflict(conflictId: string): Promise<void> {
    await this.storageService.removeConflict(conflictId);
  }

  // Status and Statistics
  async getSyncStatus(): Promise<SyncStatus> {
    const pendingItems = await this.getPendingSyncItems();
    const lastSyncTime = await this.storageService.getMetadata('lastSyncTime');
    
    return {
      isOnline: this.serviceWorkerService.isOnline(),
      lastSyncTime: lastSyncTime || null,
      pendingItems: pendingItems.filter(item => !item.synced).length,
      failedItems: pendingItems.filter(item => item.error && !item.synced).length,
      syncInProgress: this.syncInProgress,
      nextSyncTime: this.syncTimer ? Date.now() + (this.config.autoSyncInterval! * 60 * 1000) : null
    };
  }

  async clearSyncQueue(): Promise<void> {
    await this.storageService.clearSyncQueue();
  }

  async retrySyncItem(itemId: string): Promise<boolean> {
    const item = await this.storageService.getSyncItem(itemId);
    if (!item) return false;

    item.retryCount = 0;
    item.error = undefined;
    await this.storageService.updateSyncItem(item);

    if (this.serviceWorkerService.isOnline()) {
      await this.processSyncItem(item);
      return true;
    }

    return false;
  }

  // Utility Methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Configuration
  updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.autoSyncInterval !== undefined) {
      if (newConfig.autoSyncInterval > 0) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  // Cleanup
  destroy(): void {
    this.stopAutoSync();
    this.disconnectWebSocket();
  }

  // Event Handlers (can be overridden)
  onSyncCompleted?: (success: boolean) => void;
  onConflictDetected?: (conflict: ConflictItem) => void;
  onRealTimeNotification?: (notification: any) => void;
  onSyncProgress?: (completed: number, total: number) => void;
}

export default DataSyncService;