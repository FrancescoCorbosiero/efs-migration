# Shopify Migrator — Claude Code Context

## Project Purpose
Migration tooling for WooCommerce → Shopify catalog migrations.
The architecture is a two-module pipeline:
1. **WooCommerce Exporter** — pulls product data from WooCommerce REST API and normalizes it into an internal JSON model
2. **Shopify Importer** — takes that internal JSON model and pushes it into Shopify via the Admin REST API

These two modules are intentionally decoupled. The internal JSON model (`samples/sample-product.json`) is the contract between them.

---

## Project Structure (target)
```
shopify-migrator/
├── CLAUDE.md
├── .env                          # secrets, never committed
├── .env.example                  # committed, no real values
├── config.js                     # loads + validates env vars
├── shopify/
│   ├── client.js                 # Shopify API client, rate limiting, error handling
│   ├── importer.js               # core import logic (product, metafields, collections)
│   └── mappers.js                # internal JSON model → Shopify API payload
├── woo/                          # not yet implemented
│   ├── client.js                 # WooCommerce REST API client
│   ├── exporter.js               # pulls + paginates products from Woo
│   └── mappers.js                # WooCommerce product → internal JSON model
├── samples/
│   └── sample-product.json       # rich sample product in internal JSON schema
├── import.js                     # CLI: node import.js [file]
├── export.js                     # CLI: node export.js (to be built)
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

---

## Environment Variables

| Variable | Description |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | e.g. `my-store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | from Dev Dashboard → App → Settings |
| `SHOPIFY_CLIENT_SECRET` | from Dev Dashboard → App → Settings |
| `SHOPIFY_API_VERSION` | e.g. `2024-04` |
| `WOO_BASE_URL` | e.g. `https://my-wp-site.com` |
| `WOO_CONSUMER_KEY` | `ck_...` |
| `WOO_CONSUMER_SECRET` | `cs_...` |

---

## Key Technical Decisions
- **Plain Node.js**, ES modules, no TypeScript, minimal dependencies (`dotenv` only)
- **Shopify REST API** (not GraphQL) for simplicity; switch to bulk GraphQL if catalog > 1000 products
- **Auth**: `client_id` + `client_secret` → POST `grant_type=client_credentials` → get `shpat_` token at runtime. Token expires after 24h, so `client.js` must fetch + cache it per process run
- **Rate limiting**: Shopify REST = 2 req/s leaky bucket; on 429 respect `Retry-After` header
- **Collections**: check-before-create (idempotent), uses `custom_collections`
- **Metafields**: created individually after product, one request each
- **No frameworks** — this is a scripting tool, not a web app

---

## Development Status

| Module | Status |
|---|---|
| `shopify/client.js` | 🔲 To build |
| `shopify/mappers.js` | 🔲 To build |
| `shopify/importer.js` | 🔲 To build |
| `import.js` CLI | 🔲 To build |
| `samples/sample-product.json` | 🔲 To build |
| `woo/client.js` | ⏳ Not started |
| `woo/exporter.js` | ⏳ Not started |
| `woo/mappers.js` | ⏳ Not started |
| `export.js` CLI | ⏳ Not started |

---

## Commands
```bash
node import.js                      # import samples/sample-product.json
node import.js path/to/file.json    # import a specific product file
node export.js                      # (future) export from WooCommerce
```