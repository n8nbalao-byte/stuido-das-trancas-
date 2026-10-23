import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Icon, Loading, usePageTitle } from '../components/ui';
import { api, money, type Product } from '../lib/api';
import { cart, useCart } from '../lib/cart';

export default function Produto() {
  const { slug } = useParams();
  const nav = useNavigate();
  const items = useCart();
  const [p, setP] = useState<Product>();
  const [error, setError] = useState('');
  const [variantId, setVariantId] = useState<number>();
  const [qty, setQty] = useState(1);
  useEffect(() => {
    api<Product>(`/products/${slug}`).then((x) => { setP(x); setVariantId(x.variants.find((v) => v.available > 0)?.id ?? x.variants[0].id); }, (e) => setError(e.message));
  }, [slug]);
  usePageTitle(p?.name ?? 'Produto');
  if (error) return <div className="narrow page-head"><Alert kind="danger">{error}</Alert></div>;
  if (!p) return <Loading />;
  const v = p.variants.find((x) => x.id === variantId)!;
  const inCart = items.find((i) => i.variantId === v.id)?.qty ?? 0;
  const max = Math.max(0, v.available - inCart);

  return (
    <div className="wrap page-head">
      <Link to="/loja" className="row muted" style={{ textDecoration: 'none', marginBottom: 18 }}>{Icon.back} Loja</Link>
      <div className="two" style={{ alignItems: 'start' }}>
        <div className="svc" style={{ boxShadow: 'none' }}>
          <div className="ph" style={{ aspectRatio: '1', '--img': p.photoUrl ? `url(${p.photoUrl})` : 'none' } as CSSProperties} role="img" aria-label={p.name} />
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <span className="badge">{p.category}</span>
          <h1 className="title-line" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>{p.name}</h1>
          <p style={{ fontSize: '1.6rem', fontFamily: 'var(--serif)' }}>{money(v.priceCents)}</p>
          {p.description && <p style={{ whiteSpace: 'pre-line' }}>{p.description}</p>}
          {p.variants.length > 1 && (
            <div className="field">
              <span>Opção</span>
              <div className="times">
                {p.variants.map((x) => (
                  <button key={x.id} type="button" className={`time ${x.id === v.id ? 'sel' : ''}`} style={{ padding: '0 14px', opacity: x.available ? 1 : 0.5 }} onClick={() => { setVariantId(x.id); setQty(1); }}>
                    {x.name}{!x.available && ' (esgotado)'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {v.available < 1 ? <Alert>Esgotado no momento. Fale com a gente pelo WhatsApp para saber quando chega.</Alert> : (
            <>
              <div className="row">
                <span>Quantidade</span>
                <div className="qty">
                  <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Diminuir">−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max} aria-label="Aumentar">+</button>
                </div>
                <span className="small muted">{v.available} disponível(is)</span>
              </div>
              {max < 1 ? <Alert kind="info">Você já tem todo o disponível no carrinho.</Alert> : (
                <button className="btn wine block" onClick={() => { cart.add(v.id, qty); nav('/carrinho'); }}>Adicionar ao pedido <span className="chev">{Icon.chev}</span></button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
