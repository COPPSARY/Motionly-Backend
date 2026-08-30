import type { AuthIdentity, AuthProvider } from '../../../../packages/auth/src/types.js';
import { AppError } from '../errors.js';
import { randomBytes } from 'node:crypto';

export interface AccountProvisioner {
  provision(identity: AuthIdentity): Promise<void>;
}

export interface SessionCreator {
  create(
    userId: string,
    accessToken: string,
    refreshToken: string,
    providerExpiresAt: Date,
  ): Promise<{ sessionToken: string; csrfToken: string }>;
  revoke(sessionToken: string): Promise<void>;
}

export interface AuthFlowStore {
  create(attemptToken: string, verifierState: string): Promise<void>;
  consume(attemptToken: string): Promise<string | null>;
}

interface AuthServiceOptions {
  emailVerificationRedirect: string;
  oauthCallbackUrl: string;
}

export class AuthService {
  constructor(
    private readonly provider: AuthProvider,
    private readonly accounts: AccountProvisioner,
    private readonly sessions: SessionCreator,
    private readonly flows?: AuthFlowStore,
    private readonly options?: AuthServiceOptions,
  ) {}

  async signUpWithEmail(email: string, password: string) {
    if (!this.options) throw new Error('Auth service redirect URLs are not configured');
    return this.provider.signUpWithPassword(
      email.trim().toLowerCase(),
      password,
      this.options.emailVerificationRedirect,
    );
  }

  async loginWithEmail(email: string, password: string) {
    try {
      const providerSession = await this.provider.signInWithPassword(email.trim().toLowerCase(), password);
      return this.completeLogin(providerSession);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }
  }

  async completeEmailVerification(tokenHash: string) {
    try {
      return await this.completeLogin(await this.provider.verifyEmailToken(tokenHash));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'EMAIL_VERIFICATION_INVALID', 'The verification link is invalid or expired.');
    }
  }

  async completeLogin(providerSession: Awaited<ReturnType<AuthProvider['signInWithPassword']>>) {
    if (!providerSession.identity.emailVerified) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
    }
    await this.accounts.provision(providerSession.identity);
    const session = await this.sessions.create(
      providerSession.identity.id,
      providerSession.accessToken,
      providerSession.refreshToken,
      providerSession.expiresAt,
    );
    return { identity: providerSession.identity, ...session };
  }

  async beginGoogleLogin() {
    if (!this.options || !this.flows) throw new Error('OAuth flow storage is not configured');
    const attempt = randomBytes(32).toString('base64url');
    const separator = this.options.oauthCallbackUrl.includes('?') ? '&' : '?';
    const redirectTo = `${this.options.oauthCallbackUrl}${separator}attempt=${encodeURIComponent(attempt)}`;
    const result = await this.provider.getGoogleAuthorizationUrl(redirectTo);
    await this.flows.create(attempt, result.verifierState);
    return { url: result.url };
  }

  async completeGoogleLogin(code: string, attempt: string) {
    if (!this.flows) throw new Error('OAuth flow storage is not configured');
    const verifierState = await this.flows.consume(attempt);
    if (!verifierState) throw new AppError(400, 'OAUTH_ATTEMPT_INVALID', 'The login attempt is invalid or expired.');
    return this.completeLogin(await this.provider.exchangeCode(code, verifierState));
  }

  async logout(sessionToken: string) {
    await this.sessions.revoke(sessionToken);
  }
}
