import { z } from 'zod';

import { normalizeDatabaseUrl } from '../../../../packages/database/src/connection-url.js';

const booleanString = z.enum(['true', 'false']).optional().transform((value) => (value ?? 'false') === 'true');
const logLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  API_PUBLIC_URL: z.url(),
  FRONTEND_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    { message: 'SESSION_ENCRYPTION_KEY must encode exactly 32 bytes' },
  ),
  SESSION_COOKIE_SECURE: booleanString,
  LOG_LEVEL: logLevel,
  AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic', 'openai-compatible']).default('gemini'),
  AI_MODEL: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-pro'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().min(1).optional(),
  OPENAI_COMPATIBLE_BASE_URL: z.url().optional(),
  GENERATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  GENERATION_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(100).default(3),
  GENERATION_JOB_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(7_200).default(900),
  GENERATION_WORKSPACE_ROOT: z.string().min(1).default('./tmp/generations'),
  GENERATION_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  GENERATION_LEASE_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
  SANDBOX_IMAGE: z.string().min(1).default('motionly-renderer:local'),
  OBJECT_STORAGE_LOCAL_ROOT: z.string().min(1).default('./data/objects'),
});

export function parseEnvironment(source: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = schema.parse(source);
  if (parsed.NODE_ENV === 'production' && !parsed.SESSION_COOKIE_SECURE) {
    throw new Error('SESSION_COOKIE_SECURE must be true in production');
  }
  const frontendOrigins = parsed.FRONTEND_ORIGINS.split(',').map((origin) => {
    const normalized = origin.trim().replace(/\/$/, '');
    return new URL(normalized).origin;
  });
  return {
    nodeEnv: parsed.NODE_ENV,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    apiPublicUrl: parsed.API_PUBLIC_URL.replace(/\/$/, ''),
    frontendOrigins,
    databaseUrl: parsed.DATABASE_URL,
    supabaseUrl: deriveSupabaseUrl(parsed.DATABASE_URL),
    supabasePublishableKey: parsed.SUPABASE_PUBLISHABLE_KEY,
    sessionEncryptionKey: parsed.SESSION_ENCRYPTION_KEY,
    secureCookies: parsed.SESSION_COOKIE_SECURE,
    logLevel: parsed.LOG_LEVEL,
    aiProvider: parsed.AI_PROVIDER,
    aiModel: parsed.AI_MODEL ?? parsed.GEMINI_MODEL,
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiModel: parsed.GEMINI_MODEL,
    openAiApiKey: parsed.OPENAI_API_KEY,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    openAiCompatibleApiKey: parsed.OPENAI_COMPATIBLE_API_KEY,
    openAiCompatibleBaseUrl: parsed.OPENAI_COMPATIBLE_BASE_URL,
    generationMaxAttempts: parsed.GENERATION_MAX_ATTEMPTS,
    generationMaxActivePerUser: parsed.GENERATION_MAX_ACTIVE_PER_USER,
    generationJobTimeoutSeconds: parsed.GENERATION_JOB_TIMEOUT_SECONDS,
    generationWorkspaceRoot: parsed.GENERATION_WORKSPACE_ROOT,
    generationWorkerPollMs: parsed.GENERATION_WORKER_POLL_MS,
    generationLeaseMs: parsed.GENERATION_LEASE_MS,
    sandboxImage: parsed.SANDBOX_IMAGE,
    objectStorageLocalRoot: parsed.OBJECT_STORAGE_LOCAL_ROOT,
  };
}

function deriveSupabaseUrl(databaseUrl: string): string {
  const connection = new URL(normalizeDatabaseUrl(databaseUrl));
  const directMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(connection.hostname);
  if (directMatch?.[1]) return `https://${directMatch[1]}.supabase.co`;

  if (connection.hostname.endsWith('.pooler.supabase.com')) {
    const poolerUserMatch = /^postgres\.([a-z0-9-]+)$/i.exec(decodeURIComponent(connection.username));
    if (poolerUserMatch?.[1]) return `https://${poolerUserMatch[1]}.supabase.co`;
  }

  throw new Error('DATABASE_URL must be a Supabase direct or session-pooler connection string');
}

export type Environment = ReturnType<typeof parseEnvironment>;
