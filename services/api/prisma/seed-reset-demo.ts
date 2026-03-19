/**
 * seed-reset-demo.ts — Org-scoped reset for the OWNER demo org.
 *
 * Deletes ONLY data belonging to the "owner-demo" organization.
 * Does NOT touch any other org, user, or system data.
 *
 * Environment guards (ALL must pass):
 *   1. NODE_ENV !== 'production'
 *   2. ALLOW_DEMO_RESET === 'true'
 *   3. DATABASE_URL hostname has no 'prod' / 'production' segments
 *
 * Usage:
 *   ALLOW_DEMO_RESET=true npm run seed:reset-demo
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DEMO_SUBDOMAIN = 'owner-demo';
const DEMO_EMAIL_DOMAIN = '@demo.leasebase.local';

/* ─── Environment guards ─── */

function extractHostname(url: string): string {
  try {
    const normalized = url.replace(/^postgresql(s)?:\/\//, 'http://');
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function assertSafeEnvironment(): void {
  // Guard 1: NODE_ENV
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('ABORT: NODE_ENV is "production". Refusing to run.');
  }

  // Guard 2: explicit opt-in
  if (process.env.ALLOW_DEMO_RESET !== 'true') {
    throw new Error(
      'ABORT: ALLOW_DEMO_RESET is not "true". ' +
        'Set ALLOW_DEMO_RESET=true to confirm you intend to reset demo data.',
    );
  }

  // Guard 3: DATABASE_URL must not point at production
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) {
    throw new Error('ABORT: DATABASE_URL is not set.');
  }
  const hostname = extractHostname(dbUrl);
  if (!hostname) {
    throw new Error('ABORT: Could not parse hostname from DATABASE_URL. Failing closed.');
  }
  const segments = hostname.split(/[.\-]/);
  if (segments.some((s) => s === 'prod' || s === 'production')) {
    throw new Error(
      `ABORT: DATABASE_URL hostname "${hostname}" contains a production marker. Refusing to run.`,
    );
  }
}

/* ─── Main ─── */

async function main(): Promise<void> {
  assertSafeEnvironment();

  const prisma = new PrismaClient();

  try {
    const org = await prisma.organization.findUnique({
      where: { subdomain: DEMO_SUBDOMAIN },
    });

    if (!org) {
      // eslint-disable-next-line no-console
      console.log(`[reset-demo] No org with subdomain "${DEMO_SUBDOMAIN}" found. Nothing to reset.`);
      return;
    }

    const orgId = org.id;
    // eslint-disable-next-line no-console
    console.log(`[reset-demo] Found demo org "${org.name}" (${orgId}). Deleting child data …`);

    // Delete in FK-safe order within a transaction.
    // Every table with organizationId is scoped. Tables without it
    // (WorkOrderComment, TenantProfile) are reached via relation filters.
    await prisma.$transaction(
      async (tx) => {
        // 1. WorkOrderComment → FK to WorkOrder, User
        await tx.workOrderComment.deleteMany({
          where: { workOrder: { organizationId: orgId } },
        });

        // 2. WorkOrder → FK to Unit, User (×3)
        await tx.workOrder.deleteMany({ where: { organizationId: orgId } });

        // 3. Payment → FK to Lease, TenantProfile, LedgerEntry
        await tx.payment.deleteMany({ where: { organizationId: orgId } });

        // 4. LedgerEntry → FK to Lease
        await tx.ledgerEntry.deleteMany({ where: { organizationId: orgId } });

        // 5. TenantProfile → FK to User, Lease (no organizationId column)
        await tx.tenantProfile.deleteMany({
          where: { user: { organizationId: orgId, email: { endsWith: DEMO_EMAIL_DOMAIN } } },
        });

        // 6. Lease → FK to Unit
        await tx.lease.deleteMany({ where: { organizationId: orgId } });

        // 7. Document → FK to User
        await tx.document.deleteMany({ where: { organizationId: orgId } });

        // 8. AuditLog → FK to User (nullable)
        await tx.auditLog.deleteMany({ where: { organizationId: orgId } });

        // 9. ManagerPropertyAssignment → FK to User, Property
        await tx.managerPropertyAssignment.deleteMany({ where: { organizationId: orgId } });

        // 10. Subscription → FK to Organization
        await tx.subscription.deleteMany({ where: { organizationId: orgId } });

        // 11. Unit → FK to Property
        await tx.unit.deleteMany({ where: { organizationId: orgId } });

        // 12. Property → FK to Organization
        await tx.property.deleteMany({ where: { organizationId: orgId } });

        // 13. Users — ONLY those with the demo email domain
        await tx.user.deleteMany({
          where: { organizationId: orgId, email: { endsWith: DEMO_EMAIL_DOMAIN } },
        });

        // 14. Check whether any non-demo users remain before deleting the org
        const remainingUsers = await tx.user.count({ where: { organizationId: orgId } });

        if (remainingUsers > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[reset-demo] WARNING: ${remainingUsers} non-demo user(s) remain in org ${orgId}. ` +
              `Org will NOT be deleted. Remove them manually if intended.`,
          );
        } else {
          await tx.organization.delete({ where: { id: orgId } });
          // eslint-disable-next-line no-console
          console.log(`[reset-demo] Deleted demo org "${org.name}".`);
        }
      },
      { timeout: 60_000 },
    );

    // eslint-disable-next-line no-console
    console.log('[reset-demo] Done ✓');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
