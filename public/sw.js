const CACHE_NAME = 'cmu-pwa-v4.0';
const STATIC_CACHE = 'static-v4.0';
const DYNAMIC_CACHE = 'dynamic-v4.0';
const API_CACHE = 'api-v4.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png'
];

const API_URLS = [
  '/api/clients',
  '/api/ecosystems',
  '/api/opportunities',
  '/api/documents',
  '/api/notifications'
];

const OFFLINE_FALLBACKS = {
  '/api/': '/offline-api.json',
  '/': '/offline.html'
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      skipWaiting()
    ])
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (request.method !== 'GET') {
    return handleNonGETRequest(event);
  }
  
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(event);
  }
  
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    return handleStaticRequest(event);
  }
  
  return handleDynamicRequest(event);
});

function handleStaticRequest(event) {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/offline.html');
        }
      });
    })
  );
}

function handleApiRequest(event) {
  const url = new URL(event.request.url);
  
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.open(API_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const networkFetch = fetch(event.request).then(response => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            if (cachedResponse) {
              addOfflineHeader(cachedResponse);
              return cachedResponse;
            }
            return createOfflineResponse(url.pathname);
          });
          
          return cachedResponse ? 
            Promise.race([networkFetch, cachedResponse]) : 
            networkFetch;
        });
      })
    );
  }
}

function handleDynamicRequest(event) {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(response => {
          if (response.status === 200) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(() => {});
        
        return cachedResponse;
      }
      
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        return caches.match('/offline.html');
      });
    })
  );
}

function handleNonGETRequest(event) {
  if (event.request.method === 'POST' || 
      event.request.method === 'PUT' || 
      event.request.method === 'DELETE') {
    
    event.respondWith(
      fetch(event.request).catch(async () => {
        const requestData = await event.request.clone().json().catch(() => ({}));
        
        await storeOfflineRequest({
          url: event.request.url,
          method: event.request.method,
          headers: Object.fromEntries(event.request.headers.entries()),
          data: requestData,
          timestamp: Date.now()
        });
        
        return new Response(JSON.stringify({
          success: false,
          offline: true,
          message: 'Request queued for when online'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  }
}

async function storeOfflineRequest(requestData) {
  const db = await openIndexedDB();
  const transaction = db.transaction(['syncQueue'], 'readwrite');
  const store = transaction.objectStore('syncQueue');
  
  await store.add({
    id: generateUUID(),
    ...requestData,
    synced: false
  });
}

function addOfflineHeader(response) {
  if (response.headers) {
    response.headers.set('X-Served-From-Cache', 'true');
    response.headers.set('X-Offline-Mode', 'true');
  }
  return response;
}

function createOfflineResponse(pathname) {
  const offlineData = {
    error: true,
    offline: true,
    message: 'Content not available offline',
    pathname,
    timestamp: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(offlineData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Mode': 'true'
    }
  });
}

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CMU_PWA_DB', 3);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('documents')) {
        const documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
        documentsStore.createIndex('clientId', 'clientId', { unique: false });
        documentsStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncOfflineRequests());
  }
});

async function syncOfflineRequests() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const index = store.index('synced');
    
    const unsynced = await new Promise((resolve, reject) => {
      const request = index.getAll(false);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    for (const request of unsynced) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(request.data)
        });
        
        if (response.ok) {
          await markRequestAsSynced(request.id);
          console.log('[SW] Synced offline request:', request.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync request:', request.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

async function markRequestAsSynced(requestId) {
  const db = await openIndexedDB();
  const transaction = db.transaction(['syncQueue'], 'readwrite');
  const store = transaction.objectStore('syncQueue');
  
  const request = await new Promise((resolve, reject) => {
    const getRequest = store.get(requestId);
    getRequest.onsuccess = () => resolve(getRequest.result);
    getRequest.onerror = () => reject(getRequest.error);
  });
  
  if (request) {
    request.synced = true;
    request.syncedAt = Date.now();
    await store.put(request);
  }
}

self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_CACHE_STATUS':
      getCacheStatus().then(status => {
        event.ports[0].postMessage({ type: 'CACHE_STATUS', data: status });
      });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
      
    case 'FORCE_SYNC':
      syncOfflineRequests().then(() => {
        event.ports[0].postMessage({ type: 'SYNC_COMPLETED' });
      });
      break;
      
    case 'CACHE_DOCUMENT':
      cacheDocument(data).then(() => {
        event.ports[0].postMessage({ type: 'DOCUMENT_CACHED' });
      });
      break;
  }
});

async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    status[cacheName] = {
      count: keys.length,
      size: await calculateCacheSize(cache, keys)
    };
  }
  
  return status;
}

async function calculateCacheSize(cache, keys) {
  let totalSize = 0;
  
  for (const key of keys) {
    try {
      const response = await cache.match(key);
      if (response) {
        const text = await response.text();
        totalSize += new Blob([text]).size;
      }
    } catch (e) {
      console.warn('[SW] Could not calculate size for:', key.url);
    }
  }
  
  return totalSize;
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

async function cacheDocument(documentData) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    
    await store.put({
      id: documentData.id,
      clientId: documentData.clientId,
      type: documentData.type,
      content: documentData.content,
      metadata: documentData.metadata,
      cachedAt: Date.now()
    });
    
    console.log('[SW] Document cached:', documentData.id);
  } catch (error) {
    console.error('[SW] Failed to cache document:', error);
  }
}

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll().then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Nueva notificación del Asesor CMu',
      icon: '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/badge-72x72.png',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.important || false,
      tag: data.tag || 'cmu-notification'
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Asesor CMu', options)
    );
  }
});

console.log('[SW] Service Worker v4.0 loaded successfully');