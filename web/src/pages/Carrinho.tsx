import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Icon, Loading, useSite, usePageTitle } from '../components/ui';
import { api, money, waLink } from '../lib/api';
import { cart, useCart } from '../lib/cart';
import { useProducts } from './Loja';

type Done = { code: string; totalCents: number; text: string };

export default function Carrinho() {
  usePageTitle('Meu pedido');
  const site = useSite();
  const items = useCart();
  const { list, refresh } = useProducts();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState<'retirada' | 'entrega'>('retirada');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done>();
  const wa = site?.salon.whatsapp ?? '19988651935';

  if (done) {
    return (
      <div className="narrow page-head stack" style={{ gap: 18 }}>
        <h1 className="title-line">Pedido {done.code}</h1>
        <p>Falta só um passo: envie o pedido pelo WhatsApp. A gente confirma a disponibilidade, o pagamento e a {delivery === 'entrega' ? 'entrega' : 'retirada'}.</p>
        <div className="card"><p style={{ whiteSpace: 'pre-line' }}>{done.text.replace(/\*/g, '')}</p></div>
        <a className="btn wine block" href={waLink(wa, `Olá! Quero finalizar meu pedido:\n\n${done.text}`)} target="_blank" rel="noopener">Enviar pedido pelo WhatsApp <span className="chev">{Icon.chev}</span></a>
        <p className="small muted">Os itens ficam reservados para você até a confirmação.</p>
        <Link to="/loja" className="muted">Voltar à loja</Link>
      </div>
    );
  }
  if (!list) return <Loading />;

  const lines = items.map((i) => {
    const p = list.find((x) => x.variants.some((v) => v.id === i.variantId));
    const v = p?.variants.find((x) => x.id === i.variantId);
    return p && v ? { ...i, p, v } : null;
  });
  const valid = lines.filter((l) => !!l);
  const total = valid.reduce((s, l) => s + l.v.priceCents * l.qty, 0);
  const problem = valid.some((l) => l.qty > l.v.available) || lines.some((l) => !l);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<Done>('/orders', { body: { items: valid.map((l) => ({ variantId: l.variantId, qty: l.qty })), name, phone, delivery, notes, consent } });
      cart.clear(); refresh(); setDone(r);
    } catch (err: any) { setError(err.message); refresh(); } finally { setBusy(false); }
  }

  if (!items.length) {
    return (
      <div className="narrow page-head stack center" style={{ gap: 18 }}>
        <h1 className="title-line center">Meu pedido</h1>
        <p className="muted">Seu carrinho está vazio.</p>
        <Link to="/loja" className="btn" style={{ justifySelf: 'center' }}>Ver produtos</Link>
      </div>
    );
  }

  return (
    <div className="wrap page-head booking-layout">
      <div className="stack" style={{ gap: 16 }}>
        <h1 className="title-line">Meu pedido</h1>
        {lines.some((l) => !l) && <Alert>Um item não está mais disponível e foi ignorado. <button className="btn ghost sm" onClick={() => items.forEach((i, k) => !lines[k] && cart.set(i.variantId, 0))}>Remover</button></Alert>}
        {valid.map((l) => (
          <div key={l.variantId} className="card cart-line">
            <div className="ph thumb" style={{ '--img': l.p.photoUrl ? `url(${l.p.photoUrl})` : 'none' } as CSSProperties} />
            <div className="stack" style={{ gap: 4 }}>
              <b>{l.p.name}</b>
              {l.p.variants.length > 1 && <span className="small muted">{l.v.name}</span>}
              <span>{money(l.v.priceCents)}</span>
              {l.qty > l.v.available && <span className="small" style={{ color: 'var(--danger)' }}>Só {l.v.available} disponível(is)</span>}
            </div>
            <div className="stack" style={{ justifyItems: 'end', gap: 8 }}>
              <div className="qty">
                <button type="button" onClick={() => cart.set(l.variantId, l.qty - 1)} aria-label="Diminuir">−</button>
                <span>{l.qty}</span>
                <button type="button" onClick={() => cart.set(l.variantId, l.qty + 1)} disabled={l.qty >= l.v.available} aria-label="Aumentar">+</button>
              </div>
              <b>{money(l.v.priceCents * l.qty)}</b>
            </div>
          </div>
        ))}
        <Link to="/loja" className="muted">+ Adicionar mais produtos</Link>
      </div>
      <aside>
        <form className="card stack" onSubmit={send}>
          <div className="sum-row big" style={{ borderTop: 0 }}><span>Total</span><b>{money(total)}</b></div>
          <label className="field"><span>Nome</span><input className="input" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>WhatsApp com DDD</span><input className="input" required inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <div className="times" role="radiogroup" aria-label="Entrega">
            {(['retirada', 'entrega'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={delivery === d} className={`time ${delivery === d ? 'sel' : ''}`} style={{ flex: 1 }} onClick={() => setDelivery(d)}>{d === 'retirada' ? 'Retirar no salão' : 'Entrega'}</button>
            ))}
          </div>
          {delivery === 'entrega' && <p className="small muted">Endereço e frete são combinados pelo WhatsApp.</p>}
          <label className="field"><span>Observações (opcional)</span><textarea className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Autorizo o uso do meu nome e WhatsApp para este pedido (<Link to="/politicas#privacidade">privacidade</Link>).</span></label>
          {error && <Alert kind="danger">{error}</Alert>}
          <button className="btn wine block" disabled={busy || !consent || problem || !valid.length}>{busy ? 'Enviando…' : 'Finalizar pelo WhatsApp'} <span className="chev">{Icon.chev}</span></button>
          <p className="small muted">O pagamento é combinado pelo WhatsApp. Produtos não entram no sinal dos serviços.</p>
        </form>
      </aside>
    </div>
  );
}
