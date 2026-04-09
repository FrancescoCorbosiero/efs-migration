import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from './client.js';
import { mapWooProduct } from './mappers.js';

const PER_PAGE = 100;

/**
 * Fetch all variations for a variable product, handling pagination.
 */
async function fetchAllVariations(productId) {
  const variations = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await request('GET', `/products/${productId}/variations`, {
      per_page: PER_PAGE,
      page,
    });
    variations.push(...res.data);
    totalPages = res.totalPages;
    page++;
  }

  return variations;
}

/**
 * Fetch the store's weight unit from WooCommerce settings.
 * Falls back to "kg" if the endpoint is unavailable.
 */
async function fetchWeightUnit() {
  try {
    const { data } = await request('GET', '/settings/products/woocommerce_weight_unit');
    return data.value || 'kg';
  } catch {
    return 'kg';
  }
}

/**
 * Export all products from WooCommerce, map to internal JSON model,
 * and save each as a JSON file in the output directory.
 *
 * Returns an array of { slug, file, variantsCount }.
 */
export async function exportAllProducts(outputDir = 'output') {
  await mkdir(outputDir, { recursive: true });

  const weightUnit = await fetchWeightUnit();
  console.log(`[export] Weight unit: ${weightUnit}`);

  let page = 1;
  let totalPages = 1;
  let totalProducts = 0;
  const results = [];

  while (page <= totalPages) {
    console.log(`[export] Fetching products page ${page}${totalPages > 1 ? `/${totalPages}` : ''}…`);
    const res = await request('GET', '/products', { per_page: PER_PAGE, page });
    totalPages = res.totalPages;

    for (const wooProduct of res.data) {
      totalProducts++;
      let variations = [];

      if (wooProduct.type === 'variable') {
        console.log(`[export]   Fetching variations for "${wooProduct.name}" (id=${wooProduct.id})…`);
        variations = await fetchAllVariations(wooProduct.id);
        console.log(`[export]   Found ${variations.length} variation(s).`);
      }

      const mapped = mapWooProduct(wooProduct, variations, weightUnit);
      const filename = `${mapped.slug || `product-${wooProduct.id}`}.json`;
      const filePath = join(outputDir, filename);

      await writeFile(filePath, JSON.stringify(mapped, null, 2) + '\n');
      console.log(`[export]   Saved: ${filePath} (${mapped.variants.length} variants)`);

      results.push({
        slug: mapped.slug,
        file: filePath,
        title: mapped.title,
        variants_count: mapped.variants.length,
        collections: mapped.collections,
      });
    }

    page++;
  }

  return { totalProducts, results };
}
