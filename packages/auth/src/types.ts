export interface AuthIdentity {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProviderSession {
  identity: AuthIdentity;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface SignUpResult {
  requiresVerification: boolean;
  identity: AuthIdentity | null;
  session: ProviderSession | null;
}

export interface AuthProvider {
  signUpWithPassword(email: string, password: string, redirectTo: string): Promise<SignUpResult>;
  signInWithPassword(email: string, password: string): Promise<ProviderSession>;
  exchangeEmailVerificationCode(code: string): Promise<ProviderSession>;
  getGoogleAuthorizationUrl(redirectTo: string): Promise<{ url: string; verifierState: string }>;
  exchangeCode(code: string, verifierState: string): Promise<ProviderSession>;
  revokeSession(accessToken: string): Promise<void>;
}
