const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function normalizeDatabaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) throw new Error();
    return value;
  } catch {
    const scheme = /^(postgres(?:ql)?):\/\//i.exec(value);
    const credentialStart = scheme?.[0].length ?? -1;
    const credentialEnd = value.lastIndexOf('@');
    if (credentialStart < 0 || credentialEnd <= credentialStart) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
    }

    const credentials = value.slice(credentialStart, credentialEnd);
    const passwordSeparator = credentials.indexOf(':');
    if (passwordSeparator <= 0) {
      throw new Error('DATABASE_URL must include a username and password');
    }
    const username = credentials.slice(0, passwordSeparator);
    const rawPassword = credentials.slice(passwordSeparator + 1);
    let decodedPassword = rawPassword;
    try {
      decodedPassword = decodeURIComponent(rawPassword);
    } catch {
      // Treat malformed percent sequences as literal password characters.
    }

    const normalized = `${value.slice(0, credentialStart)}${username}:${encodeURIComponent(decodedPassword)}${value.slice(credentialEnd)}`;
    try {
      const parsed = new URL(normalized);
      if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) throw new Error();
      return normalized;
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
    }
  }
}

