import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Loading } from '../../components/ui';
import { api, fmtDate, fmtDateTime, fmtTime, money, waLink } from '../../lib/api';
import { durLabel, isoToSpInput, spInputToIso, Status, useLoad } from './common';

type Detail = {
  id: number; code: string; status: string; start_at: string; end_at: string; service_name: string; customer_name: string; phone: string;
  staff_id: number | null; staff_name: string | null; total_cents: number; deposit_cents: number; balance_cents: number;
  payment_status: string; txid: string; declared_at: string | null; confirmed_at: string | null; hold_expires_at: string | null;
  proposed_start_at: string | null; proposed_staff_name: string | null; customer_request: string | null;
  price_snapshot: { durationMin: number; blockMin: number; priceType: string };
  events: { id: number; type: string; reason: string | null; to_status: string | null; staff_name: string | null; created_at: string }[];
  messages: { id: number; kind: string; status: string; scheduled_for: string; last_error: string | null }[];
};
type Cand = { id: number; name: string; free: boolean };

const EVENT: Record<string, string> = {
  created: 'Solicitação criada', payment_declared: 'Cliente informou o pagamento', payment_confirmed: 'Pagamento conferido',
  payment_rejected: 'Pagamento não localizado', approved: 'Aprovado', alternative_proposed: 'Horário alternativo sugerido',
  alternative_accepted: 'Cliente aceitou o horário sugerido', rescheduled: 'Remarcado', cancelled: 'Cancelado', rejected: 'Recusado',
  no_show: 'Falta registrada', late: 'Atraso registrado', completed: 'Concluído', expired: 'Reserva expirou',
  request_cancel: 'Cliente pediu cancelamento', request_reschedule: 'Cliente pediu remarcação', request_resolved: 'Pedido da cliente resolvido', note: 'Observação',
};

/** Escolha de profissional com indicação de quem está habilitada e livre no horário. */
function StaffPicker({ id, start, value, onChange }: { id: number; start: string; value: number; onChange: (n: number) => void }) {
  const [cands, setCands] = useState<Cand[]>();
  useEffect(() => { setCands(undefined); api<Cand[]>(`/admin/appointments/${id}/candidates?start=${encodeURIComponent(start)}`).then(setCands, () => setCands([])); }, [id, start]);
  if (!cands) return <Loading />;
  if (!cands.length) return <Alert>Nenhuma profissional habilitada para este serviço trabalha nesse dia. Veja Equipe → Competências e jornadas.</Alert>;
  return (
    <div className="row">
      {cands.map((c) => (
        <button key={c.id} type="button" className={`time ${value === c.id ? 'sel' : ''}`} disabled={!c.free} style={{ padding: '0 14px', opacity: c.free ? 1 : 0.45 }} onClick={() => onChange(c.id)}>
          {c.name}{!c.free && ' (ocupada)'}
        </button>
      ))}
    </div>
  );
}

export default function Atendimento() {
  const id = Number(useParams().id);
  const [a, error, reload] = useLoad<Detail>(`/admin/appointments/${id}`);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: '' | 'danger' | 'ok'; text: string }>();
  const [mode, setMode] = useState<'' | 'propose' | 'reschedule' | 'cancel' | 'reject' | 'no-show' | 'late' | 'note' | 'reject-payment'>('');
  const [staffId, setStaffId] = useState(0);
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (a) { setWhen(isoToSpInput(a.start_at)); setStaffId(a.staff_id ?? 0); } }, [a?.id, a?.start_at]);

  async function act(action: string, body: object = {}) {
    setBusy(action); setMsg(undefined);
    try {
      await api(`/admin/appointments/${id}/${action}`, { body });
      setMode(''); setReason('');
      setMsg({ kind: 'ok', text: 'Feito.' });
      reload();
    } catch (e: any) { setMsg({ kind: 'danger', text: e.message }); } finally { setBusy(''); }
  }

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!a) return <Loading />;
  const st = a.status;
  const whenIso = when ? spInputToIso(when) : a.start_at;

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 900 }}>
      <Link to="/admin/solicitacoes" className="muted">← Solicitações</Link>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{a.customer_name}</h1>
        <Status s={st} />
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {a.customer_request && (
        <Alert>Pedido da cliente: <b>{a.customer_request}</b> <button className="btn sm outline" style={{ marginLeft: 8 }} onClick={() => act('resolve-request')}>Marcar como resolvido</button></Alert>
      )}

      <div className="panel grid-form" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <div><span className="muted small">Serviço</span><br /><b>{a.service_name}</b></div>
        <div><span className="muted small">Data</span><br /><b className="cap" style={{ display: 'inline-block' }}>{fmtDate(a.start_at)}</b><br />{fmtTime(a.start_at)}–{fmtTime(a.end_at)} ({durLabel(a.price_snapshot.durationMin)})</div>
        <div><span className="muted small">Cliente</span><br /><a href={waLink(a.phone)} target="_blank" rel="noopener">{a.phone}</a> · código {a.code}</div>
        <div><span className="muted small">Profissional</span><br /><b>{a.staff_name ?? '— a definir'}</b></div>
        <div><span className="muted small">Total · sinal · saldo</span><br />{money(a.total_cents)} · {money(a.deposit_cents)} · {money(a.balance_cents)}{a.price_snapshot.priceType === 'from' && <><br /><span className="small muted">valor "a partir de"</span></>}</div>
        <div><span className="muted small">Pix do sinal</span><br />{a.payment_status === 'confirmed' ? 'Conferido' : a.payment_status === 'declared' ? 'Cliente diz que pagou' : 'Pendente'} · id {a.txid}</div>
        {a.proposed_start_at && <div><span className="muted small">Sugerido à cliente</span><br />{fmtDateTime(a.proposed_start_at)} com {a.proposed_staff_name}</div>}
      </div>

      {/* Ações conforme o status */}
      <div className="panel stack">
        <h2>Ações</h2>
        {(st === 'proof_submitted' || st === 'awaiting_payment' || st === 'expired') && (
          <div className="stack">
            <p>Confira no app do banco se entrou <b>{money(a.deposit_cents)}</b> com identificador <b>{a.txid}</b>.</p>
            {st === 'expired' && <Alert>A reserva expirou: confirme só se o horário ainda estiver livre (a aprovação revalida).</Alert>}
            <div className="row">
              <button className="btn" disabled={!!busy} onClick={() => act('confirm-payment')}>Pagamento recebido</button>
              {st === 'proof_submitted' && <button className="btn outline" onClick={() => setMode('reject-payment')}>Não localizei o pagamento</button>}
            </div>
          </div>
        )}
        {st === 'awaiting_approval' && (
          <div className="stack">
            <p>Escolha a trancista para {fmtDateTime(a.start_at)}:</p>
            <StaffPicker id={a.id} start={a.start_at} value={staffId} onChange={setStaffId} />
            <div className="row">
              <button className="btn" disabled={!staffId || !!busy} onClick={() => act('approve', { staffId })}>Confirmar agendamento</button>
              <button className="btn outline" onClick={() => setMode('propose')}>Sugerir outro horário</button>
              <button className="btn ghost" onClick={() => setMode('reject')}>Recusar</button>
            </div>
          </div>
        )}
        {st === 'alternative_proposed' && (
          <div className="row">
            <button className="btn outline" onClick={() => setMode('propose')}>Sugerir outro horário</button>
            <button className="btn ghost" onClick={() => setMode('reject')}>Recusar</button>
          </div>
        )}
        {st === 'confirmed' && (
          <div className="row">
            <button className="btn" disabled={!!busy} onClick={() => act('complete')}>Concluir atendimento</button>
            <button className="btn outline" onClick={() => setMode('reschedule')}>Remarcar</button>
            <button className="btn outline" onClick={() => setMode('late')}>Registrar atraso</button>
            <button className="btn outline" onClick={() => setMode('no-show')}>Registrar falta</button>
            <button className="btn ghost" onClick={() => setMode('cancel')}>Cancelar / desistência</button>
          </div>
        )}
        {['awaiting_payment', 'proof_submitted', 'alternative_proposed'].includes(st) && <button className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => setMode('cancel')}>Cancelar solicitação</button>}
        <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setMode('note')}>Adicionar observação</button>

        {(mode === 'propose' || mode === 'reschedule') && (
          <div className="stack" style={{ borderTop: '1px solid #eadfce', paddingTop: 14 }}>
            <label className="field"><span>Novo horário (hora de Brasília)</span>
              <input className="input" type="datetime-local" step={1800} value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 280 }} />
            </label>
            <StaffPicker id={a.id} start={whenIso} value={staffId} onChange={setStaffId} />
            {mode === 'reschedule' && <label className="field"><span>Motivo</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
            <div className="row">
              <button className="btn" disabled={!staffId || !!busy} onClick={() => act(mode, { start: whenIso, staffId, reason })}>{mode === 'propose' ? 'Enviar sugestão à cliente' : 'Remarcar'}</button>
              <button className="btn ghost" onClick={() => setMode('')}>Fechar</button>
            </div>
          </div>
        )}
        {['cancel', 'reject', 'no-show', 'late', 'note', 'reject-payment'].includes(mode) && (
          <div className="stack" style={{ borderTop: '1px solid #eadfce', paddingTop: 14 }}>
            <label className="field"><span>{mode === 'late' ? 'Descreva o atraso (ex.: chegou 25 min atrasada; remarcar)' : mode === 'note' ? 'Observação' : 'Motivo'}</span>
              <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {(mode === 'cancel' || mode === 'no-show') && <p className="small muted">O registro do sinal fica guardado. Regra do salão: atraso maior que 15 min, falta ou desistência = sinal não devolvido.</p>}
            <div className="row">
              <button className={`btn ${mode === 'cancel' || mode === 'reject' ? 'danger' : ''}`} disabled={!!busy || (mode !== 'reject-payment' && !reason.trim())} onClick={() => act(mode, { reason })}>Salvar</button>
              <button className="btn ghost" onClick={() => setMode('')}>Fechar</button>
            </div>
          </div>
        )}
      </div>

      <div className="two">
        <section className="panel">
          <h2>Histórico</h2>
          <div className="timeline">
            {a.events.map((e) => (
              <div key={e.id}>
                <b>{EVENT[e.type] ?? e.type}</b> <span className="muted small">{fmtDateTime(e.created_at)}{e.staff_name && ` · ${e.staff_name}`}</span>
                {e.reason && <p className="small">{e.reason}</p>}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Mensagens</h2>
          {a.messages.length ? a.messages.map((m) => (
            <p key={m.id} className="small"><b>{m.kind}</b> · {m.status} · {fmtDateTime(m.scheduled_for)}{m.last_error && <span style={{ color: 'var(--danger)' }}> — {m.last_error}</span>}</p>
          )) : <p className="muted">Nenhuma.</p>}
        </section>
      </div>
    </div>
  );
}
