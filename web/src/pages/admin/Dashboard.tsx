import { Link } from 'react-router-dom';
import { Alert, Loading } from '../../components/ui';
import { ApptTable, useLoad, type Appt } from './common';

type Data = { counts: Record<string, number>; today: Appt[]; requests: Appt[]; upcoming: Appt[]; pending: { text: string; to: string }[] };

export default function Dashboard() {
  const [d, error] = useLoad<Data>('/admin/dashboard');
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!d) return <Loading />;
  const c = (k: string) => d.counts[k] ?? 0;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <h1>Início</h1>
      {d.pending.map((p) => <Link key={p.text} to={p.to} style={{ textDecoration: 'none' }}><Alert>{p.text}</Alert></Link>)}
      <div className="stats">
        <Link to="/admin/solicitacoes" className="stat"><span className="muted">Pagamento informado — conferir</span><b>{c('proof_submitted')}</b></Link>
        <Link to="/admin/solicitacoes" className="stat"><span className="muted">Pago — aguardando aprovação</span><b>{c('awaiting_approval')}</b></Link>
        <Link to="/admin/solicitacoes" className="stat"><span className="muted">Aguardando pagamento</span><b>{c('awaiting_payment')}</b></Link>
        <Link to="/admin/solicitacoes" className="stat"><span className="muted">Horário sugerido à cliente</span><b>{c('alternative_proposed')}</b></Link>
        <Link to="/admin/pedidos" className="stat"><span className="muted">Pedidos da loja a confirmar</span><b>{c('orders_open')}</b></Link>
      </div>
      <section className="panel"><h2>Hoje</h2><ApptTable rows={d.today} empty="Nenhum atendimento confirmado hoje." /></section>
      {d.requests.length > 0 && <section className="panel"><h2>Pedidos das clientes (cancelamento / remarcação)</h2><ApptTable rows={d.requests} /></section>}
      <section className="panel"><h2>Próximos atendimentos</h2><ApptTable rows={d.upcoming} empty="Sem atendimentos confirmados à frente." /></section>
    </div>
  );
}
