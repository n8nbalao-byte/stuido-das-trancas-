import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtShort, fmtTime, money, STATUS, STATUS_TONE } from '../../lib/api';

export type Appt = {
  id: number; code: string; status: string; start_at: string; end_at: string; total_cents: number; deposit_cents: number; balance_cents: number;
  hold_expires_at: string | null; customer_request: string | null; proposed_start_at: string | null; staff_id: number | null; staff_name: string | null;
  staff_color: string | null; customer_name: string; phone: string; service: string; variant: string | null; duration_min: number; payment_status: string | null;
};

/** Carrega `path` e devolve [dados, erro, recarregar]. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!path) return;
    api<T>(path).then((d) => { setData(d); setError(''); }, (e) => setError(e.message));
  }, [path]);
  useEffect(reload, [reload]);
  return [data, error, reload] as const;
}

export const Status = ({ s }: { s: string }) => <span className={`badge ${STATUS_TONE[s] ?? ''}`}>{STATUS[s] ?? s}</span>;
export const svcName = (a: Pick<Appt, 'service' | 'variant'>) => (a.variant && a.variant !== 'null' ? `${a.service} — ${a.variant}` : a.service);
export const durLabel = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
/** Valor de <input type="datetime-local"> (hora de São Paulo) → ISO. */
export const spInputToIso = (v: string) => new Date(`${v}:00-03:00`).toISOString();
export const isoToSpInput = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 16);

export function ApptTable({ rows, empty = 'Nada por aqui.' }: { rows: Appt[]; empty?: string }) {
  const nav = useNavigate();
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Total / sinal / saldo</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="click" onClick={() => nav(`/admin/atendimento/${a.id}`)}>
              <td>{fmtShort(a.start_at)} {fmtTime(a.start_at)}–{fmtTime(a.end_at)}<br /><span className="muted small">{durLabel(a.duration_min)}</span></td>
              <td>{a.customer_name}<br /><span className="muted small">{a.phone}</span></td>
              <td>{svcName(a)}</td>
              <td>{a.staff_name ? <><span className="dot" style={{ background: a.staff_color ?? '#999' }} /> {a.staff_name}</> : <span className="muted">—</span>}</td>
              <td>{money(a.total_cents)}<br /><span className="muted small">{money(a.deposit_cents)} / {money(a.balance_cents)}</span></td>
              <td><Status s={a.status} />{a.customer_request && <><br /><span className="badge warn" style={{ marginTop: 4 }}>Pedido da cliente</span></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
