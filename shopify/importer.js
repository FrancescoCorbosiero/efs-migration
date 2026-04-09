import { request } from './client.js';
import { mapProductToShopify, linkVariantImages } from './mappers.js';

/**
 * Import a single product from the internal JSON model into Shopify.
 * Returns a summary object.
 */
export async function importProduct(productJson) {
  // 1. Map and create the product
  const payload = mapProductToShopify(productJson);
  console.log(`[import] Creating product "${productJson.title}"…`);
  const { product } = await request('POST', '/products.json', payload);
  console.log(`[import] Product created: id=${product.id}, handle="${product.handle}"`);

  // Link variant images by position
  const variantImageUpdates = linkVariantImages(product, payload.product.variants);
  for (const { variantId, imageId } of variantImageUpdates) {
    await request('PUT', `/variants/${variantId}.json`, {
      variant: { id: variantId, image_id: imageId },
    });
  }
  if (variantImageUpdates.length > 0) {
    console.log(`[import] Linked ${variantImageUpdates.length} variant image(s).`);
  }

  // 2. Create metafields
  const metafields = productJson.metafields || [];
  for (const mf of metafields) {
    console.log(`[import] Creating metafield ${mf.namespace}.${mf.key}…`);
    await request('POST', `/products/${product.id}/metafields.json`, {
      metafield: {
        namespace: mf.namespace,
        key: mf.key,
        value: typeof mf.value === 'object' ? JSON.stringify(mf.value) : String(mf.value),
        type: mf.type,
      },
    });
  }
  if (metafields.length > 0) {
    console.log(`[import] Created ${metafields.length} metafield(s).`);
  }

  // 3. Handle collections
  const collections = productJson.collections || [];
  const collectionResults = [];
  for (const title of collections) {
    console.log(`[import] Processing collection "${title}"…`);

    // Check if collection exists
    const existing = await request(
      'GET',
      `/custom_collections.json?title=${encodeURIComponent(title)}`
    );

    let collectionId;
    const match = (existing.custom_collections || []).find(
      (c) => c.title === title
    );

    if (match) {
      collectionId = match.id;
      console.log(`[import]   Found existing collection id=${collectionId}`);
    } else {
      const created = await request('POST', '/custom_collections.json', {
        custom_collection: { title },
      });
      collectionId = created.custom_collection.id;
      console.log(`[import]   Created new collection id=${collectionId}`);
    }

    // Associate product with collection
    await request('POST', '/collects.json', {
      collect: {
        product_id: product.id,
        collection_id: collectionId,
      },
    });
    console.log(`[import]   Product added to collection "${title}".`);
    collectionResults.push({ title, id: collectionId });
  }

  // 4. Return summary
  return {
    shopify_id: product.id,
    handle: product.handle,
    title: product.title,
    variants_count: product.variants.length,
    metafields_count: metafields.length,
    collections: collectionResults,
  };
}
