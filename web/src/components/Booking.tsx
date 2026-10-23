import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, fmtTime, money, STATUS, STATUS_TONE, waLink, type Booking } from '../lib/api';
import { Alert, Icon, useSite } from './ui';

/** Lembra a última solicitação neste aparelho (conveniência; se o navegador bloquear, a cliente digita o código). */
export const lastBooking = {
  get: (): { code: string; phone: string } | null => { try { return JSON.parse(localStorage.getItem('studio:last') ?? 'null'); } catch { return null; } },
  set: (v: { code: string; phone: string }) => { try { localStorage.setItem('studio:last', JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  return `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
}

/** Tela de pagamento do sinal (mockup 1, "Confirmação"): QR Code, Copia e Cola, valor exato, identificador e prazo. */
export function PixBox({ b, phone, onChange }: { b: Booking; phone: string; onChange: (b: Booking) => void }) {
  const site = useSite();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const left = useCountdown(b.status === 'awaiting_payment' ? b.holdExpiresAt : null);
  const svg = useMemo(() => {
    if (!b.pixPayload) return '';
    const g = qrcode(0, 'M');
    g.addData(b.pixPayload);
    g.make();
    return g.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
  }, [b.pixPayload]);

  async function paid() {
    setBusy(true); setError('');
    try { onChange(await api<Booking>(`/bookings/${b.code}/paid`, { body: { phone } })); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const copy = () => navigator.clipboard?.writeText(b.pixPayload!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  const wa = site?.salon.whatsapp ?? '19988651935';

  return (
    <div className="card pix-card">
      <h3>Pagamento do Sinal</h3>
      <p>Sinal de 30% <b>({money(b.depositCents)})</b></p>
      {b.pixPayload ? (
        <>
          <div className="pix-qr" role="img" aria-label={`QR Code do Pix de ${money(b.depositCents)}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <button className="btn gold block" onClick={copy}>{copied ? 'Código copiado!' : 'Pix Copia e Cola'}</button>
          <div className="pix-code" aria-label="Código Pix copia e cola">{b.pixPayload}</div>
          <p className="small muted">
            {b.pixName && <>Recebedor: <b>{b.pixName}</b> · </>}Identificador: <b>{b.txid}</b><br />
            No app do banco, confira o nome e o valor exato antes de pagar.
          </p>
          {left && <p className="row" style={{ justifyContent: 'center', gap: 8 }}>{Icon.clock}<span>Pague em até <b>{left}</b> para manter a reserva.</span></p>}
          {b.status === 'expired' && <Alert kind="danger">O prazo da reserva acabou. Se você já pagou, toque em "Já paguei": a Mariana confere e confirma se o horário ainda estiver livre.</Alert>}
          {error && <Alert kind="danger">{error}</Alert>}
          <button className="btn wine block" onClick={paid} disabled={busy}>{busy ? 'Enviando…' : 'Já paguei'} <span className="chev">{Icon.chev}</span></button>
        </>
      ) : (
        <Alert>O pagamento pelo Pix ainda está sendo configurado. Fale com o salão pelo WhatsApp informando o código <b>{b.code}</b> para pagar o sinal.</Alert>
      )}
      <div className="info-box">{Icon.info} Depois do pagamento: conferência e aprovação da Mariana</div>
      {!b.pixPayload && <a className="btn outline block" href={waLink(wa, `Olá! Quero pagar o sinal da solicitação ${b.code}.`)} target="_blank" rel="noopener">Falar no WhatsApp</a>}
      <p className="muted">Pague o sinal para garantir o seu horário.</p>
    </div>
  );
}

/** Situação da solicitação, com as ações que a cliente pode fazer. */
export function BookingStatus({ b, phone, onChange }: { b: Booking; phone: string; onChange: (b: Booking) => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [request, setRequest] = useState<'' | 'cancel' | 'reschedule'>('');
  const [message, setMessage] = useState('');
  const run = async (action: string, body: object = {}) => {
    setBusy(action); setError('');
    try { onChange(await api<Booking>(`/bookings/${b.code}/${action}`, { body: { phone, ...body } })); setRequest(''); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const open = ['awaiting_payment', 'proof_submitted', 'awaiting_approval', 'alternative_proposed', 'confirmed'].includes(b.status);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card summary">
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className={`badge ${STATUS_TONE[b.status]}`}>{STATUS[b.status] ?? b.status}</span>
          <span className="muted small">Código <b>{b.code}</b></span>
        </div>
        <h3 style={{ fontSize: '1.5rem', margin: '8px 0 4px' }}>{b.service}</h3>
        <p className="cap">{fmtDate(b.startAt)} · {fmtTime(b.startAt)}</p>
        {b.staffName && <p className="muted">Trancista: {b.staffName}</p>}
        <div style={{ marginTop: 10 }}>
          <div className="sum-row"><span>Total</span><b>{money(b.totalCents)}</b></div>
          <div className="sum-row"><span>Sinal 30%</span><b>{money(b.depositCents)}</b></div>
          <div className="sum-row"><span>Saldo 70%</span><b>{money(b.balanceCents)}</b></div>
        </div>
      </div>

      {(b.status === 'awaiting_payment' || b.status === 'expired') && <PixBox b={b} phone={phone} onChange={onChange} />}
      {b.status === 'proof_submitted' && <Alert kind="info">Recebemos seu aviso de pagamento. A Mariana vai conferir o Pix e depois definir a trancista. Você recebe a confirmação pelo WhatsApp.</Alert>}
      {b.status === 'awaiting_approval' && <div className="waiting">{Icon.clock} Aguardando aprovação da Mariana</div>}
      {b.status === 'confirmed' && <Alert kind="ok">Tudo certo! Seu horário está confirmado. Lembre: tolerância de 15 minutos e cabelo lavado, desembaraçado e sem creme.</Alert>}
      {b.status === 'alternative_proposed' && b.proposedStartAt && (
        <div className="card stack">
          <h3>A Mariana sugeriu outro horário</h3>
          <p className="cap" style={{ fontSize: '1.2rem' }}><b>{fmtDate(b.proposedStartAt)} · {fmtTime(b.proposedStartAt)}</b></p>
          <button className="btn wine block" disabled={!!busy} onClick={() => run('accept')}>{busy === 'accept' ? 'Confirmando…' : 'Aceitar este horário'}</button>
          <p className="small muted">Não serve? Peça remarcação abaixo.</p>
        </div>
      )}
      {b.customerRequest && <Alert kind="info">Seu pedido foi enviado à Mariana: “{b.customerRequest}”. Ela responde pelo WhatsApp.</Alert>}
      {error && <Alert kind="danger">{error}</Alert>}

      {open && !b.customerRequest && (
        request ? (
          <div className="card stack">
            <h3>{request === 'cancel' ? 'Pedir cancelamento' : 'Pedir remarcação'}</h3>
            <p className="small muted">
              {request === 'cancel'
                ? 'O pedido vai para a Mariana. Em caso de desistência, conforme a regra do salão, o sinal não é devolvido.'
                : 'O pedido vai para a Mariana, que confirma uma nova data conforme a agenda.'}
            </p>
            <label className="field"><span>Mensagem (opcional)</span>
              <textarea className="input" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={request === 'reschedule' ? 'Ex.: prefiro sexta à tarde' : ''} />
            </label>
            <div className="row">
              <button className="btn" disabled={!!busy} onClick={() => run(request, { message })}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
              <button className="btn ghost" onClick={() => setRequest('')}>Voltar</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn outline sm" onClick={() => setRequest('reschedule')}>Pedir remarcação</button>
            <button className="btn ghost sm" onClick={() => setRequest('cancel')}>Pedir cancelamento</button>
          </div>
        )
      )}
    </div>
  );
}
