import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { AuthIdentity, AuthProvider, ProviderSession, SignUpResult } from './types.js';

class MemoryStorage {
  constructor(private readonly values = new Map<string, string>()) {}
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  serialize() { return JSON.stringify(Object.fromEntries(this.values)); }
  static deserialize(value: string) { return new MemoryStorage(new Map(Object.entries(JSON.parse(value) as Record<string, string>))); }
}

function identityFromUser(user: User): AuthIdentity {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error('Supabase user did not include an email address');
  return {
    id: user.id,
    email,
    emailVerified: Boolean(user.email_confirmed_at),
    displayName: String(user.user_metadata.full_name ?? user.user_metadata.name ?? email.split('@')[0]),
    avatarUrl: typeof user.user_metadata.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
  };
}

function providerSession(session: Session): ProviderSession {
  return {
    identity: identityFromUser(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000),
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  private readonly client: SupabaseClient;

  constructor(private readonly url: string, private readonly publishableKey: string) {
    this.client = this.createClient();
  }

  private createClient(storage?: MemoryStorage) {
    return createClient(this.url, this.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: Boolean(storage),
        flowType: 'pkce',
        ...(storage ? { storage } : {}),
      },
    });
  }

  async signUpWithPassword(email: string, password: string, redirectTo: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    return {
      requiresVerification: !data.session,
      identity: data.user ? identityFromUser(data.user) : null,
      session: data.session ? providerSession(data.session) : null,
    };
  }

  async signInWithPassword(email: string, password: string): Promise<ProviderSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new Error('Supabase did not return a session');
    return providerSession(data.session);
  }

  async exchangeEmailVerificationCode(code: string): Promise<ProviderSession> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw error ?? new Error('Supabase did not return a session');
    return providerSession(data.session);
  }

  async getGoogleAuthorizationUrl(redirectTo: string) {
    const storage = new MemoryStorage();
    const client = this.createClient(storage);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    return { url: data.url, verifierState: storage.serialize() };
  }

  async exchangeCode(code: string, verifierState: string): Promise<ProviderSession> {
    const storage = MemoryStorage.deserialize(verifierState);
    const client = this.createClient(storage);
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw error ?? new Error('Supabase did not return a session');
    return providerSession(data.session);
  }

  async revokeSession(accessToken: string): Promise<void> {
    const response = await fetch(`${this.url}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: this.publishableKey, authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 401) throw new Error('Unable to revoke Supabase session');
  }
}
