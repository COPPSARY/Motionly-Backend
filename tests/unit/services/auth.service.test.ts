import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../apps/api/src/services/auth.service.js';

const identity = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'designer@example.com',
  emailVerified: true,
  displayName: 'Motion Designer',
  avatarUrl: null,
};

describe('AuthService authentication workflows', () => {
  it('normalizes the email and requests a confirmation redirect during sign-up', async () => {
    const provider = {
      signInWithPassword: vi.fn(),
      signUpWithPassword: vi.fn().mockResolvedValue({
        requiresVerification: true,
        identity: null,
        session: null,
      }),
      verifyEmailToken: vi.fn(),
      getGoogleAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      revokeSession: vi.fn(),
    };
    const service = new AuthService(
      provider,
      { provision: vi.fn() },
      { create: vi.fn(), revoke: vi.fn() },
      undefined,
      {
        emailVerificationRedirect: 'http://localhost:3000/v1/auth/verify',
        oauthCallbackUrl: 'http://localhost:3000/v1/auth/callback',
      },
    );

    const result = await service.signUpWithEmail(' NEW@EXAMPLE.COM ', 'secret123');

    expect(provider.signUpWithPassword).toHaveBeenCalledWith(
      'new@example.com',
      'secret123',
      'http://localhost:3000/v1/auth/verify',
    );
    expect(result).toEqual({ requiresVerification: true, identity: null, session: null });
  });

  it('provisions an account and creates an opaque session after email login', async () => {
    const provider = {
      signInWithPassword: vi.fn().mockResolvedValue({
        identity,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
      signUpWithPassword: vi.fn(),
      verifyEmailToken: vi.fn(),
      getGoogleAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      revokeSession: vi.fn(),
    };
    const accounts = { provision: vi.fn().mockResolvedValue(undefined) };
    const sessions = {
      create: vi.fn().mockResolvedValue({
        sessionToken: 'opaque-session',
        csrfToken: 'csrf-token',
      }),
      revoke: vi.fn(),
    };
    const service = new AuthService(provider, accounts, sessions);

    const result = await service.loginWithEmail('DESIGNER@example.com', 'secret123');

    expect(provider.signInWithPassword).toHaveBeenCalledWith(
      'designer@example.com',
      'secret123',
    );
    expect(accounts.provision).toHaveBeenCalledWith(identity);
    expect(sessions.create).toHaveBeenCalledWith(
      identity.id,
      'access',
      'refresh',
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(result).toEqual({
      identity,
      sessionToken: 'opaque-session',
      csrfToken: 'csrf-token',
    });
  });

  it('does not create an application session for an unverified email', async () => {
    const provider = {
      signInWithPassword: vi.fn().mockResolvedValue({
        identity: { ...identity, emailVerified: false },
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
      signUpWithPassword: vi.fn(),
      verifyEmailToken: vi.fn(),
      getGoogleAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      revokeSession: vi.fn(),
    };
    const accounts = { provision: vi.fn() };
    const sessions = { create: vi.fn(), revoke: vi.fn() };
    const service = new AuthService(provider, accounts, sessions);

    await expect(
      service.loginWithEmail('designer@example.com', 'secret123'),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('maps provider login failures to a generic authentication error', async () => {
    const provider = {
      signInWithPassword: vi.fn().mockRejectedValue(new Error('User does not exist')),
      signUpWithPassword: vi.fn(),
      verifyEmailToken: vi.fn(),
      getGoogleAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      revokeSession: vi.fn(),
    };
    const service = new AuthService(
      provider,
      { provision: vi.fn() },
      { create: vi.fn(), revoke: vi.fn() },
    );

    await expect(
      service.loginWithEmail('missing@example.com', 'secret123'),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('verifies an email token and creates an application session', async () => {
    const providerSession = {
      identity,
      accessToken: 'verified-access',
      refreshToken: 'verified-refresh',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };
    const provider = {
      signInWithPassword: vi.fn(),
      signUpWithPassword: vi.fn(),
      verifyEmailToken: vi.fn().mockResolvedValue(providerSession),
      getGoogleAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      revokeSession: vi.fn(),
    };
    const accounts = { provision: vi.fn().mockResolvedValue(undefined) };
    const sessions = {
      create: vi.fn().mockResolvedValue({ sessionToken: 'verified-session', csrfToken: 'verified-csrf' }),
      revoke: vi.fn(),
    };
    const service = new AuthService(provider, accounts, sessions);

    const result = await service.completeEmailVerification('confirmation-token-hash');

    expect(provider.verifyEmailToken).toHaveBeenCalledWith('confirmation-token-hash');
    expect(accounts.provision).toHaveBeenCalledWith(identity);
    expect(result).toEqual({
      identity,
      sessionToken: 'verified-session',
      csrfToken: 'verified-csrf',
    });
  });
});
