const CACHE_NAME = 'student-problem-helper-v1';
const STATIC_CACHE_NAME = 'static-cache-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-cache-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  // Add other static assets as needed
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
  /\/api\/subjects/,
  /\/api\/problems/,
];

// Assets that should never be cached
const NEVER_CACHE_PATTERNS = [
  /\/api\/analyze-problem/,
  /\/auth\//,
  /\/sockjs-node/,
  /hot-update/,
  /chrome-extension/,
  /moz-extension/,
  /ms-browser-extension/,
  /safari-extension/,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache static assets', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Claim all clients immediately
  self.clients.claim();
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip unsupported URL schemes (chrome-extension, moz-extension, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip requests that should never be cached
  if (NEVER_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return;
  }
  
  // Handle different types of requests
  if (url.origin === location.origin) {
    // Same-origin requests (app assets)
    event.respondWith(handleAppRequest(request));
  } else {
    // Cross-origin requests (external APIs, CDNs, etc.)
    event.respondWith(handleExternalRequest(request));
  }
});

// Handle app requests (cache first for static, network first for dynamic)
async function handleAppRequest(request) {
  const url = new URL(request.url);
  
  // For the root path and navigation requests
  if (url.pathname === '/' || request.mode === 'navigate') {
    return handleNavigationRequest(request);
  }
  
  // For static assets (CSS, JS, images)
  if (isStaticAsset(url.pathname)) {
    return handleStaticAsset(request);
  }
  
  // For API requests
  if (url.pathname.startsWith('/api/')) {
    return handleAPIRequest(request);
  }
  
  // Default: try network first, fall back to cache
  return handleNetworkFirst(request);
}

// Handle navigation requests (app shell)
async function handleNavigationRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok && isCacheable(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match('/');
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    return createOfflineResponse();
  }
}

// Handle static assets (cache first)
async function handleStaticAsset(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && isCacheable(request)) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Failed to fetch static asset', request.url);
    throw error;
  }
}

// Handle API requests
async function handleAPIRequest(request) {
  const url = new URL(request.url);
  
  // Check if this API should be cached
  const shouldCache = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && shouldCache && isCacheable(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    if (shouldCache) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Return offline API response
    return createOfflineAPIResponse(url.pathname);
  }
}

// Handle external requests (network first, cache as backup)
async function handleExternalRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && isCacheable(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Handle network first strategy
async function handleNetworkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && isCacheable(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Helper: Check if request can be cached
function isCacheable(request) {
  try {
    const url = new URL(request.url);
    
    // Only cache HTTP/HTTPS requests
    if (!url.protocol.startsWith('http')) {
      return false;
    }
    
    // Don't cache if URL has unsupported schemes
    if (url.protocol === 'chrome-extension:' || 
        url.protocol === 'moz-extension:' || 
        url.protocol === 'ms-browser-extension:' ||
        url.protocol === 'safari-extension:') {
      return false;
    }
    
    // Don't cache blob or data URLs
    if (url.protocol === 'blob:' || url.protocol === 'data:') {
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn('Service Worker: Error checking if request is cacheable:', error);
    return false;
  }
}

// Helper: Check if request is for a static asset
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname) ||
         pathname.includes('/static/');
}

// Create offline response for the main app
function createOfflineResponse() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Problem Helper - Offline</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          height: 100vh;
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          color: white;
          text-align: center;
        }
        .offline-container {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 3rem;
          backdrop-filter: blur(10px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }
        .spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 2rem;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        h1 { margin-bottom: 1rem; }
        p { opacity: 0.9; line-height: 1.6; }
        .retry-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 1rem 2rem;
          border-radius: 25px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 2rem;
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="spinner"></div>
        <h1>📚 Problem Helper</h1>
        <p>You're currently offline, but don't worry!<br>
        We're trying to reconnect you...</p>
        <p>In the meantime, you can still browse previously loaded content.</p>
        <button class="retry-btn" onclick="window.location.reload()">Try Again</button>
      </div>
      <script>
        // Auto-retry connection every 30 seconds
        setInterval(() => {
          if (navigator.onLine) {
            window.location.reload();
          }
        }, 30000);
        
        // Listen for online event
        window.addEventListener('online', () => {
          window.location.reload();
        });
      </script>
    </body>
    </html>
  `;
  
  return new Response(offlineHTML, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

// Create offline response for API requests
function createOfflineAPIResponse(pathname) {
  const offlineData = {
    error: 'You are currently offline. Please check your internet connection and try again.',
    offline: true,
    cached: false
  };
  
  // Provide cached-like responses for some endpoints
  if (pathname.includes('/subjects')) {
    return new Response(JSON.stringify({
      subjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Other']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (pathname.includes('/problems')) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify(offlineData), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag);
  
  if (event.tag === 'upload-problem') {
    event.waitUntil(syncOfflineUploads());
  }
});

// Sync offline uploads when back online
async function syncOfflineUploads() {
  // This would handle any queued uploads from when the user was offline
  console.log('Service Worker: Syncing offline uploads...');
  
  // Implementation would depend on how you want to handle offline uploads
  // For now, we'll just log that sync is happening
}

// Handle push notifications (if you want to add them later)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: 'New AI analysis is ready!',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: {
      url: '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('Problem Helper', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('Service Worker: Loaded successfully'); 