import { useRef, useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, CATEGORIES, fmtDateTime, fmtDuration, money } from '../../lib/api';
import { useLoad } from './common';
import { PhotoInput } from './PhotoInput';

type Variant = { id: number; name: string; price_cents: number; duration_min: number | null; sort: number; active: number };
type Svc = {
  id: number; name: string; category: string; description: string | null; instructions: string | null; price_cents: number | null;
  price_type: 'fixed' | 'from'; duration_min: number | null; duration_note: string | null; buffer_min: number; photo_url: string | null;
  active: number; staff_count: number; variants: Variant[];
};
type Hist = { id: number; field: string; old_value: string | null; new_value: string | null; staff_name: string | null; variant_name: string | null; created_at: string };

const FIELD: Record<string, string> = { price_cents: 'Preço', duration_min: 'Duração', price_type: 'Tipo de preço', active: 'Ativo' };
const reais = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const cents = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s ? Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100) : null; };

export default function Servicos() {
  const [list, error, reload] = useLoad<Svc[]>('/admin/services');
  const [edit, setEdit] = useState<Svc | 'new' | null>(null);
  const [hist, setHist] = useState<Hist[]>();
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');
  const dlg = useRef<HTMLDialogElement>(null);

  function open(s: Svc | 'new') {
    setEdit(s); setMsg(''); setHist(undefined);
    if (s !== 'new') api<Hist[]>(`/admin/services/${s.id}/history`).then(setHist);
    dlg.current?.showModal();
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: f.get('name'), category: f.get('category'), description: f.get('description'), instructions: f.get('instructions'),
      price_cents: cents(f.get('price')), price_type: f.get('price_type'), duration_min: f.get('duration') || null,
      duration_note: f.get('duration_note'), buffer_min: f.get('buffer') || 0, photo_url: f.get('photo_url'), active: f.get('active') === 'on',
    };
    try {
      if (edit === 'new') await api('/admin/services', { body });
      else await api(`/admin/services/${edit!.id}`, { method: 'PUT', body });
      dlg.current?.close(); reload();
    } catch (err: any) { setMsg(err.message); }
  }

  async function saveVariant(e: FormEvent<HTMLFormElement>, v: Variant | null, serviceId: number) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get('name'), price_cents: cents(f.get('price')), duration_min: f.get('duration') || null, sort: v?.sort ?? 9, active: f.get('active') === 'on' };
    try {
      if (v) await api(`/admin/variants/${v.id}`, { method: 'PUT', body });
      else { await api(`/admin/services/${serviceId}/variants`, { body }); e.currentTarget.reset(); }
      setMsg('Opção salva.'); reload();
      const fresh = await api<Svc[]>('/admin/services');
      setEdit(fresh.find((x) => x.id === serviceId) ?? null);
    } catch (err: any) { setMsg(err.message); }
  }

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!list) return <Loading />;
  const shown = list.filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()));
  const s = edit === 'new' ? null : edit;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Serviços e preços</h1><button className="btn" onClick={() => open('new')}>Novo serviço</button></div>
      <p className="muted">Mudar preço ou duração não altera reservas já feitas (cada reserva guarda o valor do momento). Toda alteração fica no histórico.</p>
      <input className="input" placeholder="Buscar serviço" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 360 }} />
      <div className="panel table-wrap">
        <table className="table">
          <thead><tr><th>Serviço</th><th>Categoria</th><th>Preço</th><th>Duração</th><th>Trancistas</th><th></th></tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.id} className="click" onClick={() => open(x)} style={{ opacity: x.active ? 1 : 0.5 }}>
                <td><b>{x.name}</b>{!x.active && <span className="badge" style={{ marginLeft: 6 }}>inativo</span>}</td>
                <td>{x.category}</td>
                <td>{x.variants.length ? x.variants.map((v) => `${v.name}: ${money(v.price_cents)}`).join(' · ') : x.price_cents == null ? '—' : `${x.price_type === 'from' ? 'a partir de ' : ''}${money(x.price_cents)}`}</td>
                <td>{x.variants.length ? x.variants.map((v) => fmtDuration(v.duration_min)).join(' · ') : x.duration_min ? fmtDuration(x.duration_min, x.duration_note) : <span className="badge warn">pendente</span>}</td>
                <td>{x.staff_count ? x.staff_count : <span className="badge warn">nenhuma</span>}</td>
                <td><span className="btn sm ghost">Editar</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog ref={dlg} onClose={() => setEdit(null)} style={{ width: 'min(720px, 100% - 24px)' }}>
        {edit && (
          <div className="stack">
            <form className="stack" onSubmit={save} key={s?.id ?? 'new'}>
              <h2 style={{ fontSize: '1.5rem' }}>{s ? s.name : 'Novo serviço'}</h2>
              <div className="grid-form">
                <label className="field" style={{ gridColumn: '1 / -1' }}><span>Nome</span><input className="input" name="name" required defaultValue={s?.name} /></label>
                <label className="field"><span>Categoria</span>
                  <select className="select" name="category" defaultValue={s?.category ?? 'Outros'}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                </label>
                <label className="field"><span>Preço (R$)</span><input className="input" name="price" inputMode="decimal" defaultValue={reais(s?.price_cents ?? null)} placeholder="vazio = a confirmar" /></label>
                <label className="field"><span>Tipo de preço</span>
                  <select className="select" name="price_type" defaultValue={s?.price_type ?? 'fixed'}><option value="fixed">Valor fixo</option><option value="from">A partir de</option></select>
                </label>
                <label className="field"><span>Duração (min)</span><input className="input" name="duration" type="number" min={5} max={720} defaultValue={s?.duration_min ?? ''} placeholder="vazio = pendente" /></label>
                <label className="field"><span>Faixa exibida (opcional)</span><input className="input" name="duration_note" defaultValue={s?.duration_note ?? ''} placeholder="ex.: 4 h a 5 h" /></label>
                <label className="field"><span>Preparo depois (min)</span><input className="input" name="buffer" type="number" min={0} max={240} defaultValue={s?.buffer_min ?? 0} /></label>
                <PhotoInput name="photo_url" value={s?.photo_url ?? null} />
                <label className="field" style={{ gridColumn: '1 / -1' }}><span>Descrição</span><textarea className="input" name="description" defaultValue={s?.description ?? ''} /></label>
                <label className="field" style={{ gridColumn: '1 / -1' }}><span>Instruções para a cliente</span><textarea className="input" name="instructions" defaultValue={s?.instructions ?? ''} /></label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={s ? !!s.active : true} /> Ativo no site</label>
              </div>
              {msg && <Alert kind={msg.endsWith('salva.') ? 'ok' : 'danger'}>{msg}</Alert>}
              <div className="row"><button className="btn">Salvar</button><button type="button" className="btn ghost" onClick={() => dlg.current?.close()}>Fechar</button></div>
            </form>

            {s && (
              <div className="stack" style={{ borderTop: '1px solid #eadfce', paddingTop: 14 }}>
                <h3>Opções de preço</h3>
                <p className="small muted">Com opções, a cliente escolhe uma delas e o preço/duração vêm da opção.</p>
                {[...s.variants, null].map((v) => (
                  <form key={v?.id ?? 'novo'} className="row" onSubmit={(e) => saveVariant(e, v, s.id)}>
                    <input className="input" name="name" required placeholder="Nome da opção" defaultValue={v?.name} style={{ flex: '2 1 180px' }} />
                    <input className="input" name="price" required placeholder="R$" inputMode="decimal" defaultValue={reais(v?.price_cents ?? null)} style={{ flex: '1 1 90px' }} />
                    <input className="input" name="duration" type="number" placeholder="min" defaultValue={v?.duration_min ?? ''} style={{ flex: '1 1 80px' }} />
                    <label className="check"><input type="checkbox" name="active" defaultChecked={v ? !!v.active : true} /> ativa</label>
                    <button className="btn sm">{v ? 'Salvar' : 'Adicionar'}</button>
                  </form>
                ))}
                <h3>Histórico de alterações</h3>
                {!hist ? <Loading /> : hist.length ? hist.map((h) => (
                  <p key={h.id} className="small">{fmtDateTime(h.created_at)} · {FIELD[h.field] ?? h.field}{h.variant_name && ` (${h.variant_name})`}: {h.old_value ?? '—'} → {h.new_value ?? '—'}{h.staff_name && ` · ${h.staff_name}`}</p>
                )) : <p className="muted small">Sem alterações.</p>}
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
