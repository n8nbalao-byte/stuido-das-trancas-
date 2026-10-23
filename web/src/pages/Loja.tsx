import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Icon, Loading, useSite, usePageTitle } from '../components/ui';
import { api, money, waLink, type Product } from '../lib/api';

let cache: Promise<Product[]> | null = null;
export function useProducts() {
  const [list, setList] = useState<Product[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    cache ??= api<Product[]>('/products');
    cache.then(setList, (e) => { cache = null; setError(e.message); });
  }, []);
  // Recarrega o disponível (ex.: depois de fechar um pedido ou de um erro de estoque).
  const refresh = () => { cache = api<Product[]>('/products'); cache.then(setList, () => { cache = null; }); };
  return { list, error, refresh };
}

export const fromPrice = (p: Product) => {
  const prices = [...new Set(p.variants.map((v) => v.priceCents))].sort((a, b) => a - b);
  return prices.length > 1 ? `A partir de ${money(prices[0])}` : money(prices[0]);
};
export const soldOut = (p: Product) => p.variants.every((v) => v.available < 1);

function ProductCard({ p }: { p: Product }) {
  const price = fromPrice(p);
  return (
    <Link to={`/loja/${p.slug}`} className="svc">
      <div className="ph" style={{ '--img': p.photoUrl ? `url(${p.photoUrl})` : 'none' } as CSSProperties} role="img" aria-label={p.name} />
      <div className="info">
        <span className="name">{p.name}</span>
        <span className="price">{price.startsWith('A partir') ? <>A partir de <b>{price.slice(11)}</b></> : <b>{price}</b>}</span>
        <span className="go" aria-hidden="true">{Icon.chev}</span>
        <span className="meta">{soldOut(p) ? 'Esgotado' : p.category}</span>
        <span className="btn block">Ver produto</span>
      </div>
    </Link>
  );
}

export default function Loja() {
  usePageTitle('Loja');
  const site = useSite();
  const { list, error } = useProducts();
  const [cat, setCat] = useState('');
  const cats = useMemo(() => [...new Set((list ?? []).map((p) => p.category))], [list]);
  const wa = site?.salon.whatsapp ?? '19988651935';

  if (error) return <div className="narrow page-head"><Alert kind="danger">{error}</Alert></div>;
  if (!list) return <Loading />;
  if (!list.length) {
    return (
      <div className="narrow page-head stack center" style={{ gap: 20 }}>
        <h1 className="title-line center">Jumbos e acessórios</h1>
        <img src="/logo.webp" alt="" width="260" height="258" style={{ margin: '0 auto', width: 260 }} />
        <p>Cabelos para tranças, cremes e acessórios. A vitrine online chega em breve.</p>
        <a className="btn wine block" href={waLink(wa, 'Olá! Quero saber dos jumbos e acessórios disponíveis.')} target="_blank" rel="noopener">Pedir pelo WhatsApp <span className="chev">{Icon.chev}</span></a>
      </div>
    );
  }
  const shown = list.filter((p) => !cat || p.category === cat);
  return (
    <div className="wrap">
      <div className="page-head stack">
        <h1 className="title-line">Jumbos e acessórios</h1>
        <p className="muted">Monte seu pedido aqui e finalize pelo WhatsApp: a gente confirma disponibilidade, pagamento e retirada ou entrega.</p>
      </div>
      {cats.length > 1 && (
        <div className="chips" role="group" aria-label="Filtrar por categoria" style={{ marginBottom: 22 }}>
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todos</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      <div className="services-grid">{shown.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      <div style={{ height: 40 }} />
    </div>
  );
}
