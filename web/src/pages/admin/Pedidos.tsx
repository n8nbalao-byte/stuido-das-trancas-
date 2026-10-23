import { useState } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, fmtDateTime, money, ORDER_STATUS, ORDER_TONE, waLink } from '../../lib/api';
import { useLoad } from './common';

type Row = { id: number; code: string; status: string; total_cents: number; delivery: string; customer_name: string; phone: string; items: number; created_at: string };
type Detail = Row & { notes: string | null; items: { id: number; product_name: string; variant_name: string; unit_cents: number; qty: number }[]; events: { id: number; from_status: string | null; to_status: string; reason: string | null; staff_name: string | null; created_at: string }[] };

const OPEN = 'created,awaiting_confirmation,awaiting_payment,paid,preparing,ready';
const NEXT: Record<string, string[]> = {
  created: ['awaiting_confirmation', 'awaiting_payment', 'paid'],
  awaiting_confirmation: ['awaiting_payment', 'paid'],
  awaiting_payment: ['paid'],
  paid: ['preparing', 'ready', 'delivered'],
  preparing: ['ready', 'delivered'],
  ready: ['delivered'],
};

function OrderDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const [o, error, reload] = useLoad<Detail>(`/admin/orders/${id}`);
  const [msg, setMsg] = useState('');
  const [reason, setReason] = useState('');
  async function go(status: string) {
    setMsg('');
    try { await api(`/admin/orders/${id}/status`, { body: { status, reason } }); setReason(''); reload(); onChange(); } catch (e: any) { setMsg(e.message); }
  }
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!o) return <Loading />;
  const open = !['cancelled', 'delivered'].includes(o.status);
  return (
    <div className="panel stack">
      <div className="row between"><h2 style={{ margin: 0 }}>Pedido {o.code}</h2><span className={`badge ${ORDER_TONE[o.status]}`}>{ORDER_STATUS[o.status]}</span></div>
      <p>{o.customer_name} · <a href={waLink(o.phone)} target="_blank" rel="noopener">{o.phone}</a> · {o.delivery === 'entrega' ? 'Entrega' : 'Retirada no salão'}</p>
      {o.notes && <Alert kind="info">Obs.: {o.notes}</Alert>}
      <table className="table">
        <tbody>
          {o.items.map((i) => <tr key={i.id}><td>{i.qty}×</td><td>{i.product_name}{i.variant_name !== 'Padrão' && ` (${i.variant_name})`}</td><td>{money(i.unit_cents * i.qty)}</td></tr>)}
          <tr><td></td><td><b>Total</b></td><td><b>{money(o.total_cents)}</b></td></tr>
        </tbody>
      </table>
      {msg && <Alert kind="danger">{msg}</Alert>}
      {open && (
        <div className="stack">
          <div className="row">{(NEXT[o.status] ?? []).map((s) => <button key={s} className="btn sm" onClick={() => go(s)}>{ORDER_STATUS[s]}</button>)}</div>
          <div className="row">
            <input className="input" placeholder="Motivo do cancelamento" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 200px' }} />
            <button className="btn sm danger" disabled={!reason.trim()} onClick={() => go('cancelled')}>Cancelar pedido</button>
          </div>
          <p className="small muted">"Pago" baixa o estoque. Cancelar antes do pagamento libera a reserva; depois, devolve os itens ao estoque.</p>
        </div>
      )}
      <div className="timeline">
        {o.events.map((e) => <div key={e.id} className="small"><b>{ORDER_STATUS[e.to_status] ?? e.to_status}</b> · {fmtDateTime(e.created_at)}{e.staff_name && ` · ${e.staff_name}`}{e.reason && ` — ${e.reason}`}</div>)}
      </div>
    </div>
  );
}

export default function Pedidos() {
  const [tab, setTab] = useState<'abertos' | 'todos'>('abertos');
  const [rows, error, reload] = useLoad<Row[]>(`/admin/orders${tab === 'abertos' ? `?status=${OPEN}` : ''}`);
  const [sel, setSel] = useState<number>();
  if (error) return <Alert kind="danger">{error}</Alert>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Pedidos da loja</h1>
      <div className="tabs" style={{ margin: 0 }}>
        <button className={tab === 'abertos' ? 'on' : ''} onClick={() => setTab('abertos')}>Em aberto</button>
        <button className={tab === 'todos' ? 'on' : ''} onClick={() => setTab('todos')}>Todos</button>
      </div>
      <div className="two" style={{ alignItems: 'start' }}>
        <div className="panel table-wrap">
          {!rows ? <Loading /> : !rows.length ? <p className="muted">Nenhum pedido.</p> : (
            <table className="table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setSel(r.id)} style={{ background: sel === r.id ? '#fbf6ee' : undefined }}>
                    <td><b>{r.code}</b><br /><span className="muted small">{fmtDateTime(r.created_at)}</span></td>
                    <td>{r.customer_name}</td><td>{r.items}</td><td>{money(r.total_cents)}</td>
                    <td><span className={`badge ${ORDER_TONE[r.status]}`}>{ORDER_STATUS[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {sel ? <OrderDetail key={sel} id={sel} onChange={reload} /> : <p className="muted">Escolha um pedido para ver os itens e mudar o status.</p>}
      </div>
    </div>
  );
}
