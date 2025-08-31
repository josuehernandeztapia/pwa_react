import { useState, useEffect, useCallback } from 'react';
import IndexedDBService, { DocumentStorage, StorageStatistics } from '../services/storage/indexedDBService';
import type { Client, Document } from '../types/types';

interface UseOfflineStorageState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  statistics: StorageStatistics | null;
}

export const useOfflineStorage = (service: IndexedDBService | null) => {
  const [state, setState] = useState<UseOfflineStorageState>({
    initialized: false,
    loading: false,
    error: null,
    statistics: null
  });

  // Client operations
  const storeClient = useCallback(async (client: Client): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      await service.storeClient(client);
      setState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to store client';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const getClient = useCallback(async (clientId: string): Promise<Client | null> => {
    if (!service) throw new Error('Storage service not available');
    return service.getClient(clientId);
  }, [service]);

  const getAllClients = useCallback(async (): Promise<Client[]> => {
    if (!service) throw new Error('Storage service not available');
    return service.getAllClients();
  }, [service]);

  const searchClients = useCallback(async (query: string): Promise<Client[]> => {
    if (!service) throw new Error('Storage service not available');
    return service.searchClients(query);
  }, [service]);

  const deleteClient = useCallback(async (clientId: string): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    await service.deleteClient(clientId);
  }, [service]);

  // Document operations
  const storeDocument = useCallback(async (document: DocumentStorage): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      await service.storeDocument(document);
      setState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to store document';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const getDocument = useCallback(async (documentId: string): Promise<DocumentStorage | null> => {
    if (!service) throw new Error('Storage service not available');
    return service.getDocument(documentId);
  }, [service]);

  const getClientDocuments = useCallback(async (clientId: string): Promise<DocumentStorage[]> => {
    if (!service) throw new Error('Storage service not available');
    return service.getClientDocuments(clientId);
  }, [service]);

  const getDocumentsByType = useCallback(async (type: string): Promise<DocumentStorage[]> => {
    if (!service) throw new Error('Storage service not available');
    return service.getDocumentsByType(type);
  }, [service]);

  const deleteDocument = useCallback(async (documentId: string): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    await service.deleteDocument(documentId);
  }, [service]);

  // File operations
  const storeFile = useCallback(async (
    file: File,
    metadata?: { clientId?: string; type?: string; description?: string }
  ): Promise<string> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const base64Content = await service.fileToBase64(file);
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const document: DocumentStorage = {
        id: documentId,
        name: file.name,
        type: metadata?.type || 'file',
        content: base64Content,
        mimeType: file.type,
        size: file.size,
        clientId: metadata?.clientId,
        description: metadata?.description,
        createdAt: new Date(),
        lastModified: new Date()
      };

      await service.storeDocument(document);
      setState(prev => ({ ...prev, loading: false }));
      return documentId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to store file';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const downloadFile = useCallback(async (documentId: string): Promise<Blob | null> => {
    if (!service) throw new Error('Storage service not available');
    
    const document = await service.getDocument(documentId);
    if (!document || !document.content) return null;

    try {
      return await service.base64ToBlob(document.content, document.mimeType);
    } catch (error) {
      console.error('Failed to convert document to blob:', error);
      return null;
    }
  }, [service]);

  // Sync queue operations
  const addToSyncQueue = useCallback(async (item: any): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    await service.addToSyncQueue(item);
  }, [service]);

  const getSyncQueue = useCallback(async (): Promise<any[]> => {
    if (!service) throw new Error('Storage service not available');
    return service.getSyncQueue();
  }, [service]);

  const clearSyncQueue = useCallback(async (): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    await service.clearSyncQueue();
  }, [service]);

  // Metadata operations
  const setMetadata = useCallback(async (key: string, value: any): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    await service.setMetadata(key, value);
  }, [service]);

  const getMetadata = useCallback(async (key: string): Promise<any> => {
    if (!service) throw new Error('Storage service not available');
    return service.getMetadata(key);
  }, [service]);

  // Statistics and management
  const refreshStatistics = useCallback(async (): Promise<void> => {
    if (!service) return;

    try {
      const stats = await service.getStorageStatistics();
      setState(prev => ({ ...prev, statistics: stats, error: null }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get statistics'
      }));
    }
  }, [service]);

  const clearExpiredItems = useCallback(async (olderThanDays: number = 30): Promise<number> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const deletedCount = await service.clearExpiredItems(olderThanDays);
      setState(prev => ({ ...prev, loading: false }));
      await refreshStatistics(); // Refresh stats after cleanup
      return deletedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear expired items';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service, refreshStatistics]);

  const clearAllData = useCallback(async (): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      await service.clearAllData();
      setState(prev => ({ 
        ...prev, 
        loading: false,
        statistics: {
          totalClients: 0,
          totalDocuments: 0,
          totalSize: 0,
          syncQueueSize: 0,
          oldestItem: null,
          newestItem: null
        }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear all data';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  // Export/Import functionality
  const exportData = useCallback(async (): Promise<string> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const clients = await service.getAllClients();
      const documents = await service.getDocumentsByType(''); // Get all documents
      const syncQueue = await service.getSyncQueue();
      
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        clients,
        documents,
        syncQueue
      };
      
      setState(prev => ({ ...prev, loading: false }));
      return JSON.stringify(exportData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const importData = useCallback(async (jsonData: string): Promise<void> => {
    if (!service) throw new Error('Storage service not available');
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const data = JSON.parse(jsonData);
      
      // Import clients
      if (data.clients) {
        for (const client of data.clients) {
          await service.storeClient(client);
        }
      }
      
      // Import documents
      if (data.documents) {
        for (const document of data.documents) {
          await service.storeDocument(document);
        }
      }
      
      setState(prev => ({ ...prev, loading: false }));
      await refreshStatistics();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import data';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service, refreshStatistics]);

  // Initialize and refresh statistics on service change
  useEffect(() => {
    if (service) {
      setState(prev => ({ ...prev, initialized: true }));
      refreshStatistics();
      
      // Set up periodic statistics refresh
      const statsInterval = setInterval(refreshStatistics, 60000); // Every minute
      
      return () => {
        clearInterval(statsInterval);
      };
    } else {
      setState(prev => ({ 
        ...prev, 
        initialized: false,
        statistics: null 
      }));
    }
  }, [service, refreshStatistics]);

  // Computed values
  const storageUsage = state.statistics ? {
    used: state.statistics.totalSize,
    percentage: state.statistics.totalSize / (100 * 1024 * 1024) * 100, // Assuming 100MB limit
    clientsCount: state.statistics.totalClients,
    documentsCount: state.statistics.totalDocuments
  } : null;

  const isStorageFull = storageUsage ? storageUsage.percentage > 90 : false;

  return {
    // State
    initialized: state.initialized,
    loading: state.loading,
    error: state.error,
    statistics: state.statistics,
    
    // Computed values
    storageUsage,
    isStorageFull,

    // Client operations
    storeClient,
    getClient,
    getAllClients,
    searchClients,
    deleteClient,

    // Document operations
    storeDocument,
    getDocument,
    getClientDocuments,
    getDocumentsByType,
    deleteDocument,

    // File operations
    storeFile,
    downloadFile,

    // Sync queue operations
    addToSyncQueue,
    getSyncQueue,
    clearSyncQueue,

    // Metadata operations
    setMetadata,
    getMetadata,

    // Management operations
    refreshStatistics,
    clearExpiredItems,
    clearAllData,
    exportData,
    importData,

    // Direct service access
    service
  };
};

export default useOfflineStorage;