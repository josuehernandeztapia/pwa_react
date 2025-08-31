import { useState, useEffect, useRef, useCallback } from 'react';
import IndexedDBService from '../services/storage/indexedDBService';
import OdooApiService from '../services/api/odooApiService';
import ConektaService from '../services/payments/conektaService';
import MifieldService from '../services/signatures/mifieldService';
import ServiceWorkerService from '../services/pwa/serviceWorkerService';
import DataSyncService from '../services/sync/dataSyncService';

export interface ServicesConfig {
  odoo?: {
    baseUrl: string;
    database: string;
    username: string;
    password: string;
  };
  conekta?: {
    publicKey: string;
    apiVersion?: string;
    locale?: string;
    sandboxMode?: boolean;
  };
  mifiel?: {
    appId: string;
    appSecret: string;
    baseUrl: string;
    sandboxMode?: boolean;
  };
  serviceWorker?: {
    updateCheckInterval?: number;
    enableBackgroundSync?: boolean;
    enablePushNotifications?: boolean;
  };
  dataSync?: {
    autoSyncInterval?: number;
    maxRetries?: number;
    enableRealTimeSync?: boolean;
  };
}

interface ServiceInstances {
  storage: IndexedDBService | null;
  api: OdooApiService | null;
  payments: ConektaService | null;
  signatures: MifieldService | null;
  serviceWorker: ServiceWorkerService | null;
  dataSync: DataSyncService | null;
}

interface ServicesState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  services: ServiceInstances;
}

export const useServices = (config: ServicesConfig) => {
  const [state, setState] = useState<ServicesState>({
    initialized: false,
    loading: true,
    error: null,
    services: {
      storage: null,
      api: null,
      payments: null,
      signatures: null,
      serviceWorker: null,
      dataSync: null
    }
  });

  const initializationRef = useRef(false);

  const initializeServices = useCallback(async () => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Initialize IndexedDB Storage
      const storageService = new IndexedDBService();
      await storageService.initDB();

      // Initialize API Service
      let apiService: OdooApiService | null = null;
      if (config.odoo) {
        apiService = new OdooApiService(config.odoo);
        await apiService.authenticate();
      }

      // Initialize Payment Service
      let paymentsService: ConektaService | null = null;
      if (config.conekta) {
        paymentsService = new ConektaService(config.conekta);
      }

      // Initialize Signature Service
      let signaturesService: MifieldService | null = null;
      if (config.mifiel) {
        signaturesService = new MifieldService(config.mifiel);
        await signaturesService.testConnection();
      }

      // Initialize Service Worker
      const serviceWorkerService = new ServiceWorkerService(config.serviceWorker);
      await serviceWorkerService.register();

      // Initialize Data Sync Service
      let dataSyncService: DataSyncService | null = null;
      if (apiService) {
        dataSyncService = new DataSyncService(
          config.dataSync,
          storageService,
          apiService,
          serviceWorkerService
        );
      }

      setState({
        initialized: true,
        loading: false,
        error: null,
        services: {
          storage: storageService,
          api: apiService,
          payments: paymentsService,
          signatures: signaturesService,
          serviceWorker: serviceWorkerService,
          dataSync: dataSyncService
        }
      });

      console.log('[useServices] All services initialized successfully');
    } catch (error) {
      console.error('[useServices] Service initialization failed:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Service initialization failed'
      }));
    }
  }, [config]);

  useEffect(() => {
    initializeServices();

    return () => {
      // Cleanup services on unmount
      if (state.services.dataSync) {
        state.services.dataSync.destroy();
      }
      if (state.services.serviceWorker) {
        state.services.serviceWorker.unregister();
      }
    };
  }, []);

  return {
    ...state.services,
    initialized: state.initialized,
    loading: state.loading,
    error: state.error,
    reinitialize: initializeServices
  };
};

export default useServices;