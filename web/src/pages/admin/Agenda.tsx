import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Loading } from '../../components/ui';
import { fmtTime, todaySP } from '../../lib/api';
import { ApptTable, svcName, useLoad, type Appt } from './common';

type View = 'dia' | 'semana' | 'mes';
const SHOWN = 'awaiting_payment,proof_submitted,awaiting_approval,alternative_proposed,confirmed,completed,no_show';
const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const spDay = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const label = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...o });

function range(view: View, ref: string): [string, string] {
  if (view === 'dia') return [ref, ref];
  if (view === 'semana') { const s = add(ref, -wd(ref)); return [s, add(s, 6)]; }
  const first = `${ref.slice(0, 7)}-01`;
  const last = add(`${add(`${ref.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  return [add(first, -wd(first)), add(last, 6 - wd(last))];
}

function Chip({ a }: { a: Appt }) {
  return (
    <Link to={`/admin/atendimento/${a.id}`} className="appt" style={{ borderLeftColor: a.staff_color ?? 'var(--sand-2)', opacity: a.status === 'confirmed' || a.status === 'completed' ? 1 : 0.7 }}>
      <b>{fmtTime(a.start_at)}</b> {a.customer_name}<br /><span className="muted">{svcName(a)}{a.staff_name ? ` · ${a.staff_name}` : ' · sem trancista'}</span>
    </Link>
  );
}

export default function Agenda() {
  const [view, setView] = useState<View>('semana');
  const [ref, setRef] = useState(todaySP());
  const [staff, setStaff] = useState('');
  const [from, to] = range(view, ref);
  const [rows, error] = useLoad<Appt[]>(`/admin/appointments?from=${from}&to=${to}&status=${SHOWN}${staff ? `&staff=${staff}` : ''}`);
  const [team] = useLoad<{ id: number; name: string }[]>('/admin/staff');
  const step = view === 'dia' ? 1 : view === 'semana' ? 7 : 30;
  const days: string[] = [];
  for (let d = from; d <= to; d = add(d, 1)) days.push(d);
  const byDay = (d: string) => (rows ?? []).filter((a) => spDay(a.start_at) === d);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Agenda</h1>
      <div className="row between">
        <div className="tabs" style={{ margin: 0 }}>
          {(['dia', 'semana', 'mes'] as View[]).map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'mes' ? 'Mês' : v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
        <div className="row">
          <button className="btn sm outline" onClick={() => setRef(add(ref, -step))} aria-label="Anterior">‹</button>
          <button className="btn sm outline" onClick={() => setRef(todaySP())}>Hoje</button>
          <button className="btn sm outline" onClick={() => setRef(add(ref, step))} aria-label="Próximo">›</button>
          <select className="select" style={{ width: 'auto' }} value={staff} onChange={(e) => setStaff(e.target.value)} aria-label="Profissional">
            <option value="">Todas as profissionais</option>
            {team?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <p className="muted cap">
        {view === 'mes' ? label(ref, { month: 'long', year: 'numeric' }) : view === 'dia' ? label(ref, { weekday: 'long', day: '2-digit', month: 'long' }) : `${label(from, { day: '2-digit', month: 'short' })} – ${label(to, { day: '2-digit', month: 'short' })}`}
      </p>
      {error && <Alert kind="danger">{error}</Alert>}
      {!rows ? <Loading /> : view === 'dia' ? (
        <div className="panel"><ApptTable rows={rows} empty="Nenhum atendimento neste dia." /></div>
      ) : view === 'semana' ? (
        <div className="week">
          {days.map((d) => <div key={d} className="day"><h4>{label(d, { weekday: 'short', day: '2-digit' })}</h4>{byDay(d).map((a) => <Chip key={a.id} a={a} />)}</div>)}
        </div>
      ) : (
        <div className="month">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x, i) => <b key={i} className="center small">{x}</b>)}
          {days.map((d) => (
            <div key={d} className={`cell ${d.slice(0, 7) !== ref.slice(0, 7) ? 'out' : ''}`}>
              <button className="btn ghost sm" style={{ padding: '0 6px', minHeight: 24 }} onClick={() => { setRef(d); setView('dia'); }}>{Number(d.slice(8))}</button>
              {byDay(d).slice(0, 3).map((a) => <Chip key={a.id} a={a} />)}
              {byDay(d).length > 3 && <span className="muted">+{byDay(d).length - 3}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
