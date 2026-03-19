/**
 * backfill-broken-users.ts
 *
 * Remediation script for users who registered before the persona-routing fix.
 * These users have Cognito accounts but no DB User/Organization/Subscription
 * records and no custom:role attribute in Cognito.
 *
 * Usage:
 *   # Phase 1: Audit — identify affected users (read-only)
 *   npx ts-node --project tsconfig.json scripts/backfill-broken-users.ts audit
 *
 *   # Phase 2: Remediate — apply role assignments from a reviewed JSON file
 *   npx ts-node --project tsconfig.json scripts/backfill-broken-users.ts remediate --input assignments.json
 *
 * Audit outputs `orphan-users.json` — each entry contains:
 *   { email, cognitoSub, givenName, familyName, createdAt, customRole }
 *
 * An admin reviews the file, adds a "role" field to each entry
 * (OWNER | ORG_ADMIN | TENANT), then saves as `assignments.json`.
 *
 * Remediate reads the assignments file and for each non-TENANT entry:
 *   1. Creates an Organization (LANDLORD for OWNER, PM_COMPANY for ORG_ADMIN)
 *   2. Creates a User record with the correct role + cognitoSub
 *   3. Creates a Subscription (basic plan)
 *   4. Updates the Cognito custom:role attribute
 *
 * TENANT entries are skipped — tenant DB records are created when a PM
 * invites them to a lease, not during self-registration.
 *
 * Required environment variables:
 *   DATABASE_URL         — PostgreSQL connection string
 *   COGNITO_REGION       — AWS region (default: us-west-2)
 *   COGNITO_USER_POOL_ID — Cognito User Pool ID
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  PrismaClient,
  OrganizationType,
  UserRole,
  SubscriptionStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COGNITO_REGION = process.env.COGNITO_REGION || 'us-west-2';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

const cognito = new CognitoIdentityProviderClient({ region: COGNITO_REGION });
const prisma = new PrismaClient();

const AUDIT_OUTPUT = 'orphan-users.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attr(attrs: AttributeType[] | undefined, name: string): string {
  return attrs?.find((a) => a.Name === name)?.Value ?? '';
}

function roleToOrgType(role: UserRole): OrganizationType {
  switch (role) {
    case UserRole.OWNER:
      return OrganizationType.LANDLORD;
    case UserRole.ORG_ADMIN:
      return OrganizationType.PM_COMPANY;
    default:
      throw new Error(`No org type mapping for role ${role}`);
  }
}

interface OrphanUser {
  email: string;
  cognitoSub: string;
  givenName: string;
  familyName: string;
  createdAt: string;
  customRole: string; // existing custom:role value, likely empty
}

interface Assignment extends OrphanUser {
  role: string; // admin-assigned: OWNER | ORG_ADMIN | TENANT
}

// ---------------------------------------------------------------------------
// Phase 1: Audit
// ---------------------------------------------------------------------------

async function audit(): Promise<void> {
  if (!USER_POOL_ID) {
    console.error('ERROR: COGNITO_USER_POOL_ID is required');
    process.exit(1);
  }

  console.log('=== Phase 1: Audit — identifying orphan users ===\n');

  // 1. Paginate through all Cognito users
  const cognitoUsers: OrphanUser[] = [];
  let paginationToken: string | undefined;

  do {
    const resp = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60, // max per page
        PaginationToken: paginationToken,
      }),
    );

    for (const user of resp.Users ?? []) {
      cognitoUsers.push({
        email: attr(user.Attributes, 'email'),
        cognitoSub: attr(user.Attributes, 'sub'),
        givenName: attr(user.Attributes, 'given_name'),
        familyName: attr(user.Attributes, 'family_name'),
        createdAt: user.UserCreateDate?.toISOString() ?? '',
        customRole: attr(user.Attributes, 'custom:role'),
      });
    }

    paginationToken = resp.PaginationToken;
  } while (paginationToken);

  console.log(`Found ${cognitoUsers.length} total Cognito users.`);

  // 2. Find orphans — Cognito users with no matching DB User record
  const orphans: OrphanUser[] = [];

  for (const cu of cognitoUsers) {
    if (!cu.cognitoSub) continue;

    const dbUser = await prisma.user.findUnique({
      where: { cognitoSub: cu.cognitoSub },
      select: { id: true },
    });

    if (!dbUser) {
      orphans.push(cu);
    }
  }

  console.log(`Found ${orphans.length} orphan users (Cognito account, no DB record).\n`);

  if (orphans.length === 0) {
    console.log('No remediation needed — all Cognito users have DB records.');
    return;
  }

  // 3. Separate: users who already have custom:role vs those without
  const withRole = orphans.filter((o) => o.customRole);
  const withoutRole = orphans.filter((o) => !o.customRole);

  console.log(`  ${withRole.length} orphans already have custom:role in Cognito`);
  console.log(`  ${withoutRole.length} orphans have NO custom:role (pre-fix registrations)\n`);

  // 4. Write output
  const outputPath = path.resolve(AUDIT_OUTPUT);
  fs.writeFileSync(outputPath, JSON.stringify(orphans, null, 2));
  console.log(`Orphan user list written to: ${outputPath}`);
  console.log(
    '\nNext steps:\n' +
      '  1. Review the file and add a "role" field to each entry:\n' +
      '     OWNER | ORG_ADMIN | TENANT\n' +
      '  2. Save as assignments.json\n' +
      '  3. Run: npx ts-node --project tsconfig.json scripts/backfill-broken-users.ts remediate --input assignments.json\n',
  );
}

// ---------------------------------------------------------------------------
// Phase 2: Remediate
// ---------------------------------------------------------------------------

async function remediate(inputPath: string): Promise<void> {
  if (!USER_POOL_ID) {
    console.error('ERROR: COGNITO_USER_POOL_ID is required');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`ERROR: Input file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const assignments: Assignment[] = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  console.log(`=== Phase 2: Remediate — processing ${assignments.length} assignments ===\n`);

  const validRoles = new Set(['OWNER', 'ORG_ADMIN', 'TENANT']);
  let created = 0;
  let skippedTenant = 0;
  let skippedExists = 0;
  let skippedInvalid = 0;
  let errors = 0;

  for (const entry of assignments) {
    const { email, cognitoSub, givenName, familyName, role } = entry;
    const label = `${email} (${cognitoSub})`;

    // --- Validation ---
    if (!role) {
      console.warn(`SKIP (no role assigned): ${label}`);
      skippedInvalid++;
      continue;
    }

    const normalizedRole = role.toUpperCase();
    if (!validRoles.has(normalizedRole)) {
      console.warn(`SKIP (invalid role "${role}"): ${label}`);
      skippedInvalid++;
      continue;
    }

    if (normalizedRole === 'TENANT') {
      console.log(`SKIP (TENANT — records created via PM invitation): ${label}`);
      skippedTenant++;
      continue;
    }

    // --- Safety check: ensure no DB record already exists ---
    const existing = await prisma.user.findUnique({
      where: { cognitoSub },
      select: { id: true },
    });

    if (existing) {
      console.log(`SKIP (DB record already exists): ${label}`);
      skippedExists++;
      continue;
    }

    // --- Create Org + User + Subscription ---
    const userRole = normalizedRole as UserRole;
    const orgType = roleToOrgType(userRole);
    const fullName = `${givenName} ${familyName}`.trim() || email;

    try {
      await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            type: orgType,
            name: `${fullName}'s Organization`,
            plan: 'basic',
          },
        });

        await tx.user.create({
          data: {
            organizationId: org.id,
            email,
            name: fullName,
            cognitoSub,
            role: userRole,
            status: 'ACTIVE',
          },
        });

        await tx.subscription.create({
          data: {
            organizationId: org.id,
            plan: 'basic',
            unitCount: 0,
            status: SubscriptionStatus.ACTIVE,
          },
        });

        console.log(`CREATED: ${label} → role=${userRole}, orgType=${orgType}, orgId=${org.id}`);
      });

      // --- Update Cognito custom:role ---
      try {
        await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            UserAttributes: [{ Name: 'custom:role', Value: userRole }],
          }),
        );
        console.log(`  Cognito custom:role updated for ${email}`);
      } catch (cognitoErr) {
        console.error(`  WARNING: DB records created but Cognito update failed for ${email}:`, cognitoErr);
        console.error(`  Manual fix: aws cognito-idp admin-update-user-attributes --user-pool-id ${USER_POOL_ID} --username ${email} --user-attributes Name=custom:role,Value=${userRole}`);
      }

      created++;
    } catch (err) {
      console.error(`ERROR creating records for ${label}:`, err);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Created:         ${created}`);
  console.log(`  Skipped (TENANT): ${skippedTenant}`);
  console.log(`  Skipped (exists): ${skippedExists}`);
  console.log(`  Skipped (invalid): ${skippedInvalid}`);
  console.log(`  Errors:          ${errors}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'audit':
        await audit();
        break;

      case 'remediate': {
        const inputIdx = args.indexOf('--input');
        if (inputIdx === -1 || !args[inputIdx + 1]) {
          console.error('Usage: ... remediate --input <assignments.json>');
          process.exit(1);
        }
        await remediate(args[inputIdx + 1]);
        break;
      }

      default:
        console.error(
          'Usage:\n' +
            '  npx ts-node --project tsconfig.json scripts/backfill-broken-users.ts audit\n' +
            '  npx ts-node --project tsconfig.json scripts/backfill-broken-users.ts remediate --input assignments.json',
        );
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
