import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookingStatus, lastBooking } from '../components/Booking';
import { Alert, usePageTitle } from '../components/ui';
import { api, type Booking } from '../lib/api';

export default function MinhaSolicitacao() {
  usePageTitle('Minha solicitação');
  const [params] = useSearchParams();
  const saved = lastBooking.get();
  const fromLink = params.get('codigo');
  const [code, setCode] = useState(fromLink ?? saved?.code ?? '');
  const [phone, setPhone] = useState(saved && (!fromLink || fromLink === saved.code) ? saved.phone : '');
  const [b, setB] = useState<Booking>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<Booking>(`/bookings/${encodeURIComponent(code.trim().toUpperCase())}?phone=${encodeURIComponent(phone)}`);
      setB(r);
      lastBooking.set({ code: r.code, phone });
    } catch (err: any) { setError(err.message); setB(undefined); } finally { setBusy(false); }
  }
  useEffect(() => { if (code && phone) find(); }, []);

  return (
    <div className="narrow page-head stack" style={{ gap: 20 }}>
      <h1 className="title-line">Minha solicitação</h1>
      {!b && (
        <form className="card stack" onSubmit={find}>
          <p className="muted">Digite o código que você recebeu e o WhatsApp usado no agendamento.</p>
          <label className="field"><span>Código</span>
            <input className="input" required maxLength={6} style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="field"><span>WhatsApp com DDD</span>
            <input className="input" required inputMode="tel" placeholder="(19) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          {error && <Alert kind="danger">{error}</Alert>}
          <button className="btn wine block" disabled={busy}>{busy ? 'Buscando…' : 'Consultar'}</button>
        </form>
      )}
      {b && <>
        <BookingStatus b={b} phone={phone} onChange={setB} />
        <button className="btn ghost" onClick={() => setB(undefined)}>Consultar outra solicitação</button>
      </>}
    </div>
  );
}
