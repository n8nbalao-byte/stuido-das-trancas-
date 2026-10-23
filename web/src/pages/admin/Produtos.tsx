import { useRef, useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, money } from '../../lib/api';
import { useLoad } from './common';
import { PhotoInput } from './PhotoInput';

type Variant = { id: number; name: string; price_cents: number; stock_qty: number; reserved_qty: number; active: number };
type Prod = { id: number; name: string; category: string; description: string | null; photo_url: string | null; active: number; variants: Variant[] };

const CATS = ['Jumbos', 'Cabelos', 'Cremes e cuidados', 'Acessórios', 'Outros'];
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '0').replace(/\./g, '').replace(',', '.')) * 100);

export default function Produtos() {
  const [list, error, reload] = useLoad<Prod[]>('/admin/products');
  const [edit, setEdit] = useState<Prod | 'new' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string }>();
  const dlg = useRef<HTMLDialogElement>(null);
  const open = (p: Prod | 'new') => { setEdit(p); setMsg(undefined); dlg.current?.showModal(); };
  const refreshEdit = async (id: number) => { const fresh = await api<Prod[]>('/admin/products'); setEdit(fresh.find((x) => x.id === id) ?? null); reload(); };
  const run = async (fn: () => Promise<unknown>, ok: string, id?: number) => {
    setMsg(undefined);
    try { await fn(); setMsg({ kind: 'ok', text: ok }); if (id) await refreshEdit(id); else reload(); } catch (e: any) { setMsg({ kind: 'danger', text: e.message }); }
  };

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get('name'), category: f.get('category'), description: f.get('description'), photo_url: f.get('photo_url'), active: f.get('active') === 'on', price_cents: cents(f.get('price')), stock_qty: Number(f.get('stock') || 0) };
    if (edit === 'new') run(async () => { await api('/admin/products', { body }); dlg.current?.close(); }, 'Produto criado.');
    else run(() => api(`/admin/products/${edit!.id}`, { method: 'PUT', body }), 'Produto salvo.', edit!.id);
  }

  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!list) return <Loading />;
  const p = edit === 'new' ? null : edit;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Produtos e estoque</h1><button className="btn" onClick={() => open('new')}>Novo produto</button></div>
      <p className="muted">Disponível = estoque − reservado em pedidos. O estoque só baixa quando o pedido é marcado como pago.</p>
      {!list.length ? <div className="panel"><p className="muted">Nenhum produto ainda. Cadastre o primeiro: ele aparece na Loja do site.</p></div> : (
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Produto</th><th>Variações · preço</th><th>Estoque</th><th>Reservado</th><th>Disponível</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className="click" onClick={() => open(x)} style={{ opacity: x.active ? 1 : 0.5 }}>
                  <td>{x.photo_url ? <img src={x.photo_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} /> : <span className="muted">—</span>}</td>
                  <td><b>{x.name}</b><br /><span className="muted small">{x.category}{!x.active && ' · inativo'}</span></td>
                  <td>{x.variants.map((v) => <div key={v.id}>{v.name}: {money(v.price_cents)}</div>)}</td>
                  <td>{x.variants.map((v) => <div key={v.id}>{v.stock_qty}</div>)}</td>
                  <td>{x.variants.map((v) => <div key={v.id}>{v.reserved_qty}</div>)}</td>
                  <td>{x.variants.map((v) => <div key={v.id}>{v.stock_qty - v.reserved_qty < 1 ? <span className="badge danger">esgotado</span> : v.stock_qty - v.reserved_qty}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dlg} onClose={() => setEdit(null)} style={{ width: 'min(720px, 100% - 24px)' }}>
        {edit && (
          <div className="stack">
            <form className="stack" onSubmit={save} key={p?.id ?? 'new'}>
              <h2 style={{ fontSize: '1.5rem' }}>{p ? p.name : 'Novo produto'}</h2>
              <div className="grid-form">
                <label className="field" style={{ gridColumn: '1 / -1' }}><span>Nome</span><input className="input" name="name" required defaultValue={p?.name} /></label>
                <label className="field"><span>Categoria</span>
                  <input className="input" name="category" list="cats" required defaultValue={p?.category ?? 'Jumbos'} />
                  <datalist id="cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                {!p && <>
                  <label className="field"><span>Preço (R$)</span><input className="input" name="price" inputMode="decimal" required /></label>
                  <label className="field"><span>Estoque inicial</span><input className="input" name="stock" type="number" min={0} defaultValue={0} /></label>
                </>}
                <PhotoInput name="photo_url" value={p?.photo_url ?? null} />
                <label className="field" style={{ gridColumn: '1 / -1' }}><span>Descrição</span><textarea className="input" name="description" defaultValue={p?.description ?? ''} placeholder="Cor, comprimento, peso, como usar…" /></label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={p ? !!p.active : true} /><span>Visível na loja</span></label>
              </div>
              {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
              <div className="row"><button className="btn">Salvar</button><button type="button" className="btn ghost" onClick={() => dlg.current?.close()}>Fechar</button></div>
            </form>

            {p && (
              <div className="stack" style={{ borderTop: '1px solid #eadfce', paddingTop: 14 }}>
                <h3>Variações e estoque</h3>
                <p className="small muted">Ex.: cores ou tamanhos. Cada variação tem preço e estoque próprios. Com uma só, chame de "Padrão".</p>
                {p.variants.map((v) => (
                  <div key={v.id} className="stack" style={{ gap: 6, padding: 10, background: '#fbf6ee', borderRadius: 10 }}>
                    <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api(`/admin/product-variants/${v.id}`, { method: 'PUT', body: { name: f.get('name'), price_cents: cents(f.get('price')), active: f.get('active') === 'on' } }), 'Variação salva.', p.id); }}>
                      <input className="input" name="name" required defaultValue={v.name} style={{ flex: '2 1 160px' }} aria-label="Nome da variação" />
                      <input className="input" name="price" required inputMode="decimal" defaultValue={reais(v.price_cents)} style={{ flex: '1 1 90px' }} aria-label="Preço" />
                      <label className="check"><input type="checkbox" name="active" defaultChecked={!!v.active} /><span>ativa</span></label>
                      <button className="btn sm">Salvar</button>
                    </form>
                    <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const n = Number(f.get('qty')); const dir = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value'); run(() => api(`/admin/product-variants/${v.id}/stock`, { body: { delta: dir === 'out' ? -n : n, reason: f.get('reason') } }), 'Estoque atualizado.', p.id); }}>
                      <span className="small">Estoque <b>{v.stock_qty}</b> · reservado {v.reserved_qty}</span>
                      <input className="input" name="qty" type="number" min={1} required placeholder="qtd" style={{ width: 90 }} aria-label="Quantidade" />
                      <input className="input" name="reason" placeholder="motivo (opcional)" style={{ flex: '1 1 140px' }} aria-label="Motivo" />
                      <button className="btn sm" value="in">Entrada</button>
                      <button className="btn sm outline" value="out">Saída</button>
                    </form>
                  </div>
                ))}
                <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api(`/admin/products/${p.id}/variants`, { body: { name: f.get('name'), price_cents: cents(f.get('price')), active: true } }), 'Variação criada.', p.id); e.currentTarget.reset(); }}>
                  <input className="input" name="name" required placeholder="Nova variação (ex.: Cor 1B)" style={{ flex: '2 1 160px' }} />
                  <input className="input" name="price" required inputMode="decimal" placeholder="R$" style={{ flex: '1 1 90px' }} />
                  <button className="btn sm">Adicionar</button>
                </form>
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
