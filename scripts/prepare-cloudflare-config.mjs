import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Cloudflare Workers Builds injects WORKERS_CI=1. Do nothing on a normal
// developer machine so `npm install` never writes account-specific IDs.
if (process.env.WORKERS_CI !== '1') {
  process.exit(0);
}

const databaseName = process.env.D1_DATABASE_NAME || 'trend-radar-db';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let raw;
try {
  raw = execFileSync(
    npx,
    ['wrangler', 'd1', 'info', databaseName, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch {
  console.error(
    `[cloudflare-config] Existing D1 database "${databaseName}" could not be read. ` +
      'No database will be created. Check the database name and Workers Builds API-token permissions.',
  );
  process.exit(1);
}

let info;
try {
  info = JSON.parse(raw);
} catch {
  console.error('[cloudflare-config] Wrangler returned invalid JSON for D1 info. Refusing to deploy.');
  process.exit(1);
}

const databaseId = info.uuid || info.database_id || info.id;
if (!databaseId) {
  console.error(`[cloudflare-config] D1 "${databaseName}" has no UUID in Wrangler output. Refusing to deploy.`);
  process.exit(1);
}

const toml = `name = "x-ranking"\nmain = "src/index.ts"\ncompatibility_date = "2026-01-01"\nkeep_vars = true\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${databaseName.replaceAll('"', '\\"')}"\ndatabase_id = "${databaseId}"\n`;

// Workers Builds uses an ephemeral checkout. The real UUID is written only
// here and is never committed back to GitHub.
writeFileSync('wrangler.toml', toml, 'utf8');
console.log(`[cloudflare-config] Using existing D1 "${databaseName}" (${databaseId}); auto-provisioning is not used.`);
