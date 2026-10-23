import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, usePageTitle } from '../../components/ui';
import { api } from '../../lib/api';

export default function Login() {
  usePageTitle('Entrar');
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await api('/auth/login', { body: { email: f.get('email'), password: f.get('password') } });
      nav('/admin', { replace: true });
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="narrow page-head" style={{ maxWidth: 440 }}>
      <form className="card stack" onSubmit={submit}>
        <img src="/logo.webp" alt="Studio das Tranças" width="140" height="139" style={{ margin: '0 auto', width: 140 }} />
        <h1 className="title-line center" style={{ fontSize: '1.9rem' }}>Painel</h1>
        <label className="field"><span>E-mail</span><input className="input" name="email" type="email" autoComplete="username" required /></label>
        <label className="field"><span>Senha</span><input className="input" name="password" type="password" autoComplete="current-password" required /></label>
        {error && <Alert kind="danger">{error}</Alert>}
        <button className="btn block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
