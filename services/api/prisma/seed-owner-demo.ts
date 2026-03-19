/**
 * seed-owner-demo.ts — Rich, realistic OWNER demo data.
 *
 * Populates every widget on the OWNER dashboard (as computed by
 * ownerDashboardService.ts in leasebase-web):
 *
 *   KPI row · Cash Flow · Maintenance Overview · Lease Risk ·
 *   Vacancy Readiness · Property Health Table · Activity Feed ·
 *   Alerts · Portfolio Health · Documents
 *
 * Idempotent: deletes existing demo org data before recreating.
 * Safe: same 3-guard environment check as seed-reset-demo.ts.
 *
 * Usage:
 *   ALLOW_DEMO_RESET=true npm run seed:owner-demo
 *   ALLOW_DEMO_RESET=true npm run seed:demo-owner   (reset + seed)
 */

import 'dotenv/config';
import {
  LeaseStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  OrganizationType,
  PaymentStatus,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const DEMO_ORG_ID = 'demo-owner-org';
const DEMO_SUBDOMAIN = 'owner-demo';
const DEMO_ORG_NAME = 'DEMO - Westlake Property Group';
const DEMO_EMAIL_DOMAIN = '@demo.leasebase.local';

/* ═══════════════════════════════════════════════════════
   Environment guards (identical to seed-reset-demo.ts)
   ═══════════════════════════════════════════════════════ */

function extractHostname(url: string): string {
  try {
    const normalized = url.replace(/^postgresql(s)?:\/\//, 'http://');
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function assertSafeEnvironment(): void {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('ABORT: NODE_ENV is "production".');
  }
  if (process.env.ALLOW_DEMO_RESET !== 'true') {
    throw new Error('ABORT: ALLOW_DEMO_RESET is not "true". Set it to confirm intent.');
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) throw new Error('ABORT: DATABASE_URL is not set.');
  const hostname = extractHostname(dbUrl);
  if (!hostname) throw new Error('ABORT: Could not parse hostname from DATABASE_URL.');
  const segments = hostname.split(/[.\-]/);
  if (segments.some((s) => s === 'prod' || s === 'production')) {
    throw new Error(`ABORT: DATABASE_URL hostname "${hostname}" contains a production marker.`);
  }
}

/* ═══════════════════════════════════════════════════════
   Date helpers
   ═══════════════════════════════════════════════════════ */

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(10, 0, 0, 0);
  return dt;
}

function daysFromNow(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(10, 0, 0, 0);
  return dt;
}

function monthsAgo(m: number): Date {
  const dt = new Date();
  dt.setMonth(dt.getMonth() - m, 1);
  dt.setHours(10, 0, 0, 0);
  return dt;
}

function firstOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1, 10, 0, 0, 0);
}

/* ═══════════════════════════════════════════════════════
   Deterministic PRNG (reproducible seeds)
   ═══════════════════════════════════════════════════════ */

let _rng = 42;
function rand(): number {
  _rng = (_rng * 16807) % 2147483647;
  return (_rng - 1) / 2147483646;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/* ═══════════════════════════════════════════════════════
   Synthetic names
   ═══════════════════════════════════════════════════════ */

const FIRST = [
  'Ava','Ben','Carmen','David','Elena','Frank','Grace','Hiro','Iris','James',
  'Kenji','Lila','Marco','Nina','Omar','Priya','Quinn','Rosa','Sam','Tanya',
  'Uriel','Vera','Wes','Xia','Yuki','Zara','Aiden','Bella','Cruz','Dana',
  'Eli','Faye','Gus','Hope','Ivan','Jade','Kai','Luna','Milo','Nora',
  'Owen','Pia','Reed','Sage','Troy','Uma','Val','Wade','Yara','Zeke',
  'Aria','Blake','Cleo','Drew','Eva','Finn','Gina','Hank','Ivy','Joel',
  'Kira','Leo','Maya','Nico','Opal','Pete','Rhea','Seth','Tina','Umar',
  'Viv','Will','Xena','Yves','Zoe','Abel','Bree','Cole','Dani','Elio',
  'Fern','Glen','Hana','Ines','Joss','Kent','Leah','Moss','Nell','Otis',
];
const LAST = [
  'Anderson','Brooks','Chen','Diaz','Evans','Foster','Garcia','Hayes','Ibrahim',
  'Jensen','Kim','Lopez','Morgan','Nguyen','Okafor','Park','Quinn','Reyes',
  'Smith','Torres','Ueda','Vasquez','Walsh','Xu','Young','Zhang',
];

function synName(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
}

/* ═══════════════════════════════════════════════════════
   Property definitions  (12 properties → 100 units)
   ═══════════════════════════════════════════════════════ */

interface PropDef {
  name: string; addr: string; city: string; state: string; zip: string;
  units: number; rentCents: number; bed: number; bath: number; sqft: number;
}

const PROPS: PropDef[] = [
  // 4 SFH × 1 unit = 4
  { name: '142 Elm Street',       addr: '142 Elm St',          city: 'Austin',       state: 'TX', zip: '78701', units: 1,  rentCents: 195_000, bed: 3, bath: 2,   sqft: 1450 },
  { name: '207 Birch Lane',       addr: '207 Birch Ln',        city: 'Austin',       state: 'TX', zip: '78702', units: 1,  rentCents: 175_000, bed: 3, bath: 1.5, sqft: 1200 },
  { name: '89 Cedar Court',       addr: '89 Cedar Ct',         city: 'Round Rock',   state: 'TX', zip: '78664', units: 1,  rentCents: 165_000, bed: 2, bath: 1,   sqft: 1050 },
  { name: '311 Walnut Drive',     addr: '311 Walnut Dr',       city: 'Pflugerville', state: 'TX', zip: '78660', units: 1,  rentCents: 155_000, bed: 2, bath: 1,   sqft: 980  },
  // 2 duplex × 2 = 4
  { name: 'Oak Park Duplex',      addr: '500 Oak Park Blvd',   city: 'Austin',       state: 'TX', zip: '78703', units: 2,  rentCents: 145_000, bed: 2, bath: 1,   sqft: 850  },
  { name: 'Riverside Duplex',     addr: '612 River Rd',        city: 'Austin',       state: 'TX', zip: '78704', units: 2,  rentCents: 160_000, bed: 2, bath: 1.5, sqft: 920  },
  // 2 fourplex × 4 = 8
  { name: 'Lakeview Fourplex',    addr: '1000 Lakeview Dr',    city: 'Austin',       state: 'TX', zip: '78741', units: 4,  rentCents: 135_000, bed: 2, bath: 1,   sqft: 800  },
  { name: 'Highland Fourplex',    addr: '1200 Highland Ave',   city: 'Austin',       state: 'TX', zip: '78752', units: 4,  rentCents: 150_000, bed: 2, bath: 1.5, sqft: 880  },
  // 2 small-MF × 12 = 24
  { name: 'Parkside Apartments',  addr: '2500 Parkside Way',   city: 'Austin',       state: 'TX', zip: '78745', units: 12, rentCents: 125_000, bed: 1, bath: 1,   sqft: 650  },
  { name: 'Sunrise Gardens',      addr: '3100 Sunrise Blvd',   city: 'Cedar Park',   state: 'TX', zip: '78613', units: 12, rentCents: 130_000, bed: 1, bath: 1,   sqft: 700  },
  // 1 mid-MF × 24
  { name: 'Congress Place',       addr: '4000 S Congress Ave',  city: 'Austin',      state: 'TX', zip: '78704', units: 24, rentCents: 115_000, bed: 1, bath: 1,   sqft: 620  },
  // 1 larger-MF × 36
  { name: 'Capitol View Residences', addr: '5200 Capitol View Dr', city: 'Austin',   state: 'TX', zip: '78746', units: 36, rentCents: 105_000, bed: 1, bath: 1,   sqft: 580  },
];
// Total units: 4 + 4 + 8 + 24 + 24 + 36 = 100

/* ═══════════════════════════════════════════════════════
   Maintenance data
   ═══════════════════════════════════════════════════════ */

const MAINT_CAT = ['PLUMBING','ELECTRICAL','HVAC','APPLIANCE','GENERAL','PEST_CONTROL','ROOFING','FLOORING'];
const MAINT_DESC: Record<string, string[]> = {
  PLUMBING:      ['Leaking kitchen faucet','Toilet running constantly','Slow drain in bathroom sink','Water heater not producing hot water','Garbage disposal jammed'],
  ELECTRICAL:    ['Flickering lights in hallway','GFCI outlet not working','Ceiling fan wobbling','Smoke detector beeping','Light switch sparking'],
  HVAC:          ['AC not cooling properly','Heater blowing cold air','Thermostat not responding','Unusual noise from HVAC unit','Filter needs replacement'],
  APPLIANCE:     ['Dishwasher not draining','Refrigerator making noise','Oven not heating evenly','Washing machine leaking','Dryer not heating'],
  GENERAL:       ['Front door lock sticking','Window seal broken','Parking lot light out','Mailbox door damaged','Gate latch broken'],
  PEST_CONTROL:  ['Ants in kitchen','Mouse spotted in garage','Wasps nest near entrance','Roaches in bathroom'],
  ROOFING:       ['Roof leak above bedroom','Missing shingles after storm','Gutter clogged and overflowing'],
  FLOORING:      ['Tile cracked in bathroom','Carpet stain in living room','Hardwood floor squeaking','Vinyl peeling in kitchen'],
};

interface WODef {
  status: WorkOrderStatus; priority: WorkOrderPriority;
  daysAgo: number; assigned: boolean;
}

const WO_DEFS: WODef[] = [
  // 10 OPEN  (3 HIGH, 4 MED, 3 LOW)
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.HIGH,   daysAgo: 1,  assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.HIGH,   daysAgo: 10, assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.HIGH,   daysAgo: 22, assigned: true  },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.MEDIUM, daysAgo: 2,  assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.MEDIUM, daysAgo: 9,  assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.MEDIUM, daysAgo: 14, assigned: true  },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.MEDIUM, daysAgo: 19, assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.LOW,    daysAgo: 4,  assigned: false },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.LOW,    daysAgo: 11, assigned: true  },
  { status: WorkOrderStatus.OPEN, priority: WorkOrderPriority.LOW,    daysAgo: 27, assigned: false },
  // 5 IN_PROGRESS  (1 HIGH, 3 MED, 1 LOW)
  { status: WorkOrderStatus.IN_PROGRESS, priority: WorkOrderPriority.HIGH,   daysAgo: 6,  assigned: true },
  { status: WorkOrderStatus.IN_PROGRESS, priority: WorkOrderPriority.MEDIUM, daysAgo: 3,  assigned: true },
  { status: WorkOrderStatus.IN_PROGRESS, priority: WorkOrderPriority.MEDIUM, daysAgo: 12, assigned: true },
  { status: WorkOrderStatus.IN_PROGRESS, priority: WorkOrderPriority.MEDIUM, daysAgo: 18, assigned: true },
  { status: WorkOrderStatus.IN_PROGRESS, priority: WorkOrderPriority.LOW,    daysAgo: 2,  assigned: true },
  // 8 RESOLVED
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.HIGH,   daysAgo: 25, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.MEDIUM, daysAgo: 35, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.MEDIUM, daysAgo: 42, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.LOW,    daysAgo: 50, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.MEDIUM, daysAgo: 28, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.LOW,    daysAgo: 55, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.HIGH,   daysAgo: 60, assigned: true },
  { status: WorkOrderStatus.RESOLVED, priority: WorkOrderPriority.MEDIUM, daysAgo: 38, assigned: true },
  // 7 CLOSED
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.MEDIUM, daysAgo: 40, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.LOW,    daysAgo: 65, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.HIGH,   daysAgo: 45, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.LOW,    daysAgo: 70, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.MEDIUM, daysAgo: 80, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.LOW,    daysAgo: 55, assigned: true },
  { status: WorkOrderStatus.CLOSED, priority: WorkOrderPriority.MEDIUM, daysAgo: 90, assigned: true },
];
// Total: 10 + 5 + 8 + 7 = 30

/* ═══════════════════════════════════════════════════════
   Idempotent org-scoped cleanup (mini-reset)
   ═══════════════════════════════════════════════════════ */

async function cleanDemoOrg(orgId: string): Promise<void> {
  // Same FK-safe order as seed-reset-demo.ts
  await prisma.workOrderComment.deleteMany({ where: { workOrder: { organizationId: orgId } } });
  await prisma.workOrder.deleteMany({ where: { organizationId: orgId } });
  await prisma.payment.deleteMany({ where: { organizationId: orgId } });
  await prisma.ledgerEntry.deleteMany({ where: { organizationId: orgId } });
  await prisma.tenantProfile.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.lease.deleteMany({ where: { organizationId: orgId } });
  await prisma.document.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.managerPropertyAssignment.deleteMany({ where: { organizationId: orgId } });
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  await prisma.unit.deleteMany({ where: { organizationId: orgId } });
  await prisma.property.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({
    where: { organizationId: orgId, email: { endsWith: DEMO_EMAIL_DOMAIN } },
  });
}

/* ═══════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  assertSafeEnvironment();

  const log = (msg: string) => console.log(msg); // eslint-disable-line no-console

  log('[seed-owner-demo] Starting …');

  // ─── 1. Upsert org, clean existing data ───

  const existingOrg = await prisma.organization.findUnique({ where: { subdomain: DEMO_SUBDOMAIN } });
  if (existingOrg) {
    log('[seed-owner-demo] Cleaning existing demo data …');
    await cleanDemoOrg(existingOrg.id);
  }

  const totalUnitCount = PROPS.reduce((s, p) => s + p.units, 0);

  const org = await prisma.organization.upsert({
    where: { subdomain: DEMO_SUBDOMAIN },
    update: { name: DEMO_ORG_NAME, plan: 'professional', type: OrganizationType.LANDLORD, unitCount: totalUnitCount },
    create: {
      id: DEMO_ORG_ID,
      type: OrganizationType.LANDLORD,
      name: DEMO_ORG_NAME,
      plan: 'professional',
      subdomain: DEMO_SUBDOMAIN,
      unitCount: totalUnitCount,
    },
  });
  const orgId = org.id;

  await prisma.subscription.upsert({
    where: { organizationId: orgId },
    update: { plan: 'professional', unitCount: totalUnitCount, status: SubscriptionStatus.ACTIVE },
    create: { organizationId: orgId, plan: 'professional', unitCount: totalUnitCount, status: SubscriptionStatus.ACTIVE },
  });

  // ─── 2. Users ───

  const ownerUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: orgId, email: `owner${DEMO_EMAIL_DOMAIN}` } },
    update: { name: 'Jordan Westlake', cognitoSub: 'demo-ow-owner', role: UserRole.OWNER },
    create: { organizationId: orgId, email: `owner${DEMO_EMAIL_DOMAIN}`, name: 'Jordan Westlake', cognitoSub: 'demo-ow-owner', role: UserRole.OWNER },
  });

  const adminUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: orgId, email: `admin${DEMO_EMAIL_DOMAIN}` } },
    update: { name: 'Morgan Blake', cognitoSub: 'demo-ow-admin', role: UserRole.OWNER },
    create: { organizationId: orgId, email: `admin${DEMO_EMAIL_DOMAIN}`, name: 'Morgan Blake', cognitoSub: 'demo-ow-admin', role: UserRole.OWNER },
  });

  // ─── 3. Properties + Units ───

  const propertyIds: string[] = [];
  const allUnits: Array<{ id: string; propertyId: string; rentCents: number }> = [];

  for (const def of PROPS) {
    const prop = await prisma.property.create({
      data: {
        organizationId: orgId, name: def.name, addressLine1: def.addr,
        city: def.city, state: def.state, postalCode: def.zip, country: 'US',
      },
    });
    propertyIds.push(prop.id);

    for (let u = 0; u < def.units; u++) {
      const variation = Math.round((rand() - 0.5) * 2000) * 100; // ±$20 in cents
      const rent = def.rentCents + variation;
      const unitNum = def.units === 1
        ? 'Main'
        : def.units <= 4
          ? String.fromCharCode(65 + u)
          : `${Math.floor(u / 4) + 1}${String.fromCharCode(65 + (u % 4))}`;

      const unit = await prisma.unit.create({
        data: {
          organizationId: orgId, propertyId: prop.id, unitNumber: unitNum,
          bedrooms: def.bed, bathrooms: def.bath,
          squareFeet: def.sqft + Math.round((rand() - 0.5) * 100),
          rentAmount: rent, status: 'AVAILABLE',
        },
      });
      allUnits.push({ id: unit.id, propertyId: prop.id, rentCents: rent });
    }
  }

  log(`[seed-owner-demo] ${PROPS.length} properties, ${allUnits.length} units`);

  // ─── 4. Lease allocation ───
  // Target: 87% occupancy → 87 active, 13 vacant

  const shuffled = [...allUnits].sort(() => rand() - 0.5);
  const OCCUPIED = 87;
  const occupied = shuffled.slice(0, OCCUPIED);
  const vacant = shuffled.slice(OCCUPIED);

  // Lease breakdown of the 87 occupied:
  const EXP30 = 4;    // expiring ≤30 days
  const EXP60 = 3;    // expiring 31-60 days
  const M2M   = 2;    // month-to-month (end_date in past, still ACTIVE)
  const STD   = OCCUPIED - EXP30 - EXP60 - M2M; // 78 standard

  // Additional leases on vacant units (for history / drafts)
  const EXPIRED_COUNT = 5;
  const FUTURE_COUNT  = 3;

  interface LeaseSlot {
    unit: typeof allUnits[0]; status: LeaseStatus;
    start: Date; end: Date; cat: string;
  }

  const slots: LeaseSlot[] = [];
  let si = 0; // index into occupied[]

  // Standard active
  for (let i = 0; i < STD; i++, si++) {
    const back = 2 + Math.floor(rand() * 10);
    const s = monthsAgo(back);
    const e = new Date(s); e.setMonth(e.getMonth() + 12);
    slots.push({ unit: occupied[si], status: LeaseStatus.ACTIVE, start: s, end: e, cat: 'standard' });
  }
  // Expiring ≤30d
  for (let i = 0; i < EXP30; i++, si++) {
    slots.push({ unit: occupied[si], status: LeaseStatus.ACTIVE,
      start: monthsAgo(11), end: daysFromNow(3 + Math.floor(rand() * 27)), cat: 'exp30' });
  }
  // Expiring 31-60d
  for (let i = 0; i < EXP60; i++, si++) {
    slots.push({ unit: occupied[si], status: LeaseStatus.ACTIVE,
      start: monthsAgo(11), end: daysFromNow(33 + Math.floor(rand() * 27)), cat: 'exp60' });
  }
  // Month-to-month
  for (let i = 0; i < M2M; i++, si++) {
    slots.push({ unit: occupied[si], status: LeaseStatus.ACTIVE,
      start: monthsAgo(15), end: daysAgo(20 + Math.floor(rand() * 60)), cat: 'm2m' });
  }
  // Expired (on vacant units)
  for (let i = 0; i < EXPIRED_COUNT && i < vacant.length; i++) {
    slots.push({ unit: vacant[i], status: LeaseStatus.EXPIRED,
      start: monthsAgo(14), end: daysAgo(30 + Math.floor(rand() * 60)), cat: 'expired' });
  }
  // Future / DRAFT (on vacant units)
  for (let i = EXPIRED_COUNT; i < EXPIRED_COUNT + FUTURE_COUNT && i < vacant.length; i++) {
    slots.push({ unit: vacant[i], status: LeaseStatus.DRAFT,
      start: daysFromNow(15 + Math.floor(rand() * 45)), end: daysFromNow(380), cat: 'future' });
  }

  // ─── 5. Create leases + tenants ───

  const leases: Array<{
    id: string; unitId: string; propertyId: string; rentCents: number;
    status: LeaseStatus; start: Date; end: Date;
    tenantProfileId: string | null; cat: string;
  }> = [];

  let tIdx = 0;

  for (const sl of slots) {
    const lease = await prisma.lease.create({
      data: {
        organizationId: orgId, unitId: sl.unit.id,
        startDate: sl.start, endDate: sl.end,
        rentAmount: sl.unit.rentCents, depositAmount: sl.unit.rentCents,
        status: sl.status,
      },
    });

    let tpId: string | null = null;

    if (sl.status === LeaseStatus.ACTIVE) {
      const tName = synName(tIdx);
      const tEmail = `${tName.toLowerCase().replace(' ', '.')}+${tIdx}${DEMO_EMAIL_DOMAIN}`;
      tIdx++;

      const tUser = await prisma.user.create({
        data: {
          organizationId: orgId, email: tEmail, name: tName,
          role: UserRole.TENANT, cognitoSub: `demo-ow-t-${tIdx}`,
        },
      });
      const tp = await prisma.tenantProfile.create({
        data: { userId: tUser.id, leaseId: lease.id, phone: `+1-555-${String(1000 + tIdx).slice(-4)}` },
      });
      tpId = tp.id;
    }

    leases.push({
      id: lease.id, unitId: sl.unit.id, propertyId: sl.unit.propertyId,
      rentCents: sl.unit.rentCents, status: sl.status,
      start: sl.start, end: sl.end, tenantProfileId: tpId, cat: sl.cat,
    });
  }

  log(`[seed-owner-demo] ${leases.length} leases (${OCCUPIED} active, ${vacant.length} vacant)`);

  // ─── 6. Ledger entries + Payments ───
  //
  // For each ACTIVE lease: monthly CHARGE for past 6 months + current + next month.
  //
  // Past months : 88% on-time · 5% late · 3% partial · 4% unpaid
  // Current month: 70% paid · 30% pending
  // Next month  : all PENDING (→ "upcoming due" KPI)
  //
  // Key mapping to ownerDashboardService.ts:
  //   monthlyScheduledRent = SUM(lease.rentAmount) where status=ACTIVE
  //   collectedThisMonth   = SUM(payment.amount) where status=SUCCEEDED, createdAt ≥ monthStart
  //   overdueAmount        = SUM(ledger.amount) where type=CHARGE, status=PENDING, dueDate < today
  //   billedThisMonth      = SUM(ledger.amount) where type=CHARGE, dueDate in current month
  //   upcomingDue          = SUM(ledger.amount) where type=CHARGE, status=PENDING, dueDate ≥ today & ≤ +30d

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const nextMonthDate = firstOfMonth(
    curMonth === 11 ? curYear + 1 : curYear,
    curMonth === 11 ? 0 : curMonth + 1,
  );

  const activeLeases = leases.filter((l) => l.status === LeaseStatus.ACTIVE);
  let chargeCount = 0;
  let paymentCount = 0;

  for (const lease of activeLeases) {
    const leaseStartAbsMonth = lease.start.getFullYear() * 12 + lease.start.getMonth();
    const curAbsMonth = curYear * 12 + curMonth;
    const historyMonths = Math.min(6, curAbsMonth - leaseStartAbsMonth);

    // Past + current months
    for (let mo = historyMonths; mo >= 0; mo--) {
      const absMonth = curAbsMonth - mo;
      const mYear = Math.floor(absMonth / 12);
      const mMonth = absMonth % 12;
      const isCurrent = mo === 0;
      // Use the 15th for current-month charges so they aren't all overdue on day 1.
      const dueDate = isCurrent
        ? new Date(mYear, mMonth, 15, 10, 0, 0, 0)
        : firstOfMonth(mYear, mMonth);

      const entry = await prisma.ledgerEntry.create({
        data: {
          organizationId: orgId, leaseId: lease.id,
          type: LedgerEntryType.CHARGE, amount: lease.rentCents, currency: 'usd',
          dueDate, status: LedgerEntryStatus.PENDING,
          description: `Rent — ${dueDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
        },
      });
      chargeCount++;

      const roll = rand();

      if (!isCurrent) {
        // ── Past month ──
        if (roll < 0.88) {
          // On-time full payment
          const payDate = new Date(dueDate);
          payDate.setDate(payDate.getDate() + Math.floor(rand() * 5));
          await prisma.payment.create({
            data: {
              organizationId: orgId, leaseId: lease.id,
              tenantProfileId: lease.tenantProfileId, ledgerEntryId: entry.id,
              amount: lease.rentCents, currency: 'usd',
              method: pick(['ACH', 'CARD', 'CHECK']),
              status: PaymentStatus.SUCCEEDED, createdAt: payDate,
            },
          });
          await prisma.ledgerEntry.update({ where: { id: entry.id }, data: { status: LedgerEntryStatus.POSTED } });
          paymentCount++;
        } else if (roll < 0.93) {
          // Late full payment
          const payDate = new Date(dueDate);
          payDate.setDate(payDate.getDate() + 10 + Math.floor(rand() * 15));
          await prisma.payment.create({
            data: {
              organizationId: orgId, leaseId: lease.id,
              tenantProfileId: lease.tenantProfileId, ledgerEntryId: entry.id,
              amount: lease.rentCents, currency: 'usd',
              method: pick(['ACH', 'CARD']),
              status: PaymentStatus.SUCCEEDED, createdAt: payDate,
            },
          });
          await prisma.ledgerEntry.update({ where: { id: entry.id }, data: { status: LedgerEntryStatus.POSTED } });
          paymentCount++;
        } else if (roll < 0.96) {
          // Partial payment — ledger stays PENDING → overdue
          const partial = Math.round(lease.rentCents * (0.4 + rand() * 0.3));
          const payDate = new Date(dueDate);
          payDate.setDate(payDate.getDate() + 5 + Math.floor(rand() * 10));
          await prisma.payment.create({
            data: {
              organizationId: orgId, leaseId: lease.id,
              tenantProfileId: lease.tenantProfileId,
              amount: partial, currency: 'usd', method: 'ACH',
              status: PaymentStatus.SUCCEEDED, createdAt: payDate,
            },
          });
          paymentCount++;
        }
        // else (4%): unpaid — ledger stays PENDING → overdue
      } else {
        // ── Current month ──
        if (roll < 0.70) {
          const payDate = new Date(dueDate);
          payDate.setDate(payDate.getDate() + Math.floor(rand() * 8));
          if (payDate > now) payDate.setTime(now.getTime() - 86_400_000);
          await prisma.payment.create({
            data: {
              organizationId: orgId, leaseId: lease.id,
              tenantProfileId: lease.tenantProfileId, ledgerEntryId: entry.id,
              amount: lease.rentCents, currency: 'usd',
              method: pick(['ACH', 'CARD', 'CHECK']),
              status: PaymentStatus.SUCCEEDED, createdAt: payDate,
            },
          });
          await prisma.ledgerEntry.update({ where: { id: entry.id }, data: { status: LedgerEntryStatus.POSTED } });
          paymentCount++;
        }
        // else: pending — overdue since dueDate (1st) < today
      }
    }

    // Next month — upcoming charge (always PENDING, future due date)
    await prisma.ledgerEntry.create({
      data: {
        organizationId: orgId, leaseId: lease.id,
        type: LedgerEntryType.CHARGE, amount: lease.rentCents, currency: 'usd',
        dueDate: nextMonthDate, status: LedgerEntryStatus.PENDING,
        description: `Rent — ${nextMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
      },
    });
    chargeCount++;
  }

  log(`[seed-owner-demo] ${chargeCount} ledger charges, ${paymentCount} payments`);

  // ─── 7. Work orders ───

  const occUnitIds = occupied.map((u) => u.id);

  for (let wi = 0; wi < WO_DEFS.length; wi++) {
    const def = WO_DEFS[wi];
    const unitId = occUnitIds[wi % occUnitIds.length];
    const cat = MAINT_CAT[wi % MAINT_CAT.length];
    const descs = MAINT_DESC[cat] ?? MAINT_DESC['GENERAL'];
    const desc = descs[wi % descs.length];

    await prisma.workOrder.create({
      data: {
        organizationId: orgId, unitId,
        createdByUserId: adminUser.id,
        assigneeId: def.assigned ? adminUser.id : null,
        category: cat, priority: def.priority, status: def.status,
        description: desc, createdAt: daysAgo(def.daysAgo),
      },
    });
  }
  log(`[seed-owner-demo] ${WO_DEFS.length} work orders`);

  // ─── 8. Documents (16) ───

  const docDefs = [
    // Property-level (6)
    { type: 'PROPERTY', idx: 0,  name: 'Insurance Certificate 2025.pdf' },
    { type: 'PROPERTY', idx: 2,  name: 'Property Tax Assessment.pdf' },
    { type: 'PROPERTY', idx: 4,  name: 'HOA Agreement.pdf' },
    { type: 'PROPERTY', idx: 6,  name: 'Annual Inspection Report.pdf' },
    { type: 'PROPERTY', idx: 8,  name: 'Insurance Certificate 2024.pdf' },
    { type: 'PROPERTY', idx: 10, name: 'Property Tax Bill.pdf' },
    // Lease-level (6)
    { type: 'LEASE', idx: 0,  name: 'Signed Lease Agreement.pdf' },
    { type: 'LEASE', idx: 2,  name: 'Lease Addendum — Pet Policy.pdf' },
    { type: 'LEASE', idx: 5,  name: 'Move-In Inspection Checklist.pdf' },
    { type: 'LEASE', idx: 8,  name: 'Signed Lease Agreement.pdf' },
    { type: 'LEASE', idx: 12, name: 'Lease Renewal Agreement.pdf' },
    { type: 'LEASE', idx: 20, name: 'Signed Lease Agreement.pdf' },
    // Additional property-level (4)
    { type: 'PROPERTY', idx: 1,  name: 'Vendor Contract — Landscaping.pdf' },
    { type: 'PROPERTY', idx: 3,  name: 'Fire Safety Inspection.pdf' },
    { type: 'PROPERTY', idx: 9,  name: 'Roof Warranty Certificate.pdf' },
    { type: 'PROPERTY', idx: 11, name: 'Elevator Maintenance Agreement.pdf' },
  ];

  for (const doc of docDefs) {
    const relatedId = doc.type === 'PROPERTY'
      ? propertyIds[doc.idx % propertyIds.length]
      : leases[doc.idx % leases.length]?.id;
    if (!relatedId) continue;

    await prisma.document.create({
      data: {
        organizationId: orgId, relatedType: doc.type, relatedId,
        name: doc.name,
        s3Key: `${orgId}/${doc.type}/${relatedId}/${doc.name.replace(/ /g, '_').toLowerCase()}`,
        mimeType: 'application/pdf', createdByUserId: adminUser.id,
      },
    });
  }
  log(`[seed-owner-demo] ${docDefs.length} documents`);

  // ─── 9. Audit log ───

  await prisma.auditLog.create({
    data: {
      organizationId: orgId, userId: ownerUser.id,
      action: 'DEMO_SEED', entityType: 'Organization', entityId: orgId,
      metadataJson: { seededAt: now.toISOString(), script: 'seed-owner-demo.ts' },
    },
  });

  // ═══════════════════════════════════════════════════════
  // VALIDATION — query actual DB state for KPI-matching output
  // ═══════════════════════════════════════════════════════

  const qProps      = await prisma.property.count({ where: { organizationId: orgId } });
  const qUnits      = await prisma.unit.count({ where: { organizationId: orgId } });
  const qActive     = await prisma.lease.count({ where: { organizationId: orgId, status: LeaseStatus.ACTIVE } });
  const qExpired    = await prisma.lease.count({ where: { organizationId: orgId, status: LeaseStatus.EXPIRED } });
  const qDraft      = await prisma.lease.count({ where: { organizationId: orgId, status: LeaseStatus.DRAFT } });
  const qVacant     = qUnits - qActive;
  const qOccPct     = qUnits > 0 ? ((qActive / qUnits) * 100).toFixed(1) : '0';

  // monthlyScheduledRent = sum of rentAmount on ACTIVE leases
  const rentAgg = await prisma.lease.aggregate({
    where: { organizationId: orgId, status: LeaseStatus.ACTIVE },
    _sum: { rentAmount: true },
  });
  const scheduledCents = rentAgg._sum.rentAmount ?? 0;

  // collectedThisMonth
  const monthStart = firstOfMonth(curYear, curMonth);
  const collAgg = await prisma.payment.aggregate({
    where: { organizationId: orgId, status: PaymentStatus.SUCCEEDED, createdAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const collectedCents = collAgg._sum.amount ?? 0;

  // overdueAmount = PENDING CHARGE entries where dueDate < today
  const todayMidnight = new Date(curYear, curMonth, now.getDate(), 0, 0, 0);
  const overdueAgg = await prisma.ledgerEntry.aggregate({
    where: { organizationId: orgId, type: LedgerEntryType.CHARGE, status: LedgerEntryStatus.PENDING, dueDate: { lt: todayMidnight } },
    _sum: { amount: true },
  });
  const overdueCents = overdueAgg._sum.amount ?? 0;

  // upcoming (next 30 days, PENDING, dueDate ≥ today)
  const thirtyOut = daysFromNow(30);
  const upcomingAgg = await prisma.ledgerEntry.aggregate({
    where: { organizationId: orgId, type: LedgerEntryType.CHARGE, status: LedgerEntryStatus.PENDING, dueDate: { gte: todayMidnight, lte: thirtyOut } },
    _sum: { amount: true },
  });
  const upcomingCents = upcomingAgg._sum.amount ?? 0;

  // Maintenance
  const qOpenMaint  = await prisma.workOrder.count({ where: { organizationId: orgId, status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] } } });
  const qUrgent     = await prisma.workOrder.count({ where: { organizationId: orgId, status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] }, priority: WorkOrderPriority.HIGH } });
  const qTotalWO    = await prisma.workOrder.count({ where: { organizationId: orgId } });

  const qDocs       = await prisma.document.count({ where: { organizationId: orgId } });
  const qPayments   = await prisma.payment.count({ where: { organizationId: orgId, status: PaymentStatus.SUCCEEDED } });
  const qLedger     = await prisma.ledgerEntry.count({ where: { organizationId: orgId } });
  const qTenants    = await prisma.user.count({ where: { organizationId: orgId, role: UserRole.TENANT } });

  // Expiring leases (within 60 days)
  const sixtyDaysOut = daysFromNow(60);
  const qExpiring60 = await prisma.lease.count({
    where: { organizationId: orgId, status: LeaseStatus.ACTIVE, endDate: { gte: todayMidnight, lte: sixtyDaysOut } },
  });

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  log('\n══════════════════════════════════════════════════');
  log('  OWNER DEMO SEED — VALIDATION SUMMARY');
  log('══════════════════════════════════════════════════');
  log(`  Org ID:               ${orgId}`);
  log(`  Org name:             ${DEMO_ORG_NAME}`);
  log(`  Org subdomain:        ${DEMO_SUBDOMAIN}`);
  log(`  OWNER login email:    owner${DEMO_EMAIL_DOMAIN}`);
  log(`  ADMIN login email:    admin${DEMO_EMAIL_DOMAIN}`);
  log('');
  log('  Dev-bypass login (set DEV_AUTH_BYPASS=true on API):');
  log(`    x-dev-org-id:       ${orgId}`);
  log(`    x-dev-user-email:   owner${DEMO_EMAIL_DOMAIN}`);
  log('    x-dev-user-role:    OWNER');
  log('──────────────────────────────────────────────────');
  log(`  Properties:           ${qProps}`);
  log(`  Units:                ${qUnits}`);
  log(`  Active leases:        ${qActive}`);
  log(`  Expired leases:       ${qExpired}`);
  log(`  Draft leases:         ${qDraft}`);
  log(`  Vacant units:         ${qVacant}`);
  log(`  Occupancy:            ${qOccPct}%`);
  log(`  Tenants:              ${qTenants}`);
  log('──────────────────────────────────────────────────');
  log(`  Scheduled rent/mo:    ${fmt(scheduledCents)}`);
  log(`  Collected this month: ${fmt(collectedCents)}`);
  log(`  Overdue amount:       ${fmt(overdueCents)}`);
  log(`  Upcoming due (30d):   ${fmt(upcomingCents)}`);
  log(`  Collection rate:      ${scheduledCents > 0 ? ((collectedCents / scheduledCents) * 100).toFixed(1) : 0}%`);
  log('──────────────────────────────────────────────────');
  log(`  Open maintenance:     ${qOpenMaint} (${qUrgent} urgent)`);
  log(`  Total work orders:    ${qTotalWO}`);
  log(`  Expiring leases 60d:  ${qExpiring60}`);
  log(`  Documents:            ${qDocs}`);
  log(`  Payments (succeeded): ${qPayments}`);
  log(`  Ledger entries:       ${qLedger}`);
  log('──────────────────────────────────────────────────');
  log('  KPI domain population:');
  log(`    properties:    ${qProps > 0 ? '✓' : '✗'} (${qProps})`);
  log(`    units:         ${qUnits > 0 ? '✓' : '✗'} (${qUnits})`);
  log(`    leases:        ${qActive > 0 ? '✓' : '✗'} (${qActive} active)`);
  log(`    payments:      ${qPayments > 0 ? '✓' : '✗'} (${qPayments})`);
  log(`    ledger:        ${qLedger > 0 ? '✓' : '✗'} (${qLedger})`);
  log(`    maintenance:   ${qTotalWO > 0 ? '✓' : '✗'} (${qTotalWO})`);
  log(`    documents:     ${qDocs > 0 ? '✓' : '✗'} (${qDocs})`);
  log(`    activity:      ${(qPayments + qTotalWO) > 20 ? '✓' : '✗'} (${qPayments + qTotalWO} events)`);
  log('══════════════════════════════════════════════════');
  log('[seed-owner-demo] Done ✓\n');
}

main()
  .catch((e) => {
    console.error(e); // eslint-disable-line no-console
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
