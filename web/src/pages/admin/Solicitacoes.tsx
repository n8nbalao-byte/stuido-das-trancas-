import { Alert, Loading } from '../../components/ui';
import { ApptTable, useLoad, type Appt } from './common';

const GROUPS: [string, string][] = [
  ['proof_submitted', 'Pagamento informado — conferir o Pix'],
  ['awaiting_approval', 'Pago — escolher a trancista e aprovar'],
  ['alternative_proposed', 'Horário sugerido — aguardando a cliente'],
  ['awaiting_payment', 'Aguardando pagamento do sinal'],
];

export default function Solicitacoes() {
  const [rows, error] = useLoad<Appt[]>(`/admin/appointments?status=${GROUPS.map((g) => g[0]).join(',')}`);
  const [dash] = useLoad<{ requests: Appt[] }>('/admin/dashboard');
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!rows) return <Loading />;
  const withRequest = dash?.requests;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <h1>Solicitações</h1>
      {withRequest && withRequest.length > 0 && <section className="panel"><h2>Pedidos de cancelamento / remarcação</h2><ApptTable rows={withRequest} /></section>}
      {GROUPS.map(([status, title]) => (
        <section key={status} className="panel">
          <h2>{title}</h2>
          <ApptTable rows={rows.filter((a) => a.status === status)} />
        </section>
      ))}
    </div>
  );
}
