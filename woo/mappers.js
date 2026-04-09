/**
 * Map a WooCommerce product (+ its fetched variations) to the internal JSON model.
 *
 * WooCommerce taxonomy mapping:
 *   - categories   → collections (array of names) + product_type (primary category)
 *   - tags         → tags (array of names)
 *   - attributes   → options (for variable products)
 *
 * Note: Shopify's standardized product taxonomy (product_category) uses predefined
 * Shopify taxonomy IDs with no 1:1 mapping from WooCommerce. That classification
 * is a separate post-migration step if needed.
 */
export function mapWooProduct(wooProduct, wooVariations = [], weightUnit = 'kg') {
  const product = {
    title: wooProduct.name || '',
    slug: wooProduct.slug || '',
    description_html: wooProduct.description || '',
    short_description: wooProduct.short_description || '',
    vendor: extractVendor(wooProduct),
    product_type: extractProductType(wooProduct),
    tags: (wooProduct.tags || []).map((t) => t.name),
    status: wooProduct.status === 'publish' ? 'active' : 'draft',
    seo: extractSeo(wooProduct),
    images: mapImages(wooProduct.images || []),
    options: [],
    variants: [],
    metafields: mapMetafields(wooProduct.meta_data || []),
    collections: (wooProduct.categories || []).map((c) => c.name),
  };

  if (wooProduct.type === 'variable' && wooVariations.length > 0) {
    product.options = mapOptions(wooProduct.attributes || []);
    product.variants = wooVariations.map((v) => mapVariation(v, weightUnit));
  } else {
    // Simple product — single variant, no options
    product.variants = [mapSimpleVariant(wooProduct, weightUnit)];
  }

  return product;
}

// --- Helpers ---

function extractVendor(wooProduct) {
  // Check attributes for "Brand" or "Vendor"
  for (const attr of wooProduct.attributes || []) {
    if (/^(brand|vendor)$/i.test(attr.name)) {
      return attr.options?.[0] || '';
    }
  }
  // Check meta_data for common brand plugins
  for (const meta of wooProduct.meta_data || []) {
    if (/^(_brand|brand|vendor)$/i.test(meta.key)) {
      return String(meta.value);
    }
  }
  return '';
}

function extractProductType(wooProduct) {
  const categories = wooProduct.categories || [];
  // Use the last (deepest/most specific) category as product_type
  return categories.length > 0 ? categories[categories.length - 1].name : '';
}

function extractSeo(wooProduct) {
  const seo = { title: '', description: '' };
  const meta = wooProduct.meta_data || [];

  // Yoast SEO
  const yoastTitle = meta.find((m) => m.key === '_yoast_wpseo_title');
  const yoastDesc = meta.find((m) => m.key === '_yoast_wpseo_metadesc');
  if (yoastTitle) seo.title = String(yoastTitle.value);
  if (yoastDesc) seo.description = String(yoastDesc.value);

  // Rank Math (overrides Yoast if present)
  const rmTitle = meta.find((m) => m.key === 'rank_math_title');
  const rmDesc = meta.find((m) => m.key === 'rank_math_description');
  if (rmTitle) seo.title = String(rmTitle.value);
  if (rmDesc) seo.description = String(rmDesc.value);

  // Fallback: use product name / short_description
  if (!seo.title) seo.title = wooProduct.name || '';
  if (!seo.description) seo.description = stripHtml(wooProduct.short_description || '');

  return seo;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

function mapImages(wooImages) {
  return wooImages.map((img) => ({
    src: img.src || '',
    alt: img.alt || '',
  }));
}

function mapOptions(attributes) {
  // Only variation attributes become options
  return attributes
    .filter((attr) => attr.variation)
    .map((attr) => ({
      name: attr.name,
      values: attr.options || [],
    }));
}

function mapVariation(variation, weightUnit) {
  const optionValues = {};
  for (const attr of variation.attributes || []) {
    optionValues[attr.name] = attr.option;
  }

  const hasDiscount =
    variation.sale_price &&
    variation.regular_price &&
    variation.sale_price !== variation.regular_price;

  return {
    sku: variation.sku || '',
    barcode: '',
    price: variation.sale_price || variation.price || variation.regular_price || '0',
    compare_at_price: hasDiscount ? variation.regular_price : '',
    weight: parseFloat(variation.weight) || 0,
    weight_unit: weightUnit,
    inventory_quantity: variation.stock_quantity ?? 0,
    inventory_policy: variation.backorders === 'no' ? 'deny' : 'continue',
    inventory_management: variation.manage_stock ? 'shopify' : null,
    option_values: optionValues,
    image_src: variation.image?.src || '',
  };
}

function mapSimpleVariant(wooProduct, weightUnit) {
  const hasDiscount =
    wooProduct.sale_price &&
    wooProduct.regular_price &&
    wooProduct.sale_price !== wooProduct.regular_price;

  return {
    sku: wooProduct.sku || '',
    barcode: '',
    price: wooProduct.sale_price || wooProduct.price || wooProduct.regular_price || '0',
    compare_at_price: hasDiscount ? wooProduct.regular_price : '',
    weight: parseFloat(wooProduct.weight) || 0,
    weight_unit: weightUnit,
    inventory_quantity: wooProduct.stock_quantity ?? 0,
    inventory_policy: wooProduct.backorders === 'no' ? 'deny' : 'continue',
    inventory_management: wooProduct.manage_stock ? 'shopify' : null,
    option_values: {},
    image_src: '',
  };
}

function mapMetafields(metaData) {
  // Skip internal WooCommerce/WordPress meta (keys starting with _)
  // and known non-useful keys
  const skipKeys = new Set([
    'rank_math_title',
    'rank_math_description',
    '_yoast_wpseo_title',
    '_yoast_wpseo_metadesc',
  ]);

  return metaData
    .filter((m) => !m.key.startsWith('_') && !skipKeys.has(m.key))
    .filter((m) => m.value !== '' && m.value !== null && m.value !== undefined)
    .map((m) => ({
      namespace: 'woocommerce',
      key: m.key.replace(/[^a-zA-Z0-9_]/g, '_'),
      value: typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value),
      type: guessMetafieldType(m.value),
    }));
}

function guessMetafieldType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isInteger(value)) return 'number_integer';
  if (typeof value === 'number') return 'number_decimal';
  if (typeof value === 'object') return 'json';
  const str = String(value);
  if (str === 'true' || str === 'false') return 'boolean';
  if (/^\d+$/.test(str)) return 'number_integer';
  if (str.includes('\n')) return 'multi_line_text_field';
  return 'single_line_text_field';
}
