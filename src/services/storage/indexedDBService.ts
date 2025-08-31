import { Client, Document } from '../../models/types';

export interface DocumentStorage {
  id: string;
  clientId: string;
  type: string;
  base64Data: string;
  metadata: {
    uploadDate: Date;
    size: number;
    mimeType: string;
    originalName: string;
  };
}

export interface SyncOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  data: any;
  timestamp: Date;
  retries: number;
}

export interface ClientStorage extends Client {
  lastModified: Date;
  syncStatus: 'pending' | 'synced' | 'failed';
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'ConductoresPWA';
  private readonly DB_VERSION = 3;

  async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => reject(new Error('IndexedDB failed to open'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('clientId', 'clientId', { unique: false });
          docStore.createIndex('type', 'type', { unique: false });
          docStore.createIndex('uploadDate', 'metadata.uploadDate', { unique: false });
        }
        
        // Clients store
        if (!db.objectStoreNames.contains('clients')) {
          const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
          clientStore.createIndex('status', 'status', { unique: false });
          clientStore.createIndex('flow', 'flow', { unique: false });
          clientStore.createIndex('lastModified', 'lastModified', { unique: false });
        }
        
        // Sync queue store
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('retries', 'retries', { unique: false });
        }

        // Settings/Configuration store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initDB() first.');
    }
    return this.db;
  }

  // Document Operations
  async storeDocument(document: DocumentStorage): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    
    return new Promise((resolve, reject) => {
      const request = store.add(document);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getClientDocuments(clientId: string): Promise<DocumentStorage[]> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const index = store.index('clientId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(clientId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getDocumentsByType(type: string): Promise<DocumentStorage[]> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const index = store.index('type');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(type);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(documentId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Client Operations
  async storeClient(client: ClientStorage): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['clients'], 'readwrite');
    const store = transaction.objectStore('clients');
    
    return new Promise((resolve, reject) => {
      const request = store.put({
        ...client,
        lastModified: new Date(),
        syncStatus: 'pending'
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getClient(clientId: string): Promise<ClientStorage | undefined> {
    const db = this.ensureDB();
    const transaction = db.transaction(['clients'], 'readonly');
    const store = transaction.objectStore('clients');
    
    return new Promise((resolve, reject) => {
      const request = store.get(clientId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllClients(): Promise<ClientStorage[]> {
    const db = this.ensureDB();
    const transaction = db.transaction(['clients'], 'readonly');
    const store = transaction.objectStore('clients');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getClientsToSync(): Promise<ClientStorage[]> {
    const db = this.ensureDB();
    const transaction = db.transaction(['clients'], 'readonly');
    const store = transaction.objectStore('clients');
    
    return new Promise((resolve, reject) => {
      const clients: ClientStorage[] = [];
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const client = cursor.value as ClientStorage;
          if (client.syncStatus === 'pending' || client.syncStatus === 'failed') {
            clients.push(client);
          }
          cursor.continue();
        } else {
          resolve(clients);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Sync Queue Operations
  async addToSyncQueue(operation: SyncOperation): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['sync_queue'], 'readwrite');
    const store = transaction.objectStore('sync_queue');
    
    return new Promise((resolve, reject) => {
      const request = store.add(operation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingSyncOperations(): Promise<SyncOperation[]> {
    const db = this.ensureDB();
    const transaction = db.transaction(['sync_queue'], 'readonly');
    const store = transaction.objectStore('sync_queue');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const operations = request.result as SyncOperation[];
        // Sort by timestamp, oldest first
        operations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(operations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeSyncOperation(operationId: string): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['sync_queue'], 'readwrite');
    const store = transaction.objectStore('sync_queue');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(operationId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncOperation(operation: SyncOperation): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['sync_queue'], 'readwrite');
    const store = transaction.objectStore('sync_queue');
    
    return new Promise((resolve, reject) => {
      const request = store.put(operation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Settings Operations
  async setSetting(key: string, value: any): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const db = this.ensureDB();
    const transaction = db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Utility Methods
  async clearAllData(): Promise<void> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents', 'clients', 'sync_queue', 'settings'], 'readwrite');
    
    const promises = [
      'documents',
      'clients',
      'sync_queue',
      'settings'
    ].map(storeName => {
      const store = transaction.objectStore(storeName);
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  }

  async getStorageStats(): Promise<{
    documentsCount: number;
    clientsCount: number;
    syncQueueCount: number;
    estimatedSize: number;
  }> {
    const db = this.ensureDB();
    const transaction = db.transaction(['documents', 'clients', 'sync_queue'], 'readonly');
    
    const getCount = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    const [documentsCount, clientsCount, syncQueueCount] = await Promise.all([
      getCount('documents'),
      getCount('clients'),
      getCount('sync_queue')
    ]);

    // Estimate storage size (rough calculation)
    const estimatedSize = (documentsCount * 50000) + (clientsCount * 5000) + (syncQueueCount * 1000);

    return {
      documentsCount,
      clientsCount,
      syncQueueCount,
      estimatedSize
    };
  }

  // File conversion utilities
  static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  static base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

export default IndexedDBService;