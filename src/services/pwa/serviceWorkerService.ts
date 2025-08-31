export interface ServiceWorkerConfig {
  updateCheckInterval?: number; // minutes
  enableBackgroundSync?: boolean;
  enablePushNotifications?: boolean;
  maxCacheSize?: number; // bytes
  offlineStrategy?: 'cacheFirst' | 'networkFirst' | 'staleWhileRevalidate';
}

export interface CacheStatus {
  [cacheName: string]: {
    count: number;
    size: number;
  };
}

export interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  data: any;
  timestamp: number;
  synced: boolean;
  syncedAt?: number;
  retryCount?: number;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  important?: boolean;
  tag?: string;
}

class ServiceWorkerService {
  private config: ServiceWorkerConfig;
  private serviceWorker: ServiceWorker | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private updateCheckTimer: number | null = null;
  private messageChannel: MessageChannel | null = null;

  constructor(config: ServiceWorkerConfig = {}) {
    this.config = {
      updateCheckInterval: 30, // 30 minutes
      enableBackgroundSync: true,
      enablePushNotifications: true,
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      offlineStrategy: 'staleWhileRevalidate',
      ...config
    };
  }

  async register(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW Service] Service Worker not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('[SW Service] Service Worker registered');

      this.registration.addEventListener('updatefound', () => {
        this.handleUpdateFound();
      });

      // Setup message channel for communication
      this.setupMessageChannel();

      // Start periodic update checks
      if (this.config.updateCheckInterval && this.config.updateCheckInterval > 0) {
        this.startUpdateChecker();
      }

      // Setup push notifications if enabled
      if (this.config.enablePushNotifications) {
        await this.setupPushNotifications();
      }

      // Setup background sync if enabled
      if (this.config.enableBackgroundSync) {
        await this.setupBackgroundSync();
      }

      return true;
    } catch (error) {
      console.error('[SW Service] Registration failed:', error);
      return false;
    }
  }

  private setupMessageChannel(): void {
    this.messageChannel = new MessageChannel();
    
    this.messageChannel.port1.onmessage = (event) => {
      this.handleServiceWorkerMessage(event.data);
    };

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(
        { type: 'INIT_CHANNEL' }, 
        [this.messageChannel.port2]
      );
    }
  }

  private handleServiceWorkerMessage(data: any): void {
    const { type, data: messageData } = data;

    switch (type) {
      case 'CACHE_STATUS':
        this.onCacheStatusUpdate?.(messageData);
        break;
      case 'SYNC_COMPLETED':
        this.onSyncCompleted?.();
        break;
      case 'DOCUMENT_CACHED':
        this.onDocumentCached?.();
        break;
    }
  }

  private handleUpdateFound(): void {
    if (!this.registration) return;

    const newWorker = this.registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[SW Service] New version available');
        this.onUpdateAvailable?.(newWorker);
      }
    });
  }

  private startUpdateChecker(): void {
    const intervalMs = this.config.updateCheckInterval! * 60 * 1000;
    
    this.updateCheckTimer = window.setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);
  }

  async checkForUpdates(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      await this.registration.update();
      return true;
    } catch (error) {
      console.error('[SW Service] Update check failed:', error);
      return false;
    }
  }

  async skipWaiting(): Promise<void> {
    if (!this.registration?.waiting) return;

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    return new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        resolve();
      }, { once: true });
    });
  }

  async getCacheStatus(): Promise<CacheStatus | null> {
    if (!this.messageChannel) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);
      
      this.onCacheStatusUpdate = (status: CacheStatus) => {
        clearTimeout(timeout);
        this.onCacheStatusUpdate = undefined;
        resolve(status);
      };

      this.messageChannel.port1.postMessage({ type: 'GET_CACHE_STATUS' });
    });
  }

  async clearAllCaches(): Promise<boolean> {
    if (!this.messageChannel) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 10000);
      
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'CACHE_CLEARED') {
          clearTimeout(timeout);
          this.messageChannel?.port1.removeEventListener('message', handler);
          resolve(true);
        }
      };

      this.messageChannel.port1.addEventListener('message', handler);
      this.messageChannel.port1.postMessage({ type: 'CLEAR_CACHE' });
    });
  }

  async forceSync(): Promise<boolean> {
    if (!this.messageChannel) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 30000);
      
      this.onSyncCompleted = () => {
        clearTimeout(timeout);
        this.onSyncCompleted = undefined;
        resolve(true);
      };

      this.messageChannel.port1.postMessage({ type: 'FORCE_SYNC' });
    });
  }

  async cacheDocument(documentData: {
    id: string;
    clientId: string;
    type: string;
    content: string;
    metadata?: any;
  }): Promise<boolean> {
    if (!this.messageChannel) return false;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      
      this.onDocumentCached = () => {
        clearTimeout(timeout);
        this.onDocumentCached = undefined;
        resolve(true);
      };

      this.messageChannel.port1.postMessage({ 
        type: 'CACHE_DOCUMENT', 
        data: documentData 
      });
    });
  }

  // Push Notifications
  private async setupPushNotifications(): Promise<void> {
    if (!('PushManager' in window) || !this.registration) {
      console.warn('[SW Service] Push notifications not supported');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('[SW Service] Push notifications enabled');
      }
    } catch (error) {
      console.error('[SW Service] Push notification setup failed:', error);
    }
  }

  async subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionData | null> {
    if (!this.registration) return null;

    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
      });

      const p256dh = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)));

      return {
        endpoint: subscription.endpoint,
        keys: { p256dh, auth }
      };
    } catch (error) {
      console.error('[SW Service] Push subscription failed:', error);
      return null;
    }
  }

  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      const subscription = await this.registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SW Service] Push unsubscription failed:', error);
      return false;
    }
  }

  async showNotification(data: NotificationData): Promise<void> {
    if (!this.registration || Notification.permission !== 'granted') {
      console.warn('[SW Service] Cannot show notification - no permission');
      return;
    }

    const options: NotificationOptions = {
      body: data.body,
      icon: data.icon || '/assets/icons/icon-192x192.png',
      badge: data.badge || '/assets/icons/badge-72x72.png',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.important || false,
      tag: data.tag || 'cmu-notification'
    };

    await this.registration.showNotification(data.title, options);
  }

  // Background Sync
  private async setupBackgroundSync(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('sync' in window.ServiceWorkerRegistration.prototype)) {
      console.warn('[SW Service] Background sync not supported');
      return;
    }

    console.log('[SW Service] Background sync enabled');
  }

  async requestBackgroundSync(tag: string = 'background-sync'): Promise<boolean> {
    if (!this.registration || !('sync' in this.registration)) {
      return false;
    }

    try {
      await this.registration.sync.register(tag);
      return true;
    } catch (error) {
      console.error('[SW Service] Background sync registration failed:', error);
      return false;
    }
  }

  // Offline Detection
  isOnline(): boolean {
    return navigator.onLine;
  }

  onOnlineStatusChange(callback: (online: boolean) => void): () => void {
    const onlineHandler = () => callback(true);
    const offlineHandler = () => callback(false);

    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);

    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }

  // Utility Methods
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  async getInstallPrompt(): Promise<BeforeInstallPromptEvent | null> {
    return new Promise((resolve) => {
      let deferredPrompt: BeforeInstallPromptEvent | null = null;

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e as BeforeInstallPromptEvent;
        resolve(deferredPrompt);
      });

      // Timeout after 2 seconds
      setTimeout(() => resolve(deferredPrompt), 2000);
    });
  }

  async promptInstall(): Promise<{ outcome: 'accepted' | 'dismissed' | 'error' }> {
    const installPrompt = await this.getInstallPrompt();
    
    if (!installPrompt) {
      return { outcome: 'error' };
    }

    try {
      installPrompt.prompt();
      const choiceResult = await installPrompt.userChoice;
      return { outcome: choiceResult.outcome as 'accepted' | 'dismissed' };
    } catch (error) {
      console.error('[SW Service] Install prompt failed:', error);
      return { outcome: 'error' };
    }
  }

  isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }

  // Analytics and Monitoring
  async getPerformanceMetrics(): Promise<{
    cacheHitRate: number;
    offlineRequests: number;
    syncSuccessRate: number;
    installationStatus: string;
  } | null> {
    const cacheStatus = await this.getCacheStatus();
    if (!cacheStatus) return null;

    const totalCacheSize = Object.values(cacheStatus)
      .reduce((total, cache) => total + cache.size, 0);

    return {
      cacheHitRate: 0, // Would be calculated from actual metrics
      offlineRequests: 0, // Would be fetched from IndexedDB
      syncSuccessRate: 0, // Would be calculated from sync queue
      installationStatus: this.isInstalled() ? 'installed' : 'browser'
    };
  }

  unregister(): void {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }

    if (this.registration) {
      this.registration.unregister();
      this.registration = null;
    }

    this.serviceWorker = null;
    this.messageChannel = null;
  }

  // Event Handlers (can be overridden)
  onUpdateAvailable?: (newWorker: ServiceWorker) => void;
  onCacheStatusUpdate?: (status: CacheStatus) => void;
  onSyncCompleted?: () => void;
  onDocumentCached?: () => void;
}

// Interface for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
}

export default ServiceWorkerService;