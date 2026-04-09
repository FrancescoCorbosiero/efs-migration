import config from './config.js';
import { exportAllProducts } from './woo/exporter.js';

config.validateWoo();

const outputDir = process.argv[2] || 'output';

console.log(`\n🔄 WooCommerce Exporter`);
console.log(`   Output: ${outputDir}/\n`);

try {
  const { totalProducts, results } = await exportAllProducts(outputDir);

  console.log(`\n✅ Export complete!`);
  console.log(`   Total products: ${totalProducts}`);
  console.log(`   Files saved to: ${outputDir}/\n`);

  if (results.length > 0) {
    console.log('   Products:');
    for (const r of results) {
      console.log(`   - ${r.title} (${r.variants_count} variants) → ${r.file}`);
    }
    console.log('');
  }

  console.log('   Next step: import into Shopify with:');
  if (results.length === 1) {
    console.log(`     node import.js ${results[0].file}`);
  } else {
    console.log(`     for f in ${outputDir}/*.json; do node import.js "$f"; done`);
  }
  console.log('');
} catch (err) {
  console.error(`\n❌ Export failed: ${err.message}`);
  process.exit(1);
}
