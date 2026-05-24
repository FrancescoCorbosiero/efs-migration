import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function validateRequired(keys, context) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${context}:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCopy env.example to .env and fill in the values.`
    );
  }
}

function loadJsonList(relativePath) {
  const path = resolve(here, relativePath);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error(`Failed to read ${relativePath}: ${err.message}`);
  }
}

const config = {
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION,
  },
  woo: {
    baseUrl: process.env.WOO_BASE_URL,
    consumerKey: process.env.WOO_CONSUMER_KEY,
    consumerSecret: process.env.WOO_CONSUMER_SECRET,
    // Optional: shop name to reject as a vendor value. When a brand-list
    // entry or category accidentally equals the shop's own name, the
    // mapper will drop it.
    shopName: process.env.WOO_SHOP_NAME || '',
    // Authoritative brand allowlist for stores that mix brands into
    // product categories. Anything matching a name in this list is
    // treated as the vendor and excluded from collections / product_type.
    brands: loadJsonList('config/brands.json'),
    // Fishing-type / cross-cutting category allowlist. Matches stay in
    // collections (still useful to browse) but are excluded from
    // product_type so they don't outrank a real product category.
    fishingTypes: loadJsonList('config/fishing-types.json'),
  },
  validateShopify() {
    validateRequired(
      ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_API_VERSION'],
      'Shopify'
    );
  },
  validateWoo() {
    validateRequired(
      ['WOO_BASE_URL', 'WOO_CONSUMER_KEY', 'WOO_CONSUMER_SECRET'],
      'WooCommerce'
    );
  },
};

export default config;
