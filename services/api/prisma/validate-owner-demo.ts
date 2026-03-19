/**
 * validate-owner-demo.ts — DB-level validation of the Owner demo seed.
 *
 * Queries every domain the OWNER dashboard depends on (as defined in
 * ownerDashboardService.ts) and reports whether each KPI domain is
 * populated. This is a Prisma-based script because the REST API
 * controllers for properties/leases/payments/maintenance/documents
 * have not been implemented yet (only modules + services exist).
 *
 * When those controllers land, this can be replaced with an HTTP-based
 * script hitting the same endpoints the frontend calls.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json prisma/validate-owner-demo.ts
 */

import 'dotenv/config';
import {
  LeaseStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  PaymentStatus,
  PrismaClient,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_SUBDOMAIN = 'owner-demo';

/* ─── Helpers ─── */

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function daysFromNow(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

interface DomainCheck {
  domain: string;
  endpoint: string;
  ok: boolean;
  count: number;
  details: string;
}

/* ─── Main ─── */

async function main(): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { subdomain: DEMO_SUBDOMAIN },
  });

  if (!org) {
    console.error(`[validate] No org with subdomain "${DEMO_SUBDOMAIN}" found. Run seed:owner-demo first.`);
    process.exit(1);
  }

  const orgId = org.id;
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const monthStart = new Date(curYear, curMonth, 1);
  const todayMidnight = new Date(curYear, curMonth, now.getDate(), 0, 0, 0);
  const thirtyOut = daysFromNow(30);
  const sixtyOut = daysFromNow(60);

  const checks: DomainCheck[] = [];

  // 1. Properties — GET api/properties
  const properties = await prisma.property.findMany({ where: { organizationId: orgId } });
  checks.push({
    domain: 'properties',
    endpoint: 'GET api/properties',
    ok: properties.length > 0,
    count: properties.length,
    details: `${properties.length} properties`,
  });

  // 2. Units — GET api/properties/:id/units (fan-out)
  const units = await prisma.unit.findMany({ where: { organizationId: orgId } });
  checks.push({
    domain: 'units',
    endpoint: 'GET api/properties/:id/units',
    ok: units.length > 0,
    count: units.length,
    details: `${units.length} units across ${properties.length} properties`,
  });

  // 3. Leases — GET api/leases
  const leases = await prisma.lease.findMany({ where: { organizationId: orgId } });
  const activeLeases = leases.filter((l) => l.status === LeaseStatus.ACTIVE);
  const expiredLeases = leases.filter((l) => l.status === LeaseStatus.EXPIRED);
  const draftLeases = leases.filter((l) => l.status === LeaseStatus.DRAFT);
  const expiring30 = activeLeases.filter((l) => l.endDate >= todayMidnight && l.endDate <= daysFromNow(30)).length;
  const expiring60 = activeLeases.filter((l) => l.endDate >= todayMidnight && l.endDate <= sixtyOut).length;
  const m2m = activeLeases.filter((l) => l.endDate < todayMidnight).length;
  checks.push({
    domain: 'leases',
    endpoint: 'GET api/leases',
    ok: activeLeases.length > 0,
    count: leases.length,
    details: `${activeLeases.length} active, ${expiredLeases.length} expired, ${draftLeases.length} draft | exp≤30d: ${expiring30}, exp≤60d: ${expiring60}, m2m: ${m2m}`,
  });

  // 4. Payments — GET api/payments
  const payments = await prisma.payment.findMany({ where: { organizationId: orgId } });
  const succeeded = payments.filter((p) => p.status === PaymentStatus.SUCCEEDED);
  const collectedThisMonth = succeeded
    .filter((p) => p.createdAt >= monthStart)
    .reduce((s, p) => s + p.amount, 0);
  checks.push({
    domain: 'payments',
    endpoint: 'GET api/payments',
    ok: succeeded.length > 0,
    count: payments.length,
    details: `${succeeded.length} succeeded, collected this month: ${fmt(collectedThisMonth)}`,
  });

  // 5. Ledger — GET api/payments/ledger
  const ledger = await prisma.ledgerEntry.findMany({ where: { organizationId: orgId } });
  const charges = ledger.filter((e) => e.type === LedgerEntryType.CHARGE);
  const pendingCharges = charges.filter((e) => e.status === LedgerEntryStatus.PENDING);
  const overdue = pendingCharges
    .filter((e) => e.dueDate < todayMidnight)
    .reduce((s, e) => s + e.amount, 0);
  const billedThisMonth = charges
    .filter((e) => {
      const d = e.dueDate;
      return d.getFullYear() === curYear && d.getMonth() === curMonth;
    })
    .reduce((s, e) => s + e.amount, 0);
  const upcoming = pendingCharges
    .filter((e) => e.dueDate >= todayMidnight && e.dueDate <= thirtyOut)
    .reduce((s, e) => s + e.amount, 0);
  checks.push({
    domain: 'ledger',
    endpoint: 'GET api/payments/ledger',
    ok: ledger.length > 0,
    count: ledger.length,
    details: `${charges.length} charges | billed this month: ${fmt(billedThisMonth)}, overdue: ${fmt(overdue)}, upcoming 30d: ${fmt(upcoming)}`,
  });

  // 6. Maintenance — GET api/maintenance
  const workOrders = await prisma.workOrder.findMany({ where: { organizationId: orgId } });
  const openWO = workOrders.filter((w) => w.status === WorkOrderStatus.OPEN || w.status === WorkOrderStatus.IN_PROGRESS);
  const urgentWO = openWO.filter((w) => w.priority === WorkOrderPriority.HIGH);
  checks.push({
    domain: 'maintenance',
    endpoint: 'GET api/maintenance',
    ok: workOrders.length > 0,
    count: workOrders.length,
    details: `${openWO.length} open/in-progress (${urgentWO.length} urgent), ${workOrders.length} total`,
  });

  // 7. Documents — GET api/documents
  const docs = await prisma.document.findMany({ where: { organizationId: orgId } });
  checks.push({
    domain: 'documents',
    endpoint: 'GET api/documents',
    ok: docs.length > 0,
    count: docs.length,
    details: `${docs.length} documents`,
  });

  // 8. Activity feed (composite: payments + maintenance + leases)
  const activityEvents = succeeded.length + workOrders.length;
  checks.push({
    domain: 'activity',
    endpoint: '(composite: payments + maintenance + leases)',
    ok: activityEvents > 20,
    count: activityEvents,
    details: `${succeeded.length} payment events + ${workOrders.length} maintenance events = ${activityEvents}`,
  });

  // ─── Derived KPIs (mirrors ownerDashboardService.ts computeKpis) ───

  const activeLeaseUnitIds = new Set(activeLeases.map((l) => l.unitId));
  const occupiedCount = units.filter((u) => activeLeaseUnitIds.has(u.id)).length;
  const scheduledRent = activeLeases.reduce((s, l) => s + l.rentAmount, 0);
  const occupancyPct = units.length > 0 ? ((occupiedCount / units.length) * 100).toFixed(1) : '0';
  const collectionPct = scheduledRent > 0 ? ((collectedThisMonth / scheduledRent) * 100).toFixed(1) : '0';

  // ─── Report ───

  const log = (msg: string) => console.log(msg); // eslint-disable-line no-console

  log('\n══════════════════════════════════════════════════════════════════');
  log('  OWNER DEMO — DOMAIN VALIDATION');
  log('══════════════════════════════════════════════════════════════════');
  log(`  Org: ${org.name} (${orgId})`);
  log(`  Subdomain: ${DEMO_SUBDOMAIN}`);
  log('──────────────────────────────────────────────────────────────────');

  let allOk = true;
  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗';
    log(`  ${icon}  ${c.domain.padEnd(14)} ${c.endpoint.padEnd(40)} ${c.details}`);
    if (!c.ok) allOk = false;
  }

  log('──────────────────────────────────────────────────────────────────');
  log('  Derived KPIs (mirrors ownerDashboardService.ts):');
  log(`    Occupancy:            ${occupancyPct}%  (${occupiedCount}/${units.length})`);
  log(`    Scheduled rent/mo:    ${fmt(scheduledRent)}`);
  log(`    Collected this month: ${fmt(collectedThisMonth)}`);
  log(`    Collection rate:      ${collectionPct}%`);
  log(`    Overdue:              ${fmt(overdue)}`);
  log(`    Upcoming due (30d):   ${fmt(upcoming)}`);
  log(`    Open maintenance:     ${openWO.length} (${urgentWO.length} urgent)`);
  log(`    Expiring leases 60d:  ${expiring60}`);
  log('──────────────────────────────────────────────────────────────────');
  log(`  Dev-bypass login (set DEV_AUTH_BYPASS=true on API):`);
  log(`    x-dev-org-id:       ${orgId}`);
  log(`    x-dev-user-email:   owner@demo.leasebase.local`);
  log(`    x-dev-user-role:    OWNER`);
  log('──────────────────────────────────────────────────────────────────');

  if (allOk) {
    log('  ✓ ALL 8 DOMAINS POPULATED — dashboard will render fully.');
  } else {
    log('  ✗ SOME DOMAINS MISSING DATA — see ✗ marks above.');
  }

  log('══════════════════════════════════════════════════════════════════');

  // ─── API controller gap warning ───
  log('');
  log('  ⚠  API CONTROLLER GAP');
  log('  The backend has Prisma models + NestJS service modules for all domains,');
  log('  but NO REST controllers for: properties, leases, payments, maintenance,');
  log('  documents. The frontend ownerDashboardService.ts calls these endpoints:');
  log('    GET api/properties           → 404 (no controller)');
  log('    GET api/properties/:id/units → 404 (no controller)');
  log('    GET api/leases               → 404 (no controller)');
  log('    GET api/payments             → 404 (no controller)');
  log('    GET api/payments/ledger      → 404 (no controller)');
  log('    GET api/maintenance          → 404 (no controller)');
  log('    GET api/documents            → 404 (no controller)');
  log('  Until these controllers are built, the Owner dashboard frontend will');
  log('  show "unavailable" for all domains despite valid DB data.');
  log('');

  process.exit(allOk ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e); // eslint-disable-line no-console
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
