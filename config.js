import 'dotenv/config';

function validateRequired(keys, context) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${context}:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nCopy env.example to .env and fill in the values.`
    );
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
