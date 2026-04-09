import config from '../config.js';

const { baseUrl, consumerKey, consumerSecret } = config.woo;
const apiBase = `${baseUrl}/wp-json/wc/v3`;

const authHeader =
  'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

/**
 * Send a request to the WooCommerce REST API.
 * For GET requests, params are added as query string parameters.
 * Returns { data, total, totalPages }.
 */
export async function request(method, path, params = {}) {
  const url = new URL(`${apiBase}${path}`);

  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  const options = {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  };

  if (method !== 'GET' && Object.keys(params).length > 0) {
    options.body = JSON.stringify(params);
  }

  const res = await fetch(url.toString(), options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error ${res.status} ${method} ${path}: ${text}`);
  }

  const data = await res.json();
  const total = parseInt(res.headers.get('X-WP-Total') || '0', 10);
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '0', 10);

  return { data, total, totalPages };
}
