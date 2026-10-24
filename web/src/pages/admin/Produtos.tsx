import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Icon, Loading } from '../../components/ui';
import { api, money } from '../../lib/api';
import { useLoad } from './common';
import { PhotoInput } from './PhotoInput';

type Variant = { id: number; name: string; price_cents: number; stock_qty: number; reserved_qty: number; active: number };
type Prod = { id: number; name: string; category: string; description: string | null; photo_url: string | null; active: number; variants: Variant[] };
/** Linha editável de variação: `id` ausente = nova (com estoque inicial). */
type Row = { key: string; id?: number; name: string; price: string; initial: string; active: boolean; stock: number; reserved: number };

const CATS = ['Jumbos', 'Cabelos', 'Cremes e cuidados', 'Acessórios', 'Outros'];
const LOW = 3;
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const toCents = (v: string) => { const s = v.trim().replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const n = Number(s); return s && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const available = (p: Prod) => p.variants.filter((v) => v.active).reduce((n, v) => n + Math.max(0, v.stock_qty - v.reserved_qty), 0);
const priceRange = (p: Prod) => {
  const prices = p.variants.filter((v) => v.active).map((v) => v.price_cents);
  if (!prices.length) return '—';
  const [lo, hi] = [Math.min(...prices), Math.max(...prices)];
  return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
};
let seq = 0;
const toRow = (v: Variant): Row => ({ key: `v${v.id}`, id: v.id, name: v.name, price: reais(v.price_cents), initial: '', active: !!v.active, stock: v.stock_qty, reserved: v.reserved_qty });
const newRow = (name = ''): Row => ({ key: `n${++seq}`, name, price: '', initial: '0', active: true, stock: 0, reserved: 0 });

/** Entrada/saída imediata de uma variação (não espera o Salvar). */
function StockMove({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function move(dir: 1 | -1) {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) { setError('Informe a quantidade.'); return; }
    setBusy(true); setError('');
    try { await api(`/admin/product-variants/${row.id}/stock`, { body: { delta: dir * n, reason } }); onDone(`${dir > 0 ? 'Entrada' : 'Saída'} de ${n} em "${row.name}" registrada.`); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    // Enter aqui movimenta o estoque, não salva/fecha a janela.
    <div className="stock-move" onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
      <b className="small">Movimentar estoque de "{row.name}"</b>
      <div className="row">
        <input className="input" type="number" min={1} placeholder="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 130 }} aria-label="Quantidade" />
        <input className="input" placeholder="Motivo (opcional): compra, perda, ajuste…" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 220px' }} aria-label="Motivo" />
        <button type="button" className="btn sm" disabled={busy} onClick={() => move(1)}>+ Entrada</button>
        <button type="button" className="btn sm outline" disabled={busy} onClick={() => move(-1)}>− Saída</button>
      </div>
      {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

/** Janela do produto: cabeçalho com X, seções separadas, rodapé com Salvar (salva tudo e fecha). */
function ProductModal({ product, onClose, onSaved }: { product: Prod | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>(() => (product ? product.variants.map(toRow) : [newRow('Padrão')]));
  const [moving, setMoving] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dlg.current?.showModal(); }, []);
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function refreshStock(msg: string) {
    setMoving(null); setNote(msg);
    const fresh = (await api<Prod[]>('/admin/products')).find((p) => p.id === product?.id);
    if (fresh) setRows((rs) => rs.map((r) => { const v = fresh.variants.find((x) => x.id === r.id); return v ? { ...r, stock: v.stock_qty, reserved: v.reserved_qty } : r; }));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    const variants = [];
    for (const r of rows) {
      const price = toCents(r.price);
      if (!r.name.trim()) { setError('Dê um nome para cada variação (ex.: "Padrão", "Preto 1B").'); return; }
      if (price == null) { setError(`Preço inválido em "${r.name}". Use, por exemplo, 29,90.`); return; }
      variants.push({ id: r.id, name: r.name.trim(), price_cents: price, active: r.active, ...(r.id ? {} : { stock_qty: Number(r.initial) || 0 }) });
    }
    if (!variants.length) { setError('O produto precisa de ao menos uma variação.'); return; }
    const body = { name: f.get('name'), category: f.get('category'), description: f.get('description'), photo_url: f.get('photo_url'), active: f.get('active') === 'on', variants };
    setBusy(true);
    try {
      if (product) await api(`/admin/products/${product.id}`, { method: 'PUT', body });
      else await api('/admin/products', { body });
      dlg.current?.close();
      onSaved(product ? 'Produto salvo.' : 'Produto criado.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <dialog ref={dlg} className="modal" onClose={onClose} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }} aria-labelledby="modal-title">
      <form onSubmit={save} className="modal-form">
        <header className="modal-head">
          <h2 id="modal-title">{product ? product.name : 'Novo produto'}</h2>
          <button type="button" className="modal-x" onClick={() => dlg.current?.close()} aria-label="Fechar">{Icon.close}</button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Foto e informações</h3>
            <div className="prod-info">
              <PhotoInput name="photo_url" value={product?.photo_url ?? null} large />
              <div className="stack">
                <label className="field"><span>Nome do produto</span><input className="input" name="name" required maxLength={120} defaultValue={product?.name} /></label>
                <label className="field"><span>Categoria</span>
                  <input className="input" name="category" list="cats" required maxLength={40} defaultValue={product?.category ?? 'Jumbos'} />
                  <datalist id="cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                <label className="field"><span>Descrição</span><textarea className="input" name="description" rows={5} defaultValue={product?.description ?? ''} placeholder="Cor, comprimento, peso, como usar…" /></label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={product ? !!product.active : true} /><span>Visível na loja</span></label>
              </div>
            </div>
          </section>

          <section className="modal-section">
            <h3>Variações, preços e estoque</h3>
            <p className="small muted">Cada variação (cor, tamanho…) tem preço e estoque próprios. Com uma só, use "Padrão". Disponível = estoque − reservado em pedidos.</p>
            {note && <Alert kind="ok">{note}</Alert>}
            <div className="var-table" role="table">
              <div className="var-row var-head" role="row">
                <span>Variação</span><span>Preço (R$)</span><span>Estoque</span><span>Reservado</span><span>Disponível</span><span>Ativa</span><span />
              </div>
              {rows.map((r) => (
                <div key={r.key} className="var-row" role="row">
                  <label data-label="Variação"><input className="input" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="Ex.: Preto 1B" aria-label="Nome da variação" /></label>
                  <label data-label="Preço (R$)"><input className="input" inputMode="decimal" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} placeholder="29,90" aria-label="Preço" /></label>
                  {r.id ? <>
                    <span data-label="Estoque"><b>{r.stock}</b></span>
                    <span data-label="Reservado">{r.reserved}</span>
                    <span data-label="Disponível">{r.stock - r.reserved < 1 ? <span className="badge danger">esgotado</span> : r.stock - r.reserved <= LOW ? <span className="badge warn">{r.stock - r.reserved}</span> : r.stock - r.reserved}</span>
                  </> : <>
                    <label data-label="Estoque inicial" className="span-3"><input className="input" type="number" min={0} value={r.initial} onChange={(e) => set(r.key, { initial: e.target.value })} aria-label="Estoque inicial" /></label>
                  </>}
                  <label data-label="Ativa" className="var-active"><input type="checkbox" checked={r.active} onChange={(e) => set(r.key, { active: e.target.checked })} aria-label="Ativa" /></label>
                  <span className="var-actions">
                    {r.id
                      ? <button type="button" className="btn outline sm" onClick={() => { setNote(''); setMoving(moving === r.id ? null : r.id!); }}>{moving === r.id ? 'Fechar' : 'Movimentar'}</button>
                      : <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remover variação">Remover</button>}
                  </span>
                  {moving === r.id && r.id && <StockMove row={r} onDone={refreshStock} />}
                </div>
              ))}
            </div>
            <button type="button" className="btn outline sm" style={{ justifySelf: 'start' }} onClick={() => setRows((rs) => [...rs, newRow()])}>+ Adicionar variação</button>
            {product && <p className="small muted">Para tirar uma variação da loja sem perder o histórico, desmarque "Ativa".</p>}
          </section>
        </div>

        <footer className="modal-foot">
          {error && <span className="small" style={{ color: 'var(--danger)', marginRight: 'auto' }} role="alert">{error}</span>}
          <button type="button" className="btn ghost" onClick={() => dlg.current?.close()}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </footer>
      </form>
    </dialog>
  );
}

export default function Produtos() {
  const [list, error, reload] = useLoad<Prod[]>('/admin/products');
  const [edit, setEdit] = useState<Prod | 'new' | null>(null);
  const [toast, setToast] = useState('');
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!list) return <Loading />;
  const cats = [...new Set(list.map((p) => p.category))];
  const shown = list.filter((p) => (!cat || p.category === cat) && (!term || p.name.toLowerCase().includes(term.toLowerCase())));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between"><h1 style={{ margin: 0 }}>Produtos e estoque</h1><button className="btn" onClick={() => { setToast(''); setEdit('new'); }}>Novo produto</button></div>
      {toast && <Alert kind="ok">{toast}</Alert>}
      <div className="row">
        <input className="input" placeholder="Buscar produto" value={term} onChange={(e) => setTerm(e.target.value)} style={{ maxWidth: 320 }} aria-label="Buscar produto" />
        {cats.length > 1 && (
          <div className="chips" role="group" aria-label="Categoria">
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todas</button>
            {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        )}
      </div>
      {!list.length ? <div className="panel"><p className="muted">Nenhum produto ainda. Cadastre o primeiro: ele aparece na Loja do site.</p></div> : (
        <div className="prod-grid">
          {shown.map((p) => {
            const avail = available(p);
            return (
              <button key={p.id} type="button" className="prod-card" onClick={() => { setToast(''); setEdit(p); }} style={{ opacity: p.active ? 1 : 0.6 }}>
                <div className="prod-photo">{p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span className="muted small">Sem foto</span>}</div>
                <div className="prod-body">
                  <b>{p.name}</b>
                  <span className="muted small">{p.category} · {p.variants.filter((v) => v.active).length} variação(ões)</span>
                  <span className="prod-price">{priceRange(p)}</span>
                  <div className="row" style={{ gap: 6 }}>
                    {!p.active && <span className="badge">Inativo</span>}
                    {avail < 1 ? <span className="badge danger">Esgotado</span> : <span className={`badge ${avail <= LOW ? 'warn' : 'ok'}`}>{avail} disponíve{avail === 1 ? 'l' : 'is'}</span>}
                  </div>
                  <span className="btn sm outline block">Gerenciar</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {edit && <ProductModal key={edit === 'new' ? 'new' : edit.id} product={edit === 'new' ? null : edit} onClose={() => { setEdit(null); reload(); }} onSaved={setToast} />}
    </div>
  );
}
