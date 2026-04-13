// Thin wrappers around the Shopify GraphQL Admin API for menu CRUD.
//
// Each function takes the GraphQL transport function as its first parameter
// (rather than importing it directly) so the module is easy to test and so
// callers can swap in the existing `graphqlRequest` from `shopify/client.js`.
//
// Every mutation checks `userErrors`; on rate-limit / throttle the call is
// retried up to 3 times with a 1s delay before giving up.

import {
  QUERY_LIST_MENUS,
  MUTATION_CREATE_MENU,
  MUTATION_UPDATE_MENU,
  MUTATION_DELETE_MENU,
} from './graphql.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a GraphQL call with retry on throttle / 429.
 * @param {(query: string, variables?: object) => Promise<any>} client
 * @param {string} label  human-readable label used in logs / errors
 * @param {string} query
 * @param {object} variables
 */
async function callWithRetry(client, label, query, variables) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await client(query, variables);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);
      const isThrottle =
        (err && err.throttled) ||
        msg.includes('throttled') ||
        msg.includes('THROTTLED') ||
        msg.includes('429');

      if (!isThrottle || attempt === MAX_RETRIES) break;

      console.log(
        `[menu-manager] Rate limited, retrying in 1s... (attempt ${attempt}/${MAX_RETRIES})`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error(
    `Shopify error on ${label}: ${lastErr && lastErr.message ? lastErr.message : lastErr}`
  );
}

/**
 * Throws if a mutation returned non-empty userErrors.
 * @param {string} mutationName
 * @param {{ field?: string[], message: string }[]} userErrors
 */
function assertNoUserErrors(mutationName, userErrors) {
  if (!userErrors || userErrors.length === 0) return;
  const first = userErrors[0];
  const field = Array.isArray(first.field) ? first.field.join('.') : (first.field || '');
  throw new Error(
    `Shopify error on ${mutationName}: ${field || '(no field)'} - ${first.message}`
  );
}

/**
 * Convert validated input items into the shape Shopify expects.
 * Shopify's MenuItemCreateInput / MenuItemUpdateInput share the same fields:
 *   { title, type, url?, resourceId?, items? }
 * @param {Array} items
 */
function toMenuItemsInput(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const out = { title: it.title, type: it.type };
    if (it.url !== undefined && it.url !== null && it.url !== '') {
      out.url = it.url;
    }
    if (it.resourceId !== undefined && it.resourceId !== null && it.resourceId !== '') {
      out.resourceId = it.resourceId;
    }
    if (Array.isArray(it.items) && it.items.length > 0) {
      out.items = toMenuItemsInput(it.items);
    } else {
      out.items = [];
    }
    return out;
  });
}

/**
 * @param {Function} client  graphql transport fn
 * @returns {Promise<Array>}  list of menu objects
 */
export async function listMenus(client) {
  const data = await callWithRetry(client, 'listMenus', QUERY_LIST_MENUS, {});
  const edges = (data && data.menus && data.menus.edges) || [];
  return edges.map((e) => e.node);
}

/**
 * @param {Function} client
 * @param {{ title: string, handle: string, items: Array }} menuInput
 */
export async function createMenu(client, menuInput) {
  const variables = {
    title: menuInput.title,
    handle: menuInput.handle,
    items: toMenuItemsInput(menuInput.items || []),
  };
  const data = await callWithRetry(
    client,
    'menuCreate',
    MUTATION_CREATE_MENU,
    variables
  );
  const payload = data && data.menuCreate;
  assertNoUserErrors('menuCreate', payload && payload.userErrors);
  return payload && payload.menu;
}

/**
 * @param {Function} client
 * @param {string} id  Shopify GID
 * @param {{ title: string, handle: string, items: Array }} menuInput
 */
export async function updateMenu(client, id, menuInput) {
  const variables = {
    id,
    title: menuInput.title,
    handle: menuInput.handle,
    items: toMenuItemsInput(menuInput.items || []),
  };
  const data = await callWithRetry(
    client,
    'menuUpdate',
    MUTATION_UPDATE_MENU,
    variables
  );
  const payload = data && data.menuUpdate;
  assertNoUserErrors('menuUpdate', payload && payload.userErrors);
  return payload && payload.menu;
}

/**
 * @param {Function} client
 * @param {string} id  Shopify GID
 */
export async function deleteMenu(client, id) {
  const data = await callWithRetry(
    client,
    'menuDelete',
    MUTATION_DELETE_MENU,
    { id }
  );
  const payload = data && data.menuDelete;
  assertNoUserErrors('menuDelete', payload && payload.userErrors);
  return payload && payload.deletedMenuId;
}

/**
 * @param {Function} client
 * @param {string} handle
 * @returns {Promise<object|null>}
 */
export async function findMenuByHandle(client, handle) {
  const menus = await listMenus(client);
  return menus.find((m) => m.handle === handle) || null;
}
