# Shopify Migrator — Claude Code Context

## Project Purpose
Migration tooling for WooCommerce → Shopify catalog migrations.
The architecture is a two-module pipeline:
1. **WooCommerce Exporter** — pulls product data from WooCommerce REST API and normalizes it into an internal JSON model
2. **Shopify Importer** — takes that internal JSON model and pushes it into Shopify via the Admin REST API

These two modules are intentionally decoupled. The internal JSON model (`samples/sample-product.json`) is the contract between them.

---

## Project Structure
```
shopify-migrator/
├── CLAUDE.md
├── .env                          # secrets, never committed
├── env.example                   # committed, no real values
├── config.js                     # loads + validates env vars (lazy per-module)
├── shopify/
│   ├── client.js                 # Shopify API client, rate limiting, error handling
│   ├── importer.js               # core import logic (product, metafields, collections)
│   └── mappers.js                # internal JSON model → Shopify API payload
├── woo/
│   ├── client.js                 # WooCommerce REST API client (Basic Auth)
│   ├── exporter.js               # pulls + paginates products, saves to output/
│   └── mappers.js                # WooCommerce product → internal JSON model
├── samples/
│   └── sample-product.json       # rich sample product in internal JSON schema
├── import.js                     # CLI: node import.js [file]
├── export.js                     # CLI: node export.js [output-dir]
└── package.json
```

---

## Internal JSON Model
The shared contract between the exporter and importer. Key fields:

```json
{
  "title": "",
  "slug": "",
  "description_html": "",
  "short_description": "",
  "vendor": "",
  "product_type": "",
  "tags": [],
  "status": "active | draft",
  "seo": { "title": "", "description": "" },
  "images": [{ "src": "", "alt": "" }],
  "options": [{ "name": "", "values": [] }],
  "variants": [{
    "sku": "", "barcode": "", "price": "", "compare_at_price": "",
    "weight": 0, "weight_unit": "kg | g | lb | oz",
    "inventory_quantity": 0, "inventory_policy": "deny | continue",
    "inventory_management": "shopify | null",
    "option_values": {},
    "image_src": ""
  }],
  "metafields": [{ "namespace": "", "key": "", "value": "", "type": "" }],
  "collections": []
}
```

### Taxonomy Mapping
WooCommerce and Shopify handle taxonomy differently:
- **WooCommerce categories** → `collections` (all category names) + `product_type` (deepest/most specific category)
- **WooCommerce tags** → `tags`
- **WooCommerce "Brand" attribute** → `vendor`
- **Shopify standardized product taxonomy** (`product_category`) uses Shopify's predefined taxonomy IDs — there is no automatic 1:1 mapping from WooCommerce categories. This classification is a post-migration step if needed.
- **Media/images**: Shopify auto-downloads images from source URLs during product creation. WooCommerce image URLs just need to be publicly accessible at import time.

---

## Environment Variables

| Variable | Description | Used by |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | e.g. `my-store.myshopify.com` | import |
| `SHOPIFY_CLIENT_ID` | from Dev Dashboard → App → Settings | import |
| `SHOPIFY_CLIENT_SECRET` | from Dev Dashboard → App → Settings | import |
| `SHOPIFY_API_VERSION` | e.g. `2024-04` | import |
| `WOO_BASE_URL` | e.g. `https://my-wp-site.com` | export |
| `WOO_CONSUMER_KEY` | `ck_...` | export |
| `WOO_CONSUMER_SECRET` | `cs_...` | export |

---

## Key Technical Decisions
- **Plain Node.js**, ES modules, no TypeScript, minimal dependencies (`dotenv` only)
- **Shopify REST API** (not GraphQL) for simplicity; switch to bulk GraphQL if catalog > 1000 products
- **Shopify Auth**: `client_id` + `client_secret` → POST `grant_type=client_credentials` → get `shpat_` token at runtime. Token expires after 24h, so `client.js` must fetch + cache it per process run
- **Shopify Rate limiting**: 2 req/s leaky bucket; on 429 respect `Retry-After` header
- **WooCommerce Auth**: Basic Auth over HTTPS using `consumer_key:consumer_secret`
- **WooCommerce Pagination**: `per_page=100`, reads `X-WP-Total` / `X-WP-TotalPages` headers
- **Variable products**: variations are fetched separately via `/products/{id}/variations`
- **Collections**: check-before-create (idempotent), uses `custom_collections`
- **Metafields**: created individually after product, one request each
- **WooCommerce meta_data**: only non-internal fields (no `_` prefix) are exported; SEO fields from Yoast/Rank Math are extracted into `seo`
- **No frameworks** — this is a scripting tool, not a web app

---

## Development Status

| Module | Status |
|---|---|
| `shopify/client.js` | ✅ Done |
| `shopify/mappers.js` | ✅ Done |
| `shopify/importer.js` | ✅ Done |
| `import.js` CLI | ✅ Done |
| `samples/sample-product.json` | ✅ Done |
| `woo/client.js` | ✅ Done |
| `woo/mappers.js` | ✅ Done |
| `woo/exporter.js` | ✅ Done |
| `export.js` CLI | ✅ Done |

---

## Commands
```bash
# Export from WooCommerce (saves JSON files to output/)
node export.js                      # default output dir: output/
node export.js custom-dir/          # custom output dir

# Import to Shopify
node import.js                      # import samples/sample-product.json
node import.js path/to/file.json    # import a specific product file

# Full migration pipeline
node export.js && for f in output/*.json; do node import.js "$f"; done
```
