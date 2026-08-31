import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

if (process.env.WORKERS_CI !== '1') process.exit(0);

const databaseName = process.env.D1_DATABASE_NAME || 'trend-radar-db';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

let raw;
try {
  raw = execFileSync(npx, ['wrangler', 'd1', 'info', databaseName, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch {
  console.error(
    `[cloudflare-config] Existing D1 database "${databaseName}" could not be read. ` +
      'No database will be created. Check the database name and Workers Builds API-token permissions.'
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

// The Worker wakes every minute, but src/settings.ts decides whether a real collection run is due.
// This lets the user change the actual interval from /admin without editing Cloudflare settings.
const toml = `name = "x-ranking"\nmain = "src/index.ts"\ncompatibility_date = "2026-01-01"\nkeep_vars = true\n\n[triggers]\ncrons = ["* * * * *"]\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${databaseName.replaceAll('"', '\\"')}"\ndatabase_id = "${databaseId}"\n`;

writeFileSync('wrangler.toml', toml, 'utf8');
console.log(
  `[cloudflare-config] Using existing D1 "${databaseName}" (${databaseId}); ` +
    'base Cron is every minute; app-level schedule is controlled from /admin.'
);
