// Public barrel for the Shopify menu manager module.
//
// Required Admin API access scopes:
//   read_online_store_navigation
//   write_online_store_navigation
//
// At first use the module logs a warning if the Shopify token does not
// appear to grant these scopes (best-effort — Shopify does not expose a
// dedicated "current scopes" endpoint to all apps).

import { graphqlRequest } from '../client.js';

export {
  QUERY_LIST_MENUS,
  MUTATION_CREATE_MENU,
  MUTATION_UPDATE_MENU,
  MUTATION_DELETE_MENU,
} from './graphql.js';

export {
  listMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  findMenuByHandle,
} from './api.js';

export { validateMenuInput } from './validate.js';
export { syncMenus, deleteMenuByHandle, exportMenus } from './sync.js';

/**
 * The default GraphQL transport: the existing client.js helper, which
 * already handles OAuth, token caching, the 2 req/s leaky bucket, 401
 * refresh, and 429 Retry-After backoff.
 */
export const defaultClient = graphqlRequest;

let scopeWarningLogged = false;

/**
 * Best-effort scope check. Calls `listMenus` once; if the call fails with
 * an "access denied" / "not approved" style error, logs a clear warning
 * pointing the operator at the required scopes. Otherwise no-ops.
 *
 * Safe to call multiple times — only logs once per process.
 *
 * @param {Function} [client]  optional custom GraphQL transport
 */
export async function verifyMenuScopes(client = graphqlRequest) {
  if (scopeWarningLogged) return;
  try {
    // Tiny probe — listMenus is a read, so it only needs read_online_store_navigation.
    const { listMenus } = await import('./api.js');
    await listMenus(client);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (/access denied|not approved|scope|unauthorized|403/i.test(msg)) {
      scopeWarningLogged = true;
      console.warn(
        '[menu-manager] WARNING: could not verify Shopify navigation scopes. ' +
          'Make sure the Admin API access token has BOTH:\n' +
          '  - read_online_store_navigation\n' +
          '  - write_online_store_navigation\n' +
          `Underlying error: ${msg}`
      );
    }
    // Re-throw so callers still see real failures.
    throw err;
  }
}
