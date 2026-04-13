// Input validation for the menu manager.
// Throws descriptive Errors on hard failures; logs warnings on soft issues.

const SUPPORTED_TYPES = new Set([
  'HTTP',
  'COLLECTION',
  'PRODUCT',
  'PAGE',
  'BLOG',
  'FRONTPAGE',
  'CATALOG',
  'SHOP_POLICY',
]);

const MAX_DEPTH = 3;

/**
 * Validate a list of menus + their nested items.
 * Throws on the first hard failure.
 * @param {Array} menus
 */
export function validateMenuInput(menus) {
  if (!Array.isArray(menus)) {
    throw new Error('validateMenuInput: input must be an array of menu objects.');
  }

  menus.forEach((menu, mIdx) => {
    if (!menu || typeof menu !== 'object') {
      throw new Error(`Menu at index ${mIdx} must be an object.`);
    }
    if (!menu.title || typeof menu.title !== 'string') {
      throw new Error(`Menu at index ${mIdx} is missing required field "title".`);
    }
    if (!menu.handle || typeof menu.handle !== 'string') {
      throw new Error(`Menu "${menu.title}" is missing required field "handle".`);
    }
    if (menu.items !== undefined && !Array.isArray(menu.items)) {
      throw new Error(`Menu "${menu.handle}": "items" must be an array.`);
    }

    validateItems(menu.items || [], 1, `menu "${menu.handle}"`);
  });
}

/**
 * @param {Array} items
 * @param {number} depth   current nesting depth (root items = 1)
 * @param {string} path    human-readable path used in error messages
 */
function validateItems(items, depth, path) {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `${path}: nesting exceeds maximum depth of ${MAX_DEPTH} levels (Shopify hard limit).`
    );
  }

  items.forEach((item, idx) => {
    const here = `${path} > item[${idx}]`;
    if (!item || typeof item !== 'object') {
      throw new Error(`${here} must be an object.`);
    }
    if (!item.title || typeof item.title !== 'string') {
      throw new Error(`${here} is missing required field "title".`);
    }
    if (!item.type || typeof item.type !== 'string') {
      throw new Error(`${here} ("${item.title}") is missing required field "type".`);
    }
    if (!SUPPORTED_TYPES.has(item.type)) {
      throw new Error(
        `${here} ("${item.title}") has unsupported type "${item.type}". ` +
          `Supported: ${[...SUPPORTED_TYPES].join(', ')}.`
      );
    }

    if (item.type === 'HTTP') {
      if (!item.url || typeof item.url !== 'string') {
        throw new Error(
          `${here} ("${item.title}") is type HTTP but has no "url" field.`
        );
      }
      if (item.resourceId) {
        console.warn(
          `[menu-manager] Warning: ${here} ("${item.title}") is HTTP but also has a resourceId — it will be ignored.`
        );
      }
    } else {
      if (!item.resourceId || typeof item.resourceId !== 'string') {
        throw new Error(
          `${here} ("${item.title}") is type ${item.type} but has no "resourceId" field.`
        );
      }
    }

    if (item.items !== undefined) {
      if (!Array.isArray(item.items)) {
        throw new Error(`${here}: "items" must be an array.`);
      }
      if (item.items.length > 0) {
        validateItems(item.items, depth + 1, here);
      }
    }
  });
}
