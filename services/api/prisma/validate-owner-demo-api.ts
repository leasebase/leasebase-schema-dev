/**
 * validate-owner-demo-api.ts — HTTP-level validation of the Owner demo.
 *
 * Calls the same 7 endpoints that ownerDashboardService.ts uses, plus
 * the demo-login shortcut, using dev-bypass headers. Verifies that each
 * domain returns populated data through the actual NestJS API stack.
 *
 * Prerequisites:
 *   1. API server running with DEV_AUTH_BYPASS=true
 *   2. Demo data seeded: ALLOW_DEMO_RESET=true npm run seed:demo-owner
 *
 * Usage:
 *   npx ts-node --project tsconfig.json prisma/validate-owner-demo-api.ts [base-url]
 *
 * Default base-url: http://localhost:4000
 */

const BASE = process.argv[2] || 'http://localhost:4000';

const DEMO_ORG_ID = 'demo-owner-org';
const DEMO_EMAIL = 'owner@demo.leasebase.local';
const DEMO_ROLE = 'OWNER';

interface DomainCheck {
  domain: string;
  endpoint: string;
  ok: boolean;
  count: number;
  status: number;
  error: string | null;
}

const devHeaders: Record<string, string> = {
  'x-dev-user-email': DEMO_EMAIL,
  'x-dev-user-role': DEMO_ROLE,
  'x-dev-org-id': DEMO_ORG_ID,
};

async function fetchDomain(
  path: string,
  domain: string,
): Promise<DomainCheck> {
  const url = `${BASE}/api/${path}`;
  try {
    const res = await fetch(url, { headers: devHeaders });
    if (!res.ok) {
      return {
        domain,
        endpoint: `GET /api/${path}`,
        ok: false,
        count: 0,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
    const body = await res.json() as { data?: unknown[]; meta?: { total?: number } };
    const count = body?.meta?.total ?? body?.data?.length ?? 0;
    return {
      domain,
      endpoint: `GET /api/${path}`,
      ok: count > 0,
      count,
      status: res.status,
      error: count === 0 ? 'Empty data' : null,
    };
  } catch (e: any) {
    return {
      domain,
      endpoint: `GET /api/${path}`,
      ok: false,
      count: 0,
      status: 0,
      error: e?.message || 'Network error',
    };
  }
}

async function main(): Promise<void> {
  const log = (msg: string) => console.log(msg); // eslint-disable-line no-console

  log(`\n  Validating against: ${BASE}`);
  log('  Using dev-bypass headers for demo org\n');

  // 0. Demo login endpoint
  let demoLoginOk = false;
  try {
    const res = await fetch(`${BASE}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'OWNER' }),
    });
    if (res.ok) {
      const user = await res.json() as { id?: string; email?: string; role?: string };
      demoLoginOk = !!user?.id;
      log(`  ✓  demo-login      POST /api/auth/demo-login        → ${user?.email} (${user?.role})`);
    } else {
      log(`  ✗  demo-login      POST /api/auth/demo-login        → HTTP ${res.status}`);
    }
  } catch (e: any) {
    log(`  ✗  demo-login      POST /api/auth/demo-login        → ${e?.message}`);
  }

  // 1. First fetch properties to get IDs for the units fan-out
  const propsCheck = await fetchDomain('properties?limit=100&page=1', 'properties');
  const checks: DomainCheck[] = [propsCheck];

  // 2. Units — fan out to the first property
  let unitsCheck: DomainCheck;
  if (propsCheck.ok) {
    // Re-fetch to get actual data for property IDs
    const propsRes = await fetch(`${BASE}/api/properties?limit=1&page=1`, { headers: devHeaders });
    const propsBody = await propsRes.json() as { data?: Array<{ id: string }> };
    const firstPropId = propsBody?.data?.[0]?.id;
    if (firstPropId) {
      unitsCheck = await fetchDomain(`properties/${firstPropId}/units?limit=100&page=1`, 'units');
    } else {
      unitsCheck = { domain: 'units', endpoint: 'GET /api/properties/:id/units', ok: false, count: 0, status: 0, error: 'No property ID' };
    }
  } else {
    unitsCheck = { domain: 'units', endpoint: 'GET /api/properties/:id/units', ok: false, count: 0, status: 0, error: 'Properties unavailable' };
  }
  checks.push(unitsCheck);

  // 3-7. Remaining domains
  checks.push(await fetchDomain('leases?limit=100&page=1', 'leases'));
  checks.push(await fetchDomain('payments?limit=100&page=1', 'payments'));
  checks.push(await fetchDomain('payments/ledger?limit=100&page=1', 'ledger'));
  checks.push(await fetchDomain('maintenance?limit=100&page=1', 'maintenance'));
  checks.push(await fetchDomain('documents?limit=100&page=1', 'documents'));

  // Report
  log('══════════════════════════════════════════════════════════════════');
  log('  OWNER DEMO — API-LEVEL VALIDATION');
  log('══════════════════════════════════════════════════════════════════');

  let allOk = demoLoginOk;
  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗';
    const detail = c.ok
      ? `${c.count} rows (HTTP ${c.status})`
      : c.error || 'Unknown error';
    log(`  ${icon}  ${c.domain.padEnd(14)} ${c.endpoint.padEnd(44)} ${detail}`);
    if (!c.ok) allOk = false;
  }

  log('──────────────────────────────────────────────────────────────────');
  if (allOk) {
    log('  ✓ ALL ENDPOINTS RETURN DATA — Owner dashboard is fully functional.');
  } else {
    log('  ✗ SOME ENDPOINTS FAILED — see ✗ marks above.');
  }
  log('══════════════════════════════════════════════════════════════════\n');

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e); // eslint-disable-line no-console
  process.exit(1);
});
