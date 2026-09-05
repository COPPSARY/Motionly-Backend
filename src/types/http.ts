import type { Request } from 'express';

import type { AuthIdentity } from '../../packages/auth/types.js';

export interface Principal {
  user: AuthIdentity;
  csrfToken: string;
}

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

export interface SessionResolver {
  resolve(sessionToken: string): Promise<Principal | null>;
}

