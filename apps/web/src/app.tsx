import { FormEvent, useEffect, useState } from 'react';

type ApiResult = { status: number; body: unknown };
type User = { email: string; displayName: string };

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function request(path: string, options: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep response text */ }
  return { status: response.status, body };
}

export function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('verified')) return;
    void request('/v1/auth/me').then((response) => {
      setResult(response);
      const data = response.body as { data?: { user?: User; csrfToken?: string } };
      if (data.data?.user) setUser(data.data.user);
      if (data.data?.csrfToken) setCsrfToken(data.data.csrfToken);
      window.history.replaceState({}, '', window.location.pathname);
    });
  }, []);

  const submit = async (path: '/v1/auth/sign-up' | '/v1/auth/login') => {
    setBusy(true);
    const response = await request(path, { method: 'POST', body: JSON.stringify({ email, password }) });
    setResult(response);
    const token = (response.body as { data?: { csrfToken?: string } })?.data?.csrfToken;
    if (token) setCsrfToken(token);
    const user = (response.body as { data?: { user?: User } })?.data?.user;
    if (user) setUser(user);
    if (path === '/v1/auth/sign-up' && response.status === 202) {
      setVerificationNotice('Account created. Check your email and verify your account before logging in.');
    } else if (path === '/v1/auth/login') {
      setVerificationNotice(null);
    }
    setBusy(false);
  };

  const handleSubmit = (path: '/v1/auth/sign-up' | '/v1/auth/login') => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(path);
  };

  const action = async (path: string, method = 'GET', useCsrf = false) => {
    setBusy(true);
    const response = await request(path, { method, headers: useCsrf ? { 'x-csrf-token': csrfToken } : undefined });
    setResult(response);
    const token = (response.body as { data?: { csrfToken?: string } })?.data?.csrfToken;
    if (token) setCsrfToken(token);
    const user = (response.body as { data?: { user?: User } })?.data?.user;
    if (user) setUser(user);
    if (path === '/v1/auth/logout' && response.status === 204) setUser(null);
    setBusy(false);
  };

  return (
    <main>
      <section className="shell" aria-labelledby="title">
        <header>
          <span className="mark">M</span>
          <div><p className="eyebrow">MOTIONLY / DEVELOPMENT</p><h1 id="title">Auth tester</h1></div>
          <code>{apiBase}</code>
        </header>

        {user && <p className="verified" role="status">Signed in as <strong>{user.displayName || user.email}</strong></p>}
        {verificationNotice && <p className="notice" role="status">{verificationNotice}</p>}

        <div className="forms">
          <form onSubmit={handleSubmit('/v1/auth/sign-up')}>
            <h2>Create account</h2>
            <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" /></label>
            <button disabled={busy}>Sign up</button>
          </form>

          <form onSubmit={handleSubmit('/v1/auth/login')}>
            <h2>Sign in</h2>
            <p>Use the same email and password. Login sets secure session cookies.</p>
            <button disabled={busy}>Login</button>
            <a href={`${apiBase}/v1/auth/google`}>Continue with Google <span>↗</span></a>
          </form>
        </div>

        <section className="session" aria-label="Session controls">
          <h2>Session</h2>
          <div className="controls">
            <button type="button" onClick={() => void action('/v1/auth/me')} disabled={busy}>Check /me</button>
            <button type="button" className="danger" onClick={() => void action('/v1/auth/logout', 'POST', true)} disabled={busy}>Logout</button>
          </div>
          <small>CSRF token: {csrfToken ? 'available' : 'not loaded'}</small>
        </section>

        <output aria-live="polite">
          <span>Last API response</span>
          <pre>{result ? `${result.status}\n${JSON.stringify(result.body, null, 2)}` : 'No request made yet.'}</pre>
        </output>
      </section>
    </main>
  );
}
