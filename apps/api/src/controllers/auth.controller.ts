import type { Response } from 'express';
import { z } from 'zod';

import { CSRF_COOKIE, SESSION_COOKIE } from '../middleware/authentication.js';
import type { AuthIdentity } from '../../../../packages/auth/src/types.js';
import type { AuthenticatedRequest } from '../types/http.js';

const credentialsSchema = z.object({ email: z.email().max(320), password: z.string().min(8).max(128) });

export interface AuthControllerService {
  signUpWithEmail(email: string, password: string): Promise<unknown>;
  loginWithEmail(email: string, password: string): Promise<{ identity: AuthIdentity; sessionToken: string; csrfToken: string }>;
  completeEmailVerification(code: string): Promise<{ identity: AuthIdentity; sessionToken: string; csrfToken: string }>;
  beginGoogleLogin(): Promise<{ url: string }>;
  completeGoogleLogin(code: string, attempt: string): Promise<{ identity: AuthIdentity; sessionToken: string; csrfToken: string }>;
  logout(sessionToken: string): Promise<void>;
}

export class AuthController {
  constructor(
    private readonly auth: AuthControllerService,
    private readonly frontendOrigin: string,
    private readonly secureCookies: boolean,
  ) {}

  signUp = async (request: AuthenticatedRequest, response: Response) => {
    const input = credentialsSchema.parse(request.body);
    await this.auth.signUpWithEmail(input.email, input.password);
    response.status(202).json({ data: { verificationRequired: true } });
  };

  login = async (request: AuthenticatedRequest, response: Response) => {
    const input = credentialsSchema.parse(request.body);
    const result = await this.auth.loginWithEmail(input.email, input.password);
    this.setSessionCookies(response, result.sessionToken, result.csrfToken);
    response.json({ data: { user: result.identity, csrfToken: result.csrfToken } });
  };

  verifyEmail = async (request: AuthenticatedRequest, response: Response) => {
    const query = z.object({ code: z.string().uuid() }).parse(request.query);
    const result = await this.auth.completeEmailVerification(query.code);
    this.setSessionCookies(response, result.sessionToken, result.csrfToken);
    response.redirect(302, new URL('/?verified=true', this.frontendOrigin).toString());
  };

  google = async (_request: AuthenticatedRequest, response: Response) => {
    response.redirect(302, (await this.auth.beginGoogleLogin()).url);
  };

  callback = async (request: AuthenticatedRequest, response: Response) => {
    const query = z.object({ code: z.string().min(1), attempt: z.string().min(1) }).parse(request.query);
    const result = await this.auth.completeGoogleLogin(query.code, query.attempt);
    this.setSessionCookies(response, result.sessionToken, result.csrfToken);
    response.redirect(302, this.frontendOrigin);
  };

  me = async (request: AuthenticatedRequest, response: Response) => {
    response.json({
      data: {
        user: request.principal!.user,
        csrfToken: request.principal!.csrfToken,
      },
    });
  };

  logout = async (request: AuthenticatedRequest, response: Response) => {
    await this.auth.logout(request.cookies[SESSION_COOKIE] as string);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.clearCookie(CSRF_COOKIE, { path: '/' });
    response.status(204).end();
  };

  private setSessionCookies(response: Response, sessionToken: string, csrfToken: string) {
    const common = { secure: this.secureCookies, sameSite: 'lax' as const, path: '/' };
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    response.cookie(SESSION_COOKIE, sessionToken, { ...common, httpOnly: true, maxAge });
    response.cookie(CSRF_COOKIE, csrfToken, { ...common, httpOnly: false, maxAge });
  }
}
