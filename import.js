import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import config from './config.js';
import { importProduct } from './shopify/importer.js';

config.validateShopify();

const filePath = resolve(process.argv[2] || 'samples/sample-product.json');

console.log(`\n🔄 Shopify Importer`);
console.log(`   File: ${filePath}\n`);

let productJson;
try {
  const raw = await readFile(filePath, 'utf-8');
  productJson = JSON.parse(raw);
} catch (err) {
  console.error(`Error reading/parsing product file: ${err.message}`);
  process.exit(1);
}

// Basic validation
const requiredFields = ['title', 'variants'];
const missingFields = requiredFields.filter((f) => !productJson[f]);
if (missingFields.length > 0) {
  console.error(`Invalid product JSON — missing required fields: ${missingFields.join(', ')}`);
  process.exit(1);
}

if (!Array.isArray(productJson.variants) || productJson.variants.length === 0) {
  console.error('Invalid product JSON — variants must be a non-empty array.');
  process.exit(1);
}

try {
  const summary = await importProduct(productJson);
  console.log('\n✅ Import complete!');
  console.log('   Summary:');
  console.log(`   - Shopify ID:  ${summary.shopify_id}`);
  console.log(`   - Handle:      ${summary.handle}`);
  console.log(`   - Title:       ${summary.title}`);
  console.log(`   - Variants:    ${summary.variants_count}`);
  console.log(`   - Metafields:  ${summary.metafields_count}`);
  console.log(`   - Collections: ${summary.collections.map((c) => c.title).join(', ') || 'none'}`);
  console.log('');
} catch (err) {
  console.error(`\n❌ Import failed: ${err.message}`);
  if (err.cause) console.error(`   Cause: ${err.cause}`);
  process.exit(1);
}
