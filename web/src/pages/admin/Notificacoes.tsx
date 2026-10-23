import { useState } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, fmtDateTime } from '../../lib/api';
import { useLoad } from './common';
import { WhatsappConnect } from './WhatsappConnect';

type Item = { id: number; kind: string; phone: string; body: string; status: string; attempts: number; last_error: string | null; scheduled_for: string; sent_at: string | null; code: string | null };
const TONE: Record<string, string> = { sent: 'ok', pending: 'info', sending: 'info', failed: 'danger', cancelled: 'muted' };
const LABEL: Record<string, string> = { sent: 'Enviada', pending: 'Na fila', sending: 'Enviando', failed: 'Falhou', cancelled: 'Cancelada' };

export default function Notificacoes() {
  const [d, error, reload] = useLoad<{ configured: boolean; items: Item[] }>('/admin/notifications');
  const [busy, setBusy] = useState(false);
  const run = async (path: string) => { setBusy(true); try { await api(path, { method: 'POST' }); reload(); } finally { setBusy(false); } };
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!d) return <Loading />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>WhatsApp</h1><button className="btn sm" disabled={busy} onClick={() => run('/admin/notifications/dispatch')}>Processar fila agora</button></div>
      <WhatsappConnect />
      <h2 style={{ fontSize: '1.35rem', margin: '8px 0 0' }}>Mensagens</h2>
      <p className="muted small">A fila é processada a cada minuto pelo servidor. Mensagens com falha são tentadas até 5 vezes.</p>
      <div className="panel table-wrap">
        <table className="table">
          <thead><tr><th>Quando</th><th>Para</th><th>Tipo</th><th>Mensagem</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {d.items.map((m) => (
              <tr key={m.id}>
                <td>{fmtDateTime(m.scheduled_for)}</td>
                <td>{m.phone}{m.code && <><br /><span className="muted small">{m.code}</span></>}</td>
                <td>{m.kind}</td>
                <td style={{ maxWidth: 380 }}><span className="small" style={{ whiteSpace: 'pre-line' }}>{m.body.slice(0, 160)}{m.body.length > 160 && '…'}</span></td>
                <td><span className={`badge ${TONE[m.status]}`}>{LABEL[m.status] ?? m.status}</span>{m.last_error && <><br /><span className="small" style={{ color: 'var(--danger)' }}>{m.last_error}</span></>}<br /><span className="muted small">{m.attempts} tentativa(s)</span></td>
                <td>{(m.status === 'failed' || m.status === 'pending') && <button className="btn sm outline" disabled={busy} onClick={() => run(`/admin/notifications/${m.id}/retry`)}>Reenviar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.items.length && <p className="muted">Nenhuma mensagem ainda.</p>}
      </div>
    </div>
  );
}
