import 'dotenv/config';
import {
  LeaseStatus,
  LedgerEntryType,
  OrganizationType,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Landlord organization
  const landlordOrg = await prisma.organization.upsert({
    where: { subdomain: 'landlord-demo' },
    update: {
      plan: 'basic',
      unitCount: 4,
    },
    create: {
      type: OrganizationType.LANDLORD,
      name: 'Demo Landlord Org',
      plan: 'basic',
      subdomain: 'landlord-demo',
      unitCount: 4,
    },
  });

  // Second demo organization (landlord)
  const pmOrg = await prisma.organization.upsert({
    where: { subdomain: 'pm-demo' },
    update: {
      plan: 'basic',
    },
    create: {
      type: OrganizationType.LANDLORD,
      name: 'Demo PM Org',
      plan: 'basic',
      subdomain: 'pm-demo',
    },
  });

  // Admin user for landlord org
  const adminUser = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: landlordOrg.id,
        email: 'admin@landlord.local',
      },
    },
    update: {
      name: 'Alice Admin',
      cognitoSub: 'dev-admin-landlord',
      role: UserRole.OWNER,
    },
    create: {
      organizationId: landlordOrg.id,
      email: 'admin@landlord.local',
      name: 'Alice Admin',
      cognitoSub: 'dev-admin-landlord',
      role: UserRole.OWNER,
    },
  });

  // Tenant user for landlord org
  const tenantUser = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: landlordOrg.id,
        email: 'tenant@landlord.local',
      },
    },
    update: {
      name: 'Terry Tenant',
      cognitoSub: 'dev-tenant-landlord',
      role: UserRole.TENANT,
    },
    create: {
      organizationId: landlordOrg.id,
      email: 'tenant@landlord.local',
      name: 'Terry Tenant',
      cognitoSub: 'dev-tenant-landlord',
      role: UserRole.TENANT,
    },
  });

  // Demo property with four units
  const property = await prisma.property.create({
    data: {
      organizationId: landlordOrg.id,
      name: 'Demo Apartments',
      addressLine1: '123 Main St',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'US',
    },
  });

  const units = await Promise.all(
    Array.from({ length: 4 }).map((_, index) =>
      prisma.unit.create({
        data: {
          organizationId: landlordOrg.id,
          propertyId: property.id,
          unitNumber: `10${index + 1}`,
          bedrooms: 2,
          bathrooms: 1,
          squareFeet: 900,
          rentAmount: 200_000, // $2,000.00
        },
      }),
    ),
  );

  const leasedUnit = units[0];

  const lease = await prisma.lease.create({
    data: {
      organizationId: landlordOrg.id,
      unitId: leasedUnit.id,
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      rentAmount: 200_000,
      depositAmount: 200_000,
      status: LeaseStatus.ACTIVE,
    },
  });

  const tenantProfile = await prisma.tenantProfile.upsert({
    where: { userId: tenantUser.id },
    update: {
      leaseId: lease.id,
      phone: '+1-555-0100',
    },
    create: {
      userId: tenantUser.id,
      leaseId: lease.id,
      phone: '+1-555-0100',
    },
  });

  // Initial ledger entry for first month rent
  await prisma.ledgerEntry.create({
    data: {
      organizationId: landlordOrg.id,
      leaseId: lease.id,
      type: LedgerEntryType.CHARGE,
      amount: 200_000,
      currency: 'usd',
      dueDate: new Date(),
      description: 'First month rent',
    },
  });

  // Demo work order on leased unit
  await prisma.workOrder.create({
    data: {
      organizationId: landlordOrg.id,
      unitId: leasedUnit.id,
      createdByUserId: adminUser.id,
      tenantUserId: tenantUser.id,
      category: 'GENERAL',
      priority: WorkOrderPriority.MEDIUM,
      status: WorkOrderStatus.OPEN,
      description: 'Leaky faucet in kitchen',
    },
  });

  // Basic subscription row for landlord org
  await prisma.subscription.upsert({
    where: {
      organizationId: landlordOrg.id,
    },
    update: {
      plan: 'per-unit-basic',
      unitCount: 4,
      status: SubscriptionStatus.ACTIVE,
    },
    create: {
      organizationId: landlordOrg.id,
      plan: 'per-unit-basic',
      unitCount: 4,
      stripeSubscriptionId: null,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  // ── PM Org Users ──

  const pmAdmin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'admin@pm.local' } },
    update: { name: 'Paula PM', cognitoSub: 'dev-admin-pm', role: UserRole.OWNER },
    create: { organizationId: pmOrg.id, email: 'admin@pm.local', name: 'Paula PM', cognitoSub: 'dev-admin-pm', role: UserRole.OWNER },
  });

  const pmAlice = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'alice@pm.local' } },
    update: { name: 'Alice Manager', cognitoSub: 'dev-pm-alice', role: UserRole.OWNER },
    create: { organizationId: pmOrg.id, email: 'alice@pm.local', name: 'Alice Manager', cognitoSub: 'dev-pm-alice', role: UserRole.OWNER },
  });

  const pmBob = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'bob@pm.local' } },
    update: { name: 'Bob Manager', cognitoSub: 'dev-pm-bob', role: UserRole.OWNER },
    create: { organizationId: pmOrg.id, email: 'bob@pm.local', name: 'Bob Manager', cognitoSub: 'dev-pm-bob', role: UserRole.OWNER },
  });

  // OWNER with zero assignments — tests empty state
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'carol@pm.local' } },
    update: { name: 'Carol Manager', cognitoSub: 'dev-pm-carol', role: UserRole.OWNER },
    create: { organizationId: pmOrg.id, email: 'carol@pm.local', name: 'Carol Manager', cognitoSub: 'dev-pm-carol', role: UserRole.OWNER },
  });

  const pmOwner = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'owner@pm.local' } },
    update: { name: 'Oscar Owner', cognitoSub: 'dev-owner-pm', role: UserRole.OWNER },
    create: { organizationId: pmOrg.id, email: 'owner@pm.local', name: 'Oscar Owner', cognitoSub: 'dev-owner-pm', role: UserRole.OWNER },
  });

  const pmTenantUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: pmOrg.id, email: 'tenant@pm.local' } },
    update: { name: 'Tina Tenant', cognitoSub: 'dev-tenant-pm', role: UserRole.TENANT },
    create: { organizationId: pmOrg.id, email: 'tenant@pm.local', name: 'Tina Tenant', cognitoSub: 'dev-tenant-pm', role: UserRole.TENANT },
  });

  // ── PM Org Properties ──

  const pmProp1 = await prisma.property.create({
    data: {
      organizationId: pmOrg.id,
      name: 'Riverside Apartments',
      addressLine1: '100 River Rd',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
  });

  const pmProp2 = await prisma.property.create({
    data: {
      organizationId: pmOrg.id,
      name: 'Downtown Lofts',
      addressLine1: '200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78702',
      country: 'US',
    },
  });

  const pmProp3 = await prisma.property.create({
    data: {
      organizationId: pmOrg.id,
      name: 'Lakeside Villas',
      addressLine1: '300 Lake Shore Blvd',
      city: 'Austin',
      state: 'TX',
      postalCode: '78703',
      country: 'US',
    },
  });

  // ── Same-org UNASSIGNED property (tests assignment-based isolation) ──

  const pmPropUnassigned = await prisma.property.create({
    data: {
      organizationId: pmOrg.id,
      name: 'Hilltop Condos (Unassigned)',
      addressLine1: '400 Hilltop Dr',
      city: 'Austin',
      state: 'TX',
      postalCode: '78704',
      country: 'US',
    },
  });

  // Unit + lease on unassigned property — tests assignment-based isolation
  const unassignedUnit = await prisma.unit.create({
    data: {
      organizationId: pmOrg.id,
      propertyId: pmPropUnassigned.id,
      unitNumber: '4A',
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 600,
      rentAmount: 120_000,
    },
  });

  await prisma.lease.create({
    data: {
      organizationId: pmOrg.id,
      unitId: unassignedUnit.id,
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      rentAmount: 120_000,
      status: LeaseStatus.ACTIVE,
    },
  });

  // ── PM Assignments ──
  // Alice → prop1 + prop2, Bob → prop3, Carol → none
  // pmPropUnassigned → nobody (tests same-org-unassigned isolation)

  await prisma.managerPropertyAssignment.create({
    data: { organizationId: pmOrg.id, userId: pmAlice.id, propertyId: pmProp1.id, status: 'ACTIVE' },
  });
  await prisma.managerPropertyAssignment.create({
    data: { organizationId: pmOrg.id, userId: pmAlice.id, propertyId: pmProp2.id, status: 'ACTIVE' },
  });
  await prisma.managerPropertyAssignment.create({
    data: { organizationId: pmOrg.id, userId: pmBob.id, propertyId: pmProp3.id, status: 'ACTIVE' },
  });

  // ── PM Units (2 per property) ──

  const pmUnits = await Promise.all(
    [
      { propertyId: pmProp1.id, unitNumber: '1A', rent: 150_000 },
      { propertyId: pmProp1.id, unitNumber: '1B', rent: 160_000 },
      { propertyId: pmProp2.id, unitNumber: '2A', rent: 180_000 },
      { propertyId: pmProp2.id, unitNumber: '2B', rent: 175_000 },
      { propertyId: pmProp3.id, unitNumber: '3A', rent: 200_000 },
      { propertyId: pmProp3.id, unitNumber: '3B', rent: 195_000 },
    ].map((u) =>
      prisma.unit.create({
        data: {
          organizationId: pmOrg.id,
          propertyId: u.propertyId,
          unitNumber: u.unitNumber,
          bedrooms: 2,
          bathrooms: 1,
          squareFeet: 850,
          rentAmount: u.rent,
        },
      }),
    ),
  );

  // ── PM Leases (4 active, 2 vacant) ──

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(now.getFullYear() + 1);
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(now.getDate() + 30);

  const pmLeases = await Promise.all(
    [pmUnits[0], pmUnits[1], pmUnits[2], pmUnits[4]].map((unit, i) =>
      prisma.lease.create({
        data: {
          organizationId: pmOrg.id,
          unitId: unit.id,
          startDate: now,
          endDate: i === 0 ? thirtyDaysLater : oneYearLater, // first lease expires in 30 days → task
          rentAmount: unit.rentAmount,
          depositAmount: unit.rentAmount,
          status: LeaseStatus.ACTIVE,
        },
      }),
    ),
  );

  // ── PM Tenant Profile (linked to first lease) ──

  await prisma.tenantProfile.upsert({
    where: { userId: pmTenantUser.id },
    update: { leaseId: pmLeases[0].id, phone: '+1-512-555-0200' },
    create: { userId: pmTenantUser.id, leaseId: pmLeases[0].id, phone: '+1-512-555-0200' },
  });

  // ── PM Ledger Entries (mix of current and overdue) ──

  const pastDue = new Date(now);
  pastDue.setDate(now.getDate() - 15);

  await prisma.ledgerEntry.createMany({
    data: [
      { organizationId: pmOrg.id, leaseId: pmLeases[0].id, type: LedgerEntryType.CHARGE, amount: 150_000, dueDate: pastDue, description: 'March rent — 1A (overdue)' },
      { organizationId: pmOrg.id, leaseId: pmLeases[1].id, type: LedgerEntryType.CHARGE, amount: 160_000, dueDate: now, description: 'March rent — 1B' },
      { organizationId: pmOrg.id, leaseId: pmLeases[2].id, type: LedgerEntryType.CHARGE, amount: 180_000, dueDate: now, description: 'March rent — 2A' },
      { organizationId: pmOrg.id, leaseId: pmLeases[3].id, type: LedgerEntryType.CHARGE, amount: 200_000, dueDate: now, description: 'March rent — 3A' },
    ],
  });

  // ── PM Work Orders ──

  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(now.getDate() - 10);

  await prisma.workOrder.createMany({
    data: [
      { organizationId: pmOrg.id, unitId: pmUnits[0].id, createdByUserId: pmTenantUser.id, category: 'PLUMBING', priority: WorkOrderPriority.HIGH, status: WorkOrderStatus.OPEN, description: 'Leaking faucet in kitchen — Unit 1A' },
      { organizationId: pmOrg.id, unitId: pmUnits[2].id, createdByUserId: pmAlice.id, category: 'ELECTRICAL', priority: WorkOrderPriority.MEDIUM, status: WorkOrderStatus.IN_PROGRESS, description: 'Flickering lights hallway — Unit 2A' },
      { organizationId: pmOrg.id, unitId: pmUnits[4].id, createdByUserId: pmBob.id, category: 'GENERAL', priority: WorkOrderPriority.LOW, status: WorkOrderStatus.OPEN, description: 'Touch-up paint needed — Unit 3A' },
    ],
  });

  // ── PM Documents ──

  await prisma.document.createMany({
    data: [
      { organizationId: pmOrg.id, relatedType: 'PROPERTY', relatedId: pmProp1.id, name: 'Insurance Certificate.pdf', s3Key: `${pmOrg.id}/PROPERTY/${pmProp1.id}/insurance.pdf`, mimeType: 'application/pdf', createdByUserId: pmAdmin.id },
      { organizationId: pmOrg.id, relatedType: 'LEASE', relatedId: pmLeases[0].id, name: 'Lease Agreement — 1A.pdf', s3Key: `${pmOrg.id}/LEASE/${pmLeases[0].id}/lease.pdf`, mimeType: 'application/pdf', createdByUserId: pmAdmin.id },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('Seed data created (including PM org with assignments, properties, units, leases, work orders, documents)');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
