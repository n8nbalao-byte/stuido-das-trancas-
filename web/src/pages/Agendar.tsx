import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookingStatus, lastBooking, PixBox } from '../components/Booking';
import { Alert, Calendar, Icon, Loading, useSite, usePageTitle } from '../components/ui';
import { api, fmtDate, fmtDuration, fmtTime, money, serviceImage, todaySP, waLink, type Booking } from '../lib/api';
import { useServices } from './Servicos';

type Step = 'pick' | 'data' | 'resumo' | 'pix' | 'fim';
const addMonths = (day: string, n: number) => { const [y, m] = day.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const split = (total: number) => { const deposit = Math.round((total * 30) / 100); return { deposit, balance: total - deposit }; };

export default function Agendar() {
  usePageTitle('Agendamento online');
  const site = useSite();
  const { list, error: listError } = useServices();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('pick');
  const [serviceId, setServiceId] = useState<number>();
  const [variantId, setVariantId] = useState<number>();
  const today = todaySP();
  const maxDay = useMemo(() => new Date(Date.now() + 90 * 86400e3).toISOString().slice(0, 10), []);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [days, setDays] = useState<Record<string, number>>();
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ start: string; time: string }[]>();
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptRules, setAcceptRules] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking>();
  const [reload, setReload] = useState(0);

  const bookable = useMemo(() => (list ?? []).filter((s) => s.bookable), [list]);
  const service = list?.find((s) => s.id === serviceId);
  const variant = service?.variants.find((v) => v.id === variantId);
  const needsVariant = !!service?.variants.length;
  const price = variant ? variant.priceCents : service?.priceCents ?? null;
  const duration = variant ? variant.durationMin : service?.durationMin ?? null;
  const ready = !!service && (!needsVariant || !!variant);

  // ?servico=slug vindo da página do serviço
  useEffect(() => {
    const slug = params.get('servico');
    const s = list?.find((x) => x.slug === slug && x.bookable);
    if (s && !serviceId) setServiceId(s.id);
  }, [list]);

  // Dias com vaga no mês
  useEffect(() => {
    setDays(undefined);
    if (!ready) return;
    api<{ days: Record<string, number> }>(`/availability?service=${service!.id}&variant=${variantId ?? ''}&month=${month}`).then((r) => setDays(r.days), (e) => setError(e.message));
  }, [serviceId, variantId, month, ready, reload]);

  // Horários do dia
  useEffect(() => {
    setSlots(undefined); setStart(null);
    if (!ready || !day) return;
    api<{ slots: { start: string; time: string }[] }>(`/availability?service=${service!.id}&variant=${variantId ?? ''}&day=${day}`).then((r) => setSlots(r.slots), (e) => setError(e.message));
  }, [day, serviceId, variantId, reload]);

  function pickService(id: number) { setServiceId(id || undefined); setVariantId(undefined); setDay(null); setError(''); }
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  async function create() {
    setBusy(true); setError('');
    try {
      const b = await api<Booking>('/bookings', { body: { serviceId, variantId, start, name, phone, acceptRules, consent } });
      lastBooking.set({ code: b.code, phone });
      setBooking(b);
      setStep('pix');
    } catch (e: any) {
      setError(e.message);
      if (e.status === 409) { setStep('pick'); setReload((n) => n + 1); }
    } finally { setBusy(false); }
  }

  if (listError) return <div className="narrow page-head"><Alert kind="danger">{listError}</Alert></div>;
  if (!list) return <Loading />;
  const { deposit, balance } = split(price ?? 0);
  const startLabel = start ? `${fmtDate(start)} · ${fmtTime(start)}` : null;
  const wa = site?.salon.whatsapp ?? '19988651935';

  const summary = service && (
    <div className="card summary">
      <div className="head">
        <div className="thumb" style={{ '--img': `url(${serviceImage(service)})` } as React.CSSProperties} role="img" aria-label="" />
        <h3>{service.name}{variant && <><br /><span className="small muted">{variant.name}</span></>}</h3>
      </div>
      {startLabel && <p className="cap" style={{ marginBottom: 6 }}>{startLabel}</p>}
      <p className="small muted" style={{ marginBottom: 6 }}>Duração: {fmtDuration(duration, variant ? null : service.durationNote)}</p>
      {price != null && <>
        <div className="sum-row big"><span>Total{service.priceType === 'from' && !variant ? ' (a partir de)' : ''}</span><b>{money(price)}</b></div>
        <div className="sum-row"><span>Sinal 30%</span><b>{money(deposit)}</b></div>
        <div className="sum-row"><span>Saldo 70%</span><b>{money(balance)}</b></div>
      </>}
    </div>
  );

  return (
    <div className="wrap page-head">
      {step !== 'pick' && step !== 'fim' && step !== 'pix' && (
        <button className="btn ghost" style={{ marginBottom: 12, paddingLeft: 0 }} onClick={() => setStep(step === 'resumo' ? 'data' : 'pick')}>{Icon.back} Voltar</button>
      )}

      {step === 'pick' && (
        <div className="booking-layout">
          <div className="stack" style={{ gap: 22 }}>
            <h1 className="title-line">Agendamento online</h1>
            <label className="field">
              <span className="steps-label">1. Escolha o serviço</span>
              <select className="select" value={serviceId ?? ''} onChange={(e) => pickService(Number(e.target.value))}>
                <option value="">Selecione…</option>
                {bookable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <p className="small muted" style={{ marginTop: -12 }}>Não achou seu estilo? Alguns serviços são agendados pelo <a href={waLink(wa, 'Olá! Quero agendar um serviço.')} target="_blank" rel="noopener">WhatsApp</a>. <Link to="/servicos">Ver todos</Link>.</p>
            {needsVariant && (
              <div className="field">
                <span>Opção</span>
                <div className="times">
                  {service!.variants.filter((v) => v.durationMin).map((v) => (
                    <button key={v.id} type="button" className={`time ${variantId === v.id ? 'sel' : ''}`} style={{ padding: '0 14px' }} onClick={() => { setVariantId(v.id); setDay(null); }}>
                      {v.name} · {money(v.priceCents)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ready && (
              <div className="field">
                <span className="steps-label">2. Escolha a data</span>
                {days ? (
                  <Calendar month={month} onMonth={(m) => { setMonth(m); }} available={days} value={day} onChange={setDay} min={today} max={maxDay} />
                ) : <Loading />}
                {days && !Object.keys(days).length && <p className="small muted">Sem horários neste mês. Veja o próximo ({addMonths(`${month}-01`, 1).split('-').reverse().join('/')}) ou fale no WhatsApp.</p>}
              </div>
            )}
            {ready && day && (
              <div className="field">
                <span className="steps-label">3. Escolha o horário</span>
                {!slots ? <Loading /> : slots.length ? (
                  <div className="times" role="group" aria-label="Horários disponíveis">
                    {slots.map((s) => <button key={s.start} type="button" className={`time ${start === s.start ? 'sel' : ''}`} aria-pressed={start === s.start} onClick={() => setStart(s.start)}>{s.time}</button>)}
                  </div>
                ) : <p className="muted">Esse dia acabou de lotar. Escolha outra data.</p>}
              </div>
            )}
            <div className="alert">{Icon.alert}<span><b>Aviso:</b> a Mariana define a trancista conforme a agenda e confirma pelo WhatsApp.</span></div>
            {error && <Alert kind="danger">{error}</Alert>}
            <button className="btn block" style={{ minHeight: 54 }} disabled={!start} onClick={() => { setError(''); setStep('data'); }}>Continuar</button>
          </div>
          <aside>{summary ?? <div className="card summary"><p className="muted">Escolha um serviço para ver o valor, o sinal de 30% e o saldo.</p></div>}</aside>
        </div>
      )}

      {step === 'data' && (
        <form className="narrow stack" style={{ gap: 20, marginInline: 0 }} onSubmit={(e: FormEvent) => { e.preventDefault(); setStep('resumo'); }}>
          <h1 className="title-line">Seus dados</h1>
          <label className="field"><span>Nome completo</span>
            <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field"><span>WhatsApp com DDD</span>
            <input className="input" required inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" pattern="[\d\s()+-]{10,20}" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <p className="small muted">É por esse número que você recebe as instruções, a confirmação e os lembretes.</p>
          <button className="btn wine block">Continuar <span className="chev">{Icon.chev}</span></button>
        </form>
      )}

      {step === 'resumo' && service && (
        <div className="booking-layout">
          <div className="stack" style={{ gap: 20 }}>
            <h1 className="title-line">Resumo do agendamento</h1>
            {summary}
            <div className="card stack">
              <h3>Regras de atendimento</h3>
              <ul className="rules">{site?.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="small muted">📍 {site?.salon.address} — {site?.salon.reference}</p>
              <p className="small muted">Remarcação conforme a disponibilidade da agenda. Pedidos de cancelamento ou remarcação vão para análise da Mariana. <Link to="/politicas">Regras completas</Link>.</p>
            </div>
          </div>
          <aside className="stack" style={{ gap: 16 }}>
            <label className="check"><input type="checkbox" checked={acceptRules} onChange={(e) => setAcceptRules(e.target.checked)} /><span>Li e aceito as regras de atendimento, inclusive a de não devolução do sinal em atraso maior que 15 minutos, falta ou desistência.</span></label>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Autorizo o uso do meu nome e WhatsApp para este agendamento (<Link to="/politicas#privacidade">privacidade</Link>).</span></label>
            {error && <Alert kind="danger">{error}</Alert>}
            <button className="btn wine block" disabled={!acceptRules || !consent || busy} onClick={create}>{busy ? 'Reservando…' : 'Pagar sinal via Pix'} <span className="chev">{Icon.chev}</span></button>
            <div className="waiting">{Icon.clock} Aguardando aprovação da Mariana após o pagamento</div>
          </aside>
        </div>
      )}

      {step === 'pix' && booking && (
        <div className="narrow stack" style={{ gap: 20 }}>
          <h1 className="title-line">Confirmação</h1>
          <p>Sua reserva está guardada por <b>{site?.holdMinutes ?? 30} minutos</b>. Código: <b>{booking.code}</b></p>
          <PixBox b={booking} phone={phone} onChange={(b) => { setBooking(b); setStep('fim'); }} />
        </div>
      )}

      {step === 'fim' && booking && (
        <div className="narrow stack" style={{ gap: 20 }}>
          <h1 className="title-line">Solicitação enviada</h1>
          <BookingStatus b={booking} phone={phone} onChange={setBooking} />
          <p className="small muted">Acompanhe a qualquer momento em <Link to={`/minha-solicitacao?codigo=${booking.code}`}>Minha solicitação</Link> com o código <b>{booking.code}</b> e seu WhatsApp.</p>
        </div>
      )}
    </div>
  );
}

