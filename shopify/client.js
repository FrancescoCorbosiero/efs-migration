import config from '../config.js';

const { storeDomain, clientId, clientSecret, apiVersion } = config.shopify;
const baseUrl = `https://${storeDomain}/admin/api/${apiVersion}`;
const tokenUrl = `https://${storeDomain}/admin/oauth/access_token`;

// --- Token management ---

let cachedToken = null;

async function fetchToken() {
  console.log('[shopify] Fetching access token…');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  console.log('[shopify] Access token obtained.');
  return cachedToken;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  return fetchToken();
}

function invalidateToken() {
  cachedToken = null;
}

// --- Rate limiting (2 req/s leaky bucket) ---

const MIN_INTERVAL_MS = 500; // 2 requests per second
let lastRequestTime = 0;
let requestQueue = Promise.resolve();

function enqueue(fn) {
  requestQueue = requestQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
      await sleep(MIN_INTERVAL_MS - elapsed);
    }
    lastRequestTime = Date.now();
    return fn();
  });
  return requestQueue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Core request function ---

async function executeRequest(method, path, body, retryAuth = true) {
  const token = await getToken();
  const url = `${baseUrl}${path}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  // Handle 401 — invalidate token and retry once
  if (res.status === 401 && retryAuth) {
    console.log('[shopify] 401 received, refreshing token…');
    invalidateToken();
    return executeRequest(method, path, body, false);
  }

  // Handle 429 — respect Retry-After header
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
    console.log(`[shopify] Rate limited. Retrying after ${retryAfter}s…`);
    await sleep(retryAfter * 1000);
    return executeRequest(method, path, body, retryAuth);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status} ${method} ${path}: ${text}`);
  }

  // Some endpoints return 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Send a request to the Shopify Admin REST API.
 * All calls are serialized through a leaky bucket (2 req/s).
 */
export async function request(method, path, body) {
  return enqueue(() => executeRequest(method, path, body));
}
