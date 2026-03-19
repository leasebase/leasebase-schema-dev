import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/interfaces/current-user.interface';
import { OrganizationType, UserRole } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  AuthFlowType,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { LoginDto } from './dto/login.dto';
import { RegisterDto, SignupUserType } from './dto/register.dto';
import { AuthResponseDto, RegisterResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private cognitoClient: CognitoIdentityProviderClient;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const region = this.config.get<string>('COGNITO_REGION') || 'us-west-2';
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
  }

  private get devBypassEnabled(): boolean {
    return this.config.get<string>('DEV_AUTH_BYPASS') === 'true';
  }

  async getCurrentUserFromRequest(req: any): Promise<CurrentUser> {
    if (this.devBypassEnabled) {
      return this.handleDevBypass(req);
    }

    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    const payload = await this.verifyCognitoJwt(token);
    return this.mapPayloadToUser(payload);
  }

  private async handleDevBypass(req: any): Promise<CurrentUser> {
    const email = (req.headers['x-dev-user-email'] || '') as string;
    const roleHeader = (req.headers['x-dev-user-role'] || '') as string;
    const orgIdHeader = (req.headers['x-dev-org-id'] || '') as string;

    if (!email || !roleHeader || !orgIdHeader) {
      throw new UnauthorizedException(
        'DEV_AUTH_BYPASS enabled but dev headers are missing (x-dev-user-email, x-dev-user-role, x-dev-org-id)',
      );
    }

    const role = (roleHeader.toUpperCase() as UserRole) ?? UserRole.ORG_ADMIN;

    const org = await this.prisma.organization.upsert({
      where: { id: orgIdHeader },
      update: {},
      create: {
        id: orgIdHeader,
        type: OrganizationType.PM_COMPANY,
        name: `Dev Org ${orgIdHeader}`,
        plan: 'dev',
      },
    });

    const user = await this.prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: { role },
      create: {
        organizationId: org.id,
        email,
        name: email,
        role,
      },
    });

    return {
      id: user.id,
      orgId: org.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private async verifyCognitoJwt(token: string): Promise<JWTPayload> {
    const region = this.config.get<string>('COGNITO_REGION');
    const userPoolId = this.config.get<string>('COGNITO_USER_POOL_ID');
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');

    if (!region || !userPoolId || !clientId) {
      throw new UnauthorizedException('Cognito configuration is missing');
    }

    if (!this.jwks) {
      const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
      const jwksUri = new URL(`${issuer}/.well-known/jwks.json`);
      this.jwks = createRemoteJWKSet(jwksUri);
    }

    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

    const { payload } = await jwtVerify(token, this.jwks!, {
      issuer,
      audience: clientId,
    });

    return payload;
  }

  private async mapPayloadToUser(payload: JWTPayload): Promise<CurrentUser> {
    const sub = payload.sub as string | undefined;
    const email = (payload.email as string | undefined) ?? '';
    const orgIdClaim = (payload['custom:orgId'] as string | undefined) ?? '';
    // Do NOT default to TENANT — treat absent claim as "not provided".
    const roleClaim = payload['custom:role'] as string | undefined;

    if (!sub || !email || !orgIdClaim) {
      throw new UnauthorizedException('JWT is missing required claims');
    }

    // Only trust the JWT role when the claim is explicitly present.
    const jwtRole: UserRole | undefined = roleClaim
      ? (roleClaim.toUpperCase() as UserRole)
      : undefined;

    const org = await this.prisma.organization.findUnique({ where: { id: orgIdClaim } });
    if (!org) {
      throw new UnauthorizedException('Organization not found for token');
    }

    // Look up existing user first — DB is the source of truth for role.
    const existingUser = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: org.id, email } },
    });

    if (existingUser) {
      // Always sync cognitoSub; only overwrite role when the JWT claim is
      // explicitly present (i.e. a pre-token Lambda or admin-set attribute).
      const updateData: { cognitoSub: string; role?: UserRole } = { cognitoSub: sub };
      if (jwtRole) {
        updateData.role = jwtRole;
      }

      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: updateData,
      });

      return {
        id: user.id,
        orgId: org.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }

    // New user — use the JWT role if available. Fail closed if no role.
    if (!jwtRole) {
      throw new UnauthorizedException(
        'Unable to determine user role. Please contact support.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        name: email,
        cognitoSub: sub,
        role: jwtRole,
      },
    });

    return {
      id: user.id,
      orgId: org.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /**
   * Demo-login shortcut — only available when DEV_AUTH_BYPASS is enabled.
   * Looks up the pre-seeded demo org (`demo-owner-org`) and returns the
   * matching demo user without requiring Cognito.
   */
  async demoLogin(role: 'OWNER' | 'ORG_ADMIN'): Promise<CurrentUser> {
    if (!this.devBypassEnabled) {
      throw new BadRequestException('Demo login is not available in this environment');
    }

    const DEMO_ORG_ID = 'demo-owner-org';
    const DEMO_EMAIL_DOMAIN = '@demo.leasebase.local';

    const emailPrefix = role === 'OWNER' ? 'owner' : 'admin';
    const email = `${emailPrefix}${DEMO_EMAIL_DOMAIN}`;

    const org = await this.prisma.organization.findUnique({ where: { id: DEMO_ORG_ID } });
    if (!org) {
      throw new BadRequestException(
        'Demo org not found. Run: ALLOW_DEMO_RESET=true npm run seed:demo-owner',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: org.id, email } },
    });
    if (!user) {
      throw new BadRequestException(
        `Demo user ${email} not found. Run: ALLOW_DEMO_RESET=true npm run seed:demo-owner`,
      );
    }

    return {
      id: user.id,
      orgId: org.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Cognito client ID is not configured');
    }

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: clientId,
        AuthParameters: {
          USERNAME: dto.email,
          PASSWORD: dto.password,
        },
      });

      const response = await this.cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new UnauthorizedException('Authentication failed');
      }

      return {
        accessToken: response.AuthenticationResult.AccessToken!,
        idToken: response.AuthenticationResult.IdToken!,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn ?? 3600,
      };
    } catch (error: any) {
      if (error.name === 'NotAuthorizedException') {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (error.name === 'UserNotConfirmedException') {
        throw new BadRequestException('Please verify your email before logging in');
      }
      if (error.name === 'UserNotFoundException') {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw error;
    }
  }

  /**
   * Map UI signup userType to the internal application role.
   */
  private mapUserTypeToRole(userType: SignupUserType): UserRole {
    switch (userType) {
      case SignupUserType.OWNER:            return UserRole.OWNER;
      case SignupUserType.PROPERTY_MANAGER: return UserRole.ORG_ADMIN;
      default:
        throw new BadRequestException(`Unsupported signup user type: ${userType}`);
    }
  }

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Cognito client ID is not configured');
    }

    const userType = dto.userType ?? SignupUserType.OWNER;

    // Reject tenant self-registration — tenants must be invited.
    if ((userType as string).toUpperCase() === 'TENANT') {
      throw new BadRequestException(
        'Tenants must be invited by a property owner or manager.',
      );
    }

    const appRole = this.mapUserTypeToRole(userType);

    try {
      // 1. Create Cognito user with custom:role attribute
      const command = new SignUpCommand({
        ClientId: clientId,
        Username: dto.email,
        Password: dto.password,
        UserAttributes: [
          { Name: 'email', Value: dto.email },
          { Name: 'given_name', Value: dto.firstName },
          { Name: 'family_name', Value: dto.lastName },
          { Name: 'custom:role', Value: appRole },
        ],
      });

      const response = await this.cognitoClient.send(command);
      const cognitoSub = response.UserSub ?? '';

      // 2. Bootstrap Org + User + Subscription for OWNER / PM signups.
      //    Tenant org/user records are created when a PM invites them.
      if (cognitoSub) {
        try {
          const orgType = userType === SignupUserType.PROPERTY_MANAGER
            ? OrganizationType.PM_COMPANY
            : OrganizationType.LANDLORD;
          const fullName = `${dto.firstName} ${dto.lastName}`.trim();

          const org = await this.prisma.organization.create({
            data: {
              type: orgType,
              name: `${fullName}'s Organization`,
              plan: 'basic',
            },
          });

          await this.prisma.user.create({
            data: {
              organizationId: org.id,
              email: dto.email,
              name: fullName,
              cognitoSub,
              role: appRole,
            },
          });

          await this.prisma.subscription.create({
            data: {
              organizationId: org.id,
              plan: 'basic',
              unitCount: 0,
              status: 'ACTIVE',
            },
          });
        } catch (bootstrapErr) {
          // Cognito user exists — log but don't fail registration.
          // The /me first-login upsert can recover.
          console.error('Registration bootstrap failed', bootstrapErr);
        }
      }

      return {
        userConfirmed: response.UserConfirmed ?? false,
        userSub: cognitoSub,
        message: response.UserConfirmed
          ? 'Registration successful. You can now log in to Leasebase.'
          : 'Registration successful. Please check your email for a Leasebase verification code.',
      };
    } catch (error: any) {
      if (error.name === 'UsernameExistsException') {
        throw new BadRequestException('An account with this email already exists');
      }
      if (error.name === 'InvalidPasswordException') {
        throw new BadRequestException('Password does not meet requirements');
      }
      if (error.name === 'InvalidParameterException') {
        throw new BadRequestException(error.message || 'Invalid registration data');
      }
      throw error;
    }
  }

  async confirmEmail(email: string, code: string): Promise<{ message: string }> {
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Cognito client ID is not configured');
    }

    try {
      const command = new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: code,
      });

      await this.cognitoClient.send(command);

      return {
        message: 'Your email has been verified. You can now sign in to Leasebase.',
      };
    } catch (error: any) {
      if (error.name === 'CodeMismatchException') {
        throw new BadRequestException('The verification code is incorrect. Please try again.');
      }
      if (error.name === 'ExpiredCodeException') {
        throw new BadRequestException('The verification code has expired. Please request a new code.');
      }
      if (error.name === 'UserNotFoundException') {
        throw new BadRequestException('No account was found for this email.');
      }
      if (error.name === 'NotAuthorizedException') {
        throw new BadRequestException('This email is already verified. You can sign in.');
      }
      throw error;
    }
  }

  async resendConfirmationCode(email: string): Promise<{ message: string }> {
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Cognito client ID is not configured');
    }

    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: email,
      });

      await this.cognitoClient.send(command);

      return {
        message: 'We have sent a new Leasebase verification code to your email.',
      };
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        throw new BadRequestException('No account was found for this email.');
      }
      if (error.name === 'InvalidParameterException') {
        throw new BadRequestException(error.message || 'Unable to resend verification code.');
      }
      if (error.name === 'NotAuthorizedException') {
        throw new BadRequestException('This email is already verified. You can sign in.');
      }
      throw error;
    }
  }
}
