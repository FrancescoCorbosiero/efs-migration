// CLI entry point for the Shopify menu manager.
//
// Mirrors the conventions of import.js / export.js: validates env, parses
// argv, calls into the module, prints a readable summary, exits non-zero
// on failure.
//
// Usage:
//   node menu-manager.js sync   <file.json>           # upsert all menus in file
//   node menu-manager.js export [out.json]            # dump all menus to file
//                                                       (default: menus.json)
//   node menu-manager.js delete <handle>              # delete one menu
//   node menu-manager.js list                         # print menus to stdout

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import config from './config.js';
import {
  defaultClient,
  validateMenuInput,
  syncMenus,
  deleteMenuByHandle,
  exportMenus,
  listMenus,
} from './shopify/menu-manager/index.js';

config.validateShopify();

const [, , command, ...rest] = process.argv;

if (!command) {
  printUsageAndExit();
}

console.log(`\n🧭 Shopify Menu Manager — ${command}\n`);

try {
  switch (command) {
    case 'sync': {
      const file = rest[0];
      if (!file) {
        console.error('Error: `sync` requires a path to a menus JSON file.');
        printUsageAndExit(1);
      }
      const filePath = resolve(file);
      const raw = await readFile(filePath, 'utf-8');
      const menus = JSON.parse(raw);
      validateMenuInput(menus);
      const summary = await syncMenus(defaultClient, menus);
      const exitCode = summary.failed.length > 0 ? 1 : 0;
      process.exit(exitCode);
      break;
    }

    case 'export': {
      const out = resolve(rest[0] || 'menus.json');
      const menus = await exportMenus(defaultClient);
      await writeFile(out, JSON.stringify(menus, null, 2), 'utf-8');
      console.log(`[menu-manager] Exported ${menus.length} menu(s) → ${out}`);
      break;
    }

    case 'delete': {
      const handle = rest[0];
      if (!handle) {
        console.error('Error: `delete` requires a menu handle.');
        printUsageAndExit(1);
      }
      const result = await deleteMenuByHandle(defaultClient, handle);
      if (!result.deleted) {
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const menus = await listMenus(defaultClient);
      console.log(JSON.stringify(menus, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsageAndExit(1);
  }
} catch (err) {
  console.error(`\n❌ menu-manager failed: ${err.message}`);
  if (err.cause) console.error(`   Cause: ${err.cause}`);
  process.exit(1);
}

function printUsageAndExit(code = 0) {
  console.log(
    [
      'Usage:',
      '  node menu-manager.js sync   <file.json>     Upsert all menus from a JSON file',
      '  node menu-manager.js export [out.json]      Dump all menus (default: menus.json)',
      '  node menu-manager.js delete <handle>        Delete one menu by handle',
      '  node menu-manager.js list                   Print all menus as JSON',
    ].join('\n')
  );
  process.exit(code);
}
