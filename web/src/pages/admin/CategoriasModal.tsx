import { useEffect, useRef, useState } from 'react';
import { Alert, Icon } from '../../components/ui';
import { api } from '../../lib/api';

export type Category = { id: number; name: string; sort: number; products: number };

/** Categorias da loja: criar, renomear, mudar a ordem e excluir. Cada ação vale na hora. */
export function CategoriasModal({ onClose }: { onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string }>();
  const load = async () => {
    const list = await api<Category[]>('/admin/product-categories');
    setCats(list); setNames(Object.fromEntries(list.map((c) => [c.id, c.name])));
  };
  useEffect(() => { dlg.current?.showModal(); load(); }, []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(undefined);
    try { await fn(); await load(); setMsg({ kind: 'ok', text: ok }); return true; } catch (e: any) { setMsg({ kind: 'danger', text: e.message }); return false; }
  }
  const move = (i: number, d: -1 | 1) => {
    const ids = cats.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => api('/admin/product-categories/order', { method: 'PUT', body: { ids } }), 'Ordem atualizada.');
  };
  const del = (c: Category) => run(() => api(`/admin/product-categories/${c.id}${c.products ? `?moveTo=${moveTo}` : ''}`, { method: 'DELETE' }), `Categoria "${c.name}" excluída.`).then((ok) => ok && setDeleting(null));

  return (
    <dialog ref={dlg} className="modal modal-sm" onClose={onClose} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }} aria-labelledby="cat-title">
      <div className="modal-form">
        <header className="modal-head">
          <h2 id="cat-title">Categorias da loja</h2>
          <button type="button" className="modal-x" onClick={() => dlg.current?.close()} aria-label="Fechar">{Icon.close}</button>
        </header>
        <div className="modal-body">
          <section className="modal-section">
            <p className="small muted">A ordem daqui é a ordem dos filtros na Loja. Renomear muda a categoria de todos os produtos dela.</p>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <div className="cat-list">
              {cats.map((c, i) => (
                <div key={c.id} className="cat-row">
                  <div className="cat-order">
                    <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${c.name}`}>↑</button>
                    <button type="button" className="btn ghost sm" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${c.name}`}>↓</button>
                  </div>
                  <form className="cat-name" onSubmit={(e) => { e.preventDefault(); run(() => api(`/admin/product-categories/${c.id}`, { method: 'PUT', body: { name: names[c.id] } }), 'Categoria renomeada.'); }}>
                    <input className="input" value={names[c.id] ?? ''} maxLength={40} onChange={(e) => setNames({ ...names, [c.id]: e.target.value })} aria-label={`Nome da categoria ${c.name}`} />
                    {names[c.id] !== c.name && <button className="btn sm">Renomear</button>}
                  </form>
                  <span className="small muted cat-count">{c.products} produto{c.products === 1 ? '' : 's'}</span>
                  <button type="button" className="btn ghost sm" onClick={() => { setDeleting(deleting === c.id ? null : c.id); setMoveTo(''); }}>{deleting === c.id ? 'Cancelar' : 'Excluir'}</button>
                  {deleting === c.id && (
                    <div className="stock-move">
                      {c.products ? <>
                        <span className="small">"{c.name}" tem {c.products} produto(s). Mover para:</span>
                        <div className="row">
                          <select className="select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ maxWidth: 260 }} aria-label="Mover produtos para">
                            <option value="">Escolha a categoria…</option>
                            {cats.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          <button type="button" className="btn sm danger" disabled={!moveTo} onClick={() => del(c)}>Mover e excluir</button>
                        </div>
                      </> : (
                        <div className="row"><span className="small">Excluir "{c.name}"?</span><button type="button" className="btn sm danger" onClick={() => del(c)}>Excluir</button></div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/product-categories', { body: { name: newName } }), `Categoria "${newName}" criada.`).then((ok) => ok && setNewName('')); }}>
              <input className="input" placeholder="Nova categoria (ex.: Perucas)" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} required style={{ flex: '1 1 220px' }} aria-label="Nova categoria" />
              <button className="btn sm">+ Adicionar categoria</button>
            </form>
          </section>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Concluir</button>
        </footer>
      </div>
    </dialog>
  );
}
