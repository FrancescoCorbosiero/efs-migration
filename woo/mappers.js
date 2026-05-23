/**
 * Map a WooCommerce product (+ its fetched variations) to the internal JSON model.
 *
 * WooCommerce taxonomy mapping:
 *   - brand        → vendor (priority: WC Brands → attribute → meta_data)
 *   - categories   → collections (deduped, generics filtered) + product_type (deepest)
 *   - tags         → tags
 *   - attributes   → options (for variable products)
 *
 * Note: Shopify's standardized product taxonomy (product_category) uses predefined
 * Shopify taxonomy IDs with no 1:1 mapping from WooCommerce. That classification
 * is a separate post-migration step if needed.
 */
export function mapWooProduct(wooProduct, wooVariations = [], options = {}) {
  const {
    weightUnit = 'kg',
    categoryMap = null,
    shopName = '',
  } = options;

  const taxonomy = resolveTaxonomy(wooProduct, categoryMap, shopName);

  const product = {
    title: wooProduct.name || '',
    slug: wooProduct.slug || '',
    description_html: wooProduct.description || '',
    short_description: wooProduct.short_description || '',
    vendor: extractVendor(wooProduct, shopName, taxonomy.brandFromCategory),
    product_type: taxonomy.productType,
    tags: (wooProduct.tags || []).map((t) => t.name),
    status: wooProduct.status === 'publish' ? 'active' : 'draft',
    seo: extractSeo(wooProduct),
    images: mapImages(wooProduct.images || []),
    options: [],
    variants: [],
    metafields: mapMetafields(wooProduct.meta_data || []),
    collections: taxonomy.collections,
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

// --- Brand / vendor ---

// Attribute names (and slugs) that commonly hold the manufacturer/brand.
// Covers English plus the most common European translations and the
// WooCommerce attribute slug prefix (`pa_`).
const BRAND_ATTR_PATTERNS = [
  /^brand$/i,
  /^brands$/i,
  /^vendor$/i,
  /^manufacturer$/i,
  /^marca$/i,         // it/es/pt
  /^marque$/i,        // fr
  /^marke$/i,         // de
  /^hersteller$/i,    // de (manufacturer)
  /^produttore$/i,    // it (manufacturer)
  /^fabricante$/i,    // es/pt
  /^fabricant$/i,     // fr
  /^pa_brand$/i,
  /^pa_brands$/i,
  /^pa_marca$/i,
  /^pa_manufacturer$/i,
];

// meta_data keys used by common WooCommerce brand plugins, plus the
// generic conventions. Leading "_" (WC private meta) is optional.
const BRAND_META_PATTERNS = [
  /^_?brand$/i,
  /^_?product_brand$/i,
  /^_?vendor$/i,
  /^_?manufacturer$/i,
  /^_?marca$/i,
  /^_?pwb_brand/i,      // Perfect Brands for WooCommerce
  /^_?yith_brand/i,     // YITH WooCommerce Brands
  /^_?wpc_brand/i,      // WPClever Brands
];

function extractVendor(wooProduct, shopName, brandFromCategory = '') {
  const clean = (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    if (shopName && trimmed.toLowerCase() === shopName.toLowerCase()) return null;
    return trimmed;
  };

  // 1. WC Brands (merged into WooCommerce core in 9.4+). Product objects
  //    include a `brands` array shaped like categories/tags.
  for (const b of wooProduct.brands || []) {
    const v = clean(b?.name);
    if (v) return v;
  }

  // 2. Category-as-brand: many WooCommerce stores model brands as child
  //    categories under a "Marche"/"Brands"/"Marcas" parent (URL pattern
  //    /product-category/marche/<brand>/). Resolved upstream in
  //    resolveTaxonomy() using the category hierarchy map.
  const fromCategory = clean(brandFromCategory);
  if (fromCategory) return fromCategory;

  // 3. Product attributes — broadened name + slug matching.
  for (const attr of wooProduct.attributes || []) {
    if (!isBrandAttribute(attr)) continue;
    for (const option of attr.options || []) {
      const v = clean(option);
      if (v) return v;
    }
  }

  // 4. meta_data — covers third-party brand plugins.
  for (const meta of wooProduct.meta_data || []) {
    if (!isBrandMeta(meta)) continue;
    const v = clean(meta.value);
    if (v) return v;
  }

  return '';
}

function isBrandAttribute(attr) {
  const candidates = [attr?.name, attr?.slug].filter(Boolean);
  return candidates.some((c) =>
    BRAND_ATTR_PATTERNS.some((re) => re.test(c))
  );
}

function isBrandMeta(meta) {
  if (!meta?.key) return false;
  return BRAND_META_PATTERNS.some((re) => re.test(meta.key));
}

// --- Taxonomy: collections + product_type ---

// Categories that exist in nearly every WooCommerce store but carry no
// merchandising meaning — they shouldn't become Shopify collections and
// shouldn't win the product_type lottery.
const GENERIC_CATEGORY_NAMES = new Set([
  'uncategorized',
  'uncategorised',
  'senza categoria',     // it
  'sin categoría',       // es
  'sans catégorie',      // fr
  'nicht kategorisiert', // de
  'general',
  'all',
  'all products',
  'shop',
  'home',
  'featured',
]);

function isGenericCategory(name) {
  if (!name) return true;
  return GENERIC_CATEGORY_NAMES.has(String(name).trim().toLowerCase());
}

// Parent categories whose children represent brands rather than product
// types. Match by slug or name in any of the common languages. Stores
// using this pattern have URLs like /product-category/marche/<brand>/.
const BRAND_PARENT_TOKENS = new Set([
  'marche', 'marca',         // it
  'brands', 'brand',         // en
  'marcas',                  // es/pt
  'marques', 'marque',       // fr
  'marken', 'marke',         // de
  'manufacturers', 'manufacturer',
]);

function isBrandParentCategory(node) {
  if (!node) return false;
  const slug = String(node.slug || '').trim().toLowerCase();
  const name = String(node.name || '').trim().toLowerCase();
  return BRAND_PARENT_TOKENS.has(slug) || BRAND_PARENT_TOKENS.has(name);
}

// Walks the parent chain for a given category id. Returns true if any
// ancestor is a brand-parent. The category itself does not count — only
// its ancestors — so the parent ("Marche") is not treated as a brand.
function isUnderBrandParent(catId, categoryMap) {
  if (!categoryMap) return false;
  const start = categoryMap.get(catId);
  if (!start) return false;
  let cur = start;
  const visited = new Set();
  while (cur.parent && categoryMap.has(cur.parent) && !visited.has(cur.id)) {
    visited.add(cur.id);
    const parent = categoryMap.get(cur.parent);
    if (isBrandParentCategory(parent)) return true;
    cur = parent;
  }
  return false;
}

function resolveTaxonomy(wooProduct, categoryMap, shopName = '') {
  const raw = (wooProduct.categories || []).filter(
    (c) => !isGenericCategory(c.name)
  );

  // First pass: separate brand-tree categories from product-type categories.
  // Brand-tree includes the brand-parent itself ("Marche") and its
  // descendants (e.g. "Anaconda"). The deepest descendant wins as brand,
  // so /Marche/European/Anaconda picks "Anaconda" rather than "European".
  let brandName = '';
  let brandDepth = -1;
  const productCategories = [];

  for (const c of raw) {
    const node = categoryMap ? categoryMap.get(c.id) : null;

    if (node && isBrandParentCategory(node)) {
      // The brand-parent itself ("Marche") — drop it entirely.
      continue;
    }

    if (node && isUnderBrandParent(c.id, categoryMap)) {
      const candidate = c.name?.trim() || '';
      const depth = node.depth ?? 0;
      const isShop =
        shopName && candidate.toLowerCase() === shopName.toLowerCase();
      if (candidate && !isShop && depth > brandDepth) {
        brandName = candidate;
        brandDepth = depth;
      }
      continue;
    }

    productCategories.push(c);
  }

  // Collections: dedupe by name, preserve first-seen order.
  const seen = new Set();
  const collections = [];
  for (const c of productCategories) {
    const name = c.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    collections.push(name);
  }

  // product_type: prefer the deepest category by hierarchy depth. Without
  // a category map we can only fall back to the array's last entry (the
  // WooCommerce API does not guarantee hierarchical order, so this is a
  // best-effort fallback).
  let productType = '';
  if (productCategories.length > 0) {
    if (categoryMap) {
      const ranked = productCategories
        .map((c) => ({
          name: c.name,
          depth: categoryMap.get(c.id)?.depth ?? 0,
        }))
        .sort((a, b) => b.depth - a.depth);
      productType = ranked[0]?.name || '';
    } else {
      productType = productCategories[productCategories.length - 1].name;
    }
  }

  return { productType, collections, brandFromCategory: brandName };
}

// --- SEO ---

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

// --- Images / options / variants ---

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

// --- Metafields ---

function mapMetafields(metaData) {
  // Only export meta keys that look like real product data.
  // WooCommerce meta_data is full of plugin junk (OptinMonster, UUID-keyed
  // entries, campaign toggles, etc.) — none of it is useful in Shopify.
  // Add meaningful keys here if your catalog has custom product fields.
  const allowKeys = new Set([
    // Example: 'fabric_composition', 'country_of_origin'
  ]);

  if (allowKeys.size === 0) return [];

  return metaData
    .filter((m) => allowKeys.has(m.key))
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
