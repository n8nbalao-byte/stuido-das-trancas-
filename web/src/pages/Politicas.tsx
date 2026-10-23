import { useSite, usePageTitle } from '../components/ui';

export default function Politicas() {
  usePageTitle('Regras e privacidade');
  const site = useSite();
  return (
    <div className="narrow page-head stack" style={{ gap: 22 }}>
      <h1 className="title-line">Regras de atendimento</h1>
      <ul className="rules">{site?.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="stack">
        <h2>Sinal e confirmação</h2>
        <p>O agendamento exige sinal de 30% do valor do serviço, pago pelo Pix. O restante (70%) é pago no dia do atendimento.</p>
        <p>A reserva do horário fica guardada por {site?.holdMinutes ?? 30} minutos enquanto você paga. O pagamento é conferido pela Mariana; o comprovante sozinho não confirma o horário. Depois da conferência, a Mariana define a trancista e confirma o agendamento pelo WhatsApp.</p>
        <p>Em serviços com valor "a partir de", o valor final depende do comprimento e do volume e é confirmado no salão.</p>
      </div>
      <div className="stack">
        <h2>Atraso, falta, cancelamento e remarcação</h2>
        <p>A tolerância máxima de atraso é de 15 minutos. Depois disso, o atendimento não acontece naquele horário e você pode pedir uma nova data conforme a agenda.</p>
        <p>Em caso de atraso maior que 15 minutos, falta ou desistência, o sinal não é devolvido, conforme a regra do salão e observada a legislação aplicável.</p>
        <p>A remarcação é feita conforme a disponibilidade da agenda. Pedidos de cancelamento ou remarcação são analisados pela Mariana — peça pela página "Minha solicitação" ou pelo WhatsApp.</p>
      </div>
      <div className="stack" id="privacidade">
        <h2>Privacidade (LGPD)</h2>
        <p>Coletamos apenas nome e WhatsApp, usados para registrar o agendamento, enviar instruções de pagamento, a confirmação e os lembretes. Os dados ficam em servidor protegido e não são compartilhados com terceiros para fins de marketing.</p>
        <p>Você pode pedir a consulta, a correção ou a exclusão dos seus dados pelo WhatsApp do salão. Registros financeiros e de atendimento podem ser mantidos pelo prazo exigido em lei.</p>
      </div>
    </div>
  );
}
