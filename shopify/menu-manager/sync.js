// High-level sync orchestration: upsert menus by handle, never abort the
// whole batch on a single failure, log a readable summary at the end.

import {
  listMenus,
  findMenuByHandle,
  createMenu,
  updateMenu,
  deleteMenu,
} from './api.js';

/**
 * @typedef {Object} SyncSummary
 * @property {Array<{ handle: string, id: string, title: string }>} created
 * @property {Array<{ handle: string, id: string, title: string }>} updated
 * @property {Array<{ handle: string, error: string }>} failed
 * @property {Array<{ handle: string, reason: string }>} skipped
 */

/**
 * Upsert each menu in the input array.
 * Never aborts the full run when one menu fails.
 *
 * @param {Function} client  graphql transport fn
 * @param {Array} menus      validated menu input
 * @returns {Promise<SyncSummary>}
 */
export async function syncMenus(client, menus) {
  /** @type {SyncSummary} */
  const summary = { created: [], updated: [], failed: [], skipped: [] };

  for (const menu of menus) {
    const handle = menu && menu.handle;
    try {
      const existing = await findMenuByHandle(client, handle);

      if (existing) {
        const updated = await updateMenu(client, existing.id, menu);
        console.log(`[menu-manager] Updated:  ${handle}`);
        summary.updated.push({
          handle: updated.handle,
          id: updated.id,
          title: updated.title,
        });
      } else {
        const created = await createMenu(client, menu);
        console.log(`[menu-manager] Created:  ${handle}`);
        summary.created.push({
          handle: created.handle,
          id: created.id,
          title: created.title,
        });
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.log(`[menu-manager] Failed:   ${handle} - ${message}`);
      summary.failed.push({ handle, error: message });
    }
  }

  logSummary(summary);
  return summary;
}

/**
 * Delete a menu by handle. Refuses to delete default menus.
 *
 * @param {Function} client
 * @param {string} handle
 * @returns {Promise<{ deleted: boolean, deletedMenuId?: string, reason?: string }>}
 */
export async function deleteMenuByHandle(client, handle) {
  const existing = await findMenuByHandle(client, handle);
  if (!existing) {
    console.log(`[menu-manager] Skipped:  ${handle} - not found`);
    return { deleted: false, reason: 'not found' };
  }
  if (existing.isDefault) {
    console.log(
      `[menu-manager] Skipped:  ${handle} - refusing to delete a default menu`
    );
    return { deleted: false, reason: 'default menu, refused' };
  }
  const deletedMenuId = await deleteMenu(client, existing.id);
  console.log(`[menu-manager] Deleted:  ${handle}`);
  return { deleted: true, deletedMenuId };
}

/**
 * Convert the result of `listMenus` into the same shape the input accepts,
 * so it can be re-imported / round-tripped.
 * @param {Function} client
 */
export async function exportMenus(client) {
  const menus = await listMenus(client);
  return menus.map((m) => ({
    title: m.title,
    handle: m.handle,
    items: stripIds(m.items || []),
  }));
}

function stripIds(items) {
  return items.map((it) => {
    const out = { title: it.title, type: it.type };
    if (it.url) out.url = it.url;
    if (it.resourceId) out.resourceId = it.resourceId;
    out.items = Array.isArray(it.items) ? stripIds(it.items) : [];
    return out;
  });
}

function logSummary(summary) {
  console.log('\n[menu-manager] Sync summary:');
  // console.table works for arrays-of-objects and is built into Node.
  const rows = [
    { result: 'created', count: summary.created.length },
    { result: 'updated', count: summary.updated.length },
    { result: 'failed',  count: summary.failed.length  },
    { result: 'skipped', count: summary.skipped.length },
  ];
  // eslint-disable-next-line no-console
  console.table(rows);

  if (summary.failed.length > 0) {
    console.log('[menu-manager] Failures:');
    for (const f of summary.failed) {
      console.log(`  - ${f.handle}: ${f.error}`);
    }
  }
}
