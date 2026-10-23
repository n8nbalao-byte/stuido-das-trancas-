import { useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, CATEGORIES, fmtDateTime, hhmm, toMin, WEEKDAYS } from '../../lib/api';
import { spInputToIso, useLoad } from './common';

type Hours = { weekday: number; start_min: number; end_min: number; break_start_min: number | null; break_end_min: number | null };
type Staff = { id: number; name: string; phone: string | null; role: string; color: string; active: number; email: string | null; hours: Hours[]; skills: number[]; timeOff: { id: number; starts_at: string; ends_at: string; reason: string | null }[] };
type Svc = { id: number; name: string; category: string; active: number };

function Member({ m, services, reload }: { m: Staff; services: Svc[]; reload: () => void }) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string }>();
  const [skills, setSkills] = useState(new Set(m.skills));
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(undefined);
    try { await fn(); setMsg({ kind: 'ok', text: ok }); reload(); } catch (e: any) { setMsg({ kind: 'danger', text: e.message }); }
  };

  function saveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => api(`/admin/staff/${m.id}`, { method: 'PUT', body: { name: f.get('name'), phone: f.get('phone'), color: f.get('color'), active: f.get('active') === 'on' } }), 'Dados salvos.');
  }
  function saveHours(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rows = [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`on${d}`) === 'on').map((d) => ({
      weekday: d, start: toMin(String(f.get(`s${d}`))), end: toMin(String(f.get(`e${d}`))),
      breakStart: f.get(`bs${d}`) ? toMin(String(f.get(`bs${d}`))) : null, breakEnd: f.get(`be${d}`) ? toMin(String(f.get(`be${d}`))) : null,
    }));
    run(() => api(`/admin/staff/${m.id}/hours`, { method: 'PUT', body: rows }), 'Jornada salva.');
  }
  function addOff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => api(`/admin/staff/${m.id}/time-off`, { body: { start: spInputToIso(String(f.get('start'))), end: spInputToIso(String(f.get('end'))), reason: f.get('reason') } }), 'Folga registrada.');
  }
  const toggle = (id: number, on: boolean) => setSkills((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleCat = (c: string, on: boolean) => setSkills((s) => { const n = new Set(s); services.filter((x) => x.category === c).forEach((x) => (on ? n.add(x.id) : n.delete(x.id))); return n; });

  return (
    <section className="panel stack" style={{ gap: 18 }}>
      <div className="row"><span className="dot" style={{ background: m.color, width: 16, height: 16 }} /><h2 style={{ margin: 0 }}>{m.name}</h2><span className="badge">{m.role === 'admin' ? 'Administração' : 'Trancista'}</span>{!m.active && <span className="badge danger">inativa</span>}</div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <form className="grid-form" onSubmit={saveInfo}>
        <label className="field"><span>Nome</span><input className="input" name="name" defaultValue={m.name} required /></label>
        <label className="field"><span>WhatsApp (lembretes)</span><input className="input" name="phone" defaultValue={m.phone ?? ''} placeholder="(19) 9…" /></label>
        <label className="field"><span>Cor na agenda</span><input className="input" name="color" type="color" defaultValue={m.color} /></label>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" name="active" defaultChecked={!!m.active} /> Ativa</label>
        <button className="btn sm" style={{ alignSelf: 'end' }}>Salvar dados</button>
      </form>

      <details>
        <summary><b>Jornada e pausas</b></summary>
        <form className="stack" style={{ marginTop: 10 }} onSubmit={saveHours}>
          {[2, 3, 4, 5, 6, 0, 1].map((d) => {
            const h = m.hours.find((x) => x.weekday === d);
            return (
              <div key={d} className="row" style={{ gap: 8 }}>
                <label className="check" style={{ width: 120 }}><input type="checkbox" name={`on${d}`} defaultChecked={!!h} /> {WEEKDAYS[d]}</label>
                <input className="input" type="time" name={`s${d}`} defaultValue={hhmm(h?.start_min ?? 540)} style={{ width: 120 }} aria-label="Início" />
                <span>às</span>
                <input className="input" type="time" name={`e${d}`} defaultValue={hhmm(h?.end_min ?? 1080)} style={{ width: 120 }} aria-label="Fim" />
                <span className="muted small">pausa</span>
                <input className="input" type="time" name={`bs${d}`} defaultValue={h?.break_start_min != null ? hhmm(h.break_start_min) : ''} style={{ width: 120 }} aria-label="Início da pausa" />
                <input className="input" type="time" name={`be${d}`} defaultValue={h?.break_end_min != null ? hhmm(h.break_end_min) : ''} style={{ width: 120 }} aria-label="Fim da pausa" />
              </div>
            );
          })}
          <p className="small muted">Pausa bloqueia atendimentos que a atravessem (serviços longos não cabem em dia com pausa).</p>
          <button className="btn sm" style={{ justifySelf: 'start' }}>Salvar jornada</button>
        </form>
      </details>

      <details open={!m.skills.length}>
        <summary><b>Competências</b> ({skills.size} serviços){!m.skills.length && <span className="badge warn" style={{ marginLeft: 8 }}>marque o que ela faz</span>}</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          {CATEGORIES.filter((c) => services.some((s) => s.category === c)).map((c) => (
            <div key={c}>
              <label className="check"><input type="checkbox" checked={services.filter((s) => s.category === c).every((s) => skills.has(s.id))} onChange={(e) => toggleCat(c, e.target.checked)} /> <b>{c}</b></label>
              <div className="skills" style={{ paddingLeft: 32 }}>
                {services.filter((s) => s.category === c).map((s) => (
                  <label key={s.id} className="check small"><input type="checkbox" checked={skills.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} /> {s.name}</label>
                ))}
              </div>
            </div>
          ))}
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => run(() => api(`/admin/staff/${m.id}/skills`, { method: 'PUT', body: { serviceIds: [...skills] } }), 'Competências salvas.')}>Salvar competências</button>
        </div>
      </details>

      <details>
        <summary><b>Folgas e bloqueios</b> ({m.timeOff.length})</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          {m.timeOff.map((o) => (
            <div key={o.id} className="row"><span>{fmtDateTime(o.starts_at)} → {fmtDateTime(o.ends_at)}{o.reason && ` · ${o.reason}`}</span>
              <button className="btn ghost sm" onClick={() => run(() => api(`/admin/time-off/${o.id}`, { method: 'DELETE' }), 'Folga removida.')}>Remover</button></div>
          ))}
          <form className="row" onSubmit={addOff}>
            <input className="input" type="datetime-local" name="start" required style={{ width: 220 }} aria-label="Início" />
            <input className="input" type="datetime-local" name="end" required style={{ width: 220 }} aria-label="Fim" />
            <input className="input" name="reason" placeholder="Motivo (opcional)" style={{ flex: '1 1 160px' }} />
            <button className="btn sm">Adicionar</button>
          </form>
        </div>
      </details>
    </section>
  );
}

export default function Equipe() {
  const [team, error, reload] = useLoad<Staff[]>('/admin/staff');
  const [services] = useLoad<Svc[]>('/admin/services');
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!team || !services) return <Loading />;
  const active = services.filter((s) => s.active);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1>Equipe</h1>
      <p className="muted">A agenda só oferece horários de serviços com pelo menos uma profissional habilitada e livre. A cliente nunca escolhe a trancista.</p>
      {team.map((m) => <Member key={`${m.id}-${m.skills.length}`} m={m} services={active} reload={reload} />)}
    </div>
  );
}
