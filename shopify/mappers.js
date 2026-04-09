/**
 * Map internal JSON model → Shopify REST API product payload.
 * Collections and metafields are handled separately by the importer.
 */
export function mapProductToShopify(product) {
  const options = (product.options || []).map((opt, i) => ({
    name: opt.name,
    position: i + 1,
    values: opt.values,
  }));

  const imagesBySource = new Map();
  const images = (product.images || []).map((img, i) => {
    const mapped = { src: img.src, position: i + 1 };
    if (img.alt) mapped.alt = img.alt;
    imagesBySource.set(img.src, i + 1);
    return mapped;
  });

  const variants = (product.variants || []).map((v) => {
    const mapped = {
      sku: v.sku || '',
      barcode: v.barcode || '',
      price: v.price,
      compare_at_price: v.compare_at_price || null,
      weight: v.weight,
      weight_unit: v.weight_unit,
      inventory_quantity: v.inventory_quantity,
      inventory_policy: v.inventory_policy || 'deny',
      inventory_management: v.inventory_management ?? 'shopify',
    };

    // Map option_values to option1/option2/option3 by options array order
    if (v.option_values) {
      (product.options || []).forEach((opt, i) => {
        mapped[`option${i + 1}`] = v.option_values[opt.name] || '';
      });
    }

    // Tie variant to an image by matching src
    if (v.image_src && imagesBySource.has(v.image_src)) {
      mapped.image_id = null; // placeholder — Shopify assigns IDs on create
      // We attach image position so we can link after product creation if needed
      mapped._image_position = imagesBySource.get(v.image_src);
    }

    return mapped;
  });

  const payload = {
    product: {
      title: product.title,
      body_html: product.description_html || '',
      vendor: product.vendor || '',
      product_type: product.product_type || '',
      tags: (product.tags || []).join(', '),
      status: product.status || 'draft',
      handle: product.slug || undefined,
      options,
      variants,
      images,
    },
  };

  // SEO
  if (product.seo) {
    if (product.seo.title) payload.product.metafields_global_title_tag = product.seo.title;
    if (product.seo.description) payload.product.metafields_global_description_tag = product.seo.description;
  }

  return payload;
}

/**
 * After product creation, link variant images by matching position.
 * Shopify assigns image IDs on creation — this function patches variant.image_id.
 */
export function linkVariantImages(createdProduct, variants) {
  const imagesByPosition = new Map();
  for (const img of createdProduct.images || []) {
    imagesByPosition.set(img.position, img.id);
  }

  const updates = [];
  for (let i = 0; i < variants.length; i++) {
    const mapped = variants[i];
    if (mapped._image_position && imagesByPosition.has(mapped._image_position)) {
      updates.push({
        variantId: createdProduct.variants[i].id,
        imageId: imagesByPosition.get(mapped._image_position),
      });
    }
  }
  return updates;
}
