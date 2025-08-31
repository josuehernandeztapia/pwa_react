import { useState, useEffect, useCallback } from 'react';
import DataSyncService, { SyncStatus, SyncItem, ConflictItem } from '../services/sync/dataSyncService';

interface UseDataSyncState {
  status: SyncStatus | null;
  conflicts: ConflictItem[];
  loading: boolean;
  error: string | null;
}

export const useDataSync = (service: DataSyncService | null) => {
  const [state, setState] = useState<UseDataSyncState>({
    status: null,
    conflicts: [],
    loading: false,
    error: null
  });

  // Manual sync operations
  const syncAll = useCallback(async (): Promise<boolean> => {
    if (!service) return false;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const success = await service.syncAll();
      setState(prev => ({ ...prev, loading: false }));
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      return false;
    }
  }, [service]);

  const forceSync = useCallback(async (): Promise<boolean> => {
    if (!service) return false;
    return service.forceSync();
  }, [service]);

  // Queue management
  const queueForSync = useCallback(async (
    type: SyncItem['type'],
    action: SyncItem['action'],
    data: any,
    clientId?: string
  ): Promise<string | null> => {
    if (!service) return null;

    try {
      const syncId = await service.queueForSync(type, action, data, clientId);
      await refreshStatus();
      return syncId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to queue item'
      }));
      return null;
    }
  }, [service]);

  const retryFailedItems = useCallback(async (): Promise<void> => {
    if (!service) return;

    const pendingItems = await service.getPendingSyncItems();
    const failedItems = pendingItems.filter(item => item.error && !item.synced);

    for (const item of failedItems) {
      await service.retrySyncItem(item.id);
    }

    await refreshStatus();
  }, [service]);

  const clearSyncQueue = useCallback(async (): Promise<void> => {
    if (!service) return;
    
    await service.clearSyncQueue();
    await refreshStatus();
  }, [service]);

  // Conflict resolution
  const resolveConflict = useCallback(async (
    conflictId: string,
    resolution: 'client' | 'server' | any
  ): Promise<void> => {
    if (!service) return;

    // This would need to be implemented in the DataSyncService
    // For now, we'll just refresh conflicts
    await refreshConflicts();
  }, [service]);

  // Status and data refresh
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!service) return;

    try {
      const status = await service.getSyncStatus();
      setState(prev => ({ ...prev, status, error: null }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get sync status'
      }));
    }
  }, [service]);

  const refreshConflicts = useCallback(async (): Promise<void> => {
    if (!service) return;

    try {
      // This would need to be implemented in the DataSyncService
      // const conflicts = await service.getConflicts();
      // setState(prev => ({ ...prev, conflicts }));
    } catch (error) {
      console.error('Failed to refresh conflicts:', error);
    }
  }, [service]);

  // Computed values
  const hasConflicts = state.conflicts.length > 0;
  const hasPendingItems = (state.status?.pendingItems || 0) > 0;
  const hasFailedItems = (state.status?.failedItems || 0) > 0;
  const isOnline = state.status?.isOnline || false;
  const syncInProgress = state.status?.syncInProgress || false;

  // Quick actions
  const queueClientUpdate = useCallback((clientData: any) => {
    return queueForSync('client', 'update', clientData, clientData.id);
  }, [queueForSync]);

  const queueDocumentUpload = useCallback((documentData: any) => {
    return queueForSync('document', 'create', documentData, documentData.clientId);
  }, [queueForSync]);

  const queueOpportunityCreate = useCallback((opportunityData: any) => {
    return queueForSync('opportunity', 'create', opportunityData, opportunityData.clientId);
  }, [queueForSync]);

  const queuePaymentRecord = useCallback((paymentData: any) => {
    return queueForSync('payment', 'create', paymentData, paymentData.clientId);
  }, [queueForSync]);

  // Setup service event handlers and refresh data
  useEffect(() => {
    if (!service) return;

    // Set up event handlers
    service.onSyncCompleted = (success: boolean) => {
      refreshStatus();
      if (!success) {
        setState(prev => ({
          ...prev,
          error: 'Sync completed with errors'
        }));
      }
    };

    service.onConflictDetected = (conflict: ConflictItem) => {
      setState(prev => ({
        ...prev,
        conflicts: [...prev.conflicts, conflict]
      }));
    };

    service.onRealTimeNotification = (notification: any) => {
      console.log('Real-time notification:', notification);
      // Handle real-time notifications here
    };

    // Initial data load
    refreshStatus();
    refreshConflicts();

    // Periodic status refresh
    const statusInterval = setInterval(refreshStatus, 30000); // Every 30 seconds

    return () => {
      clearInterval(statusInterval);
      
      // Cleanup event handlers
      if (service) {
        service.onSyncCompleted = undefined;
        service.onConflictDetected = undefined;
        service.onRealTimeNotification = undefined;
      }
    };
  }, [service, refreshStatus, refreshConflicts]);

  return {
    // State
    status: state.status,
    conflicts: state.conflicts,
    loading: state.loading,
    error: state.error,

    // Computed values
    hasConflicts,
    hasPendingItems,
    hasFailedItems,
    isOnline,
    syncInProgress,

    // Manual sync operations
    syncAll,
    forceSync,

    // Queue management
    queueForSync,
    retryFailedItems,
    clearSyncQueue,

    // Quick actions
    queueClientUpdate,
    queueDocumentUpload,
    queueOpportunityCreate,
    queuePaymentRecord,

    // Conflict resolution
    resolveConflict,

    // Data refresh
    refreshStatus,
    refreshConflicts,

    // Direct service access
    service
  };
};

export default useDataSync;