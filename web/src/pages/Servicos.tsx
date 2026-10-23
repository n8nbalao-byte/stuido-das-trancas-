import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Icon, Loading, usePageTitle } from '../components/ui';
import { api, CATEGORIES, fmtDuration, priceLabel, serviceImage, type Service } from '../lib/api';

let cache: Promise<Service[]> | null = null;
export function useServices() {
  const [list, setList] = useState<Service[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    cache ??= api<Service[]>('/services');
    cache.then(setList, (e) => { cache = null; setError(e.message); });
  }, []);
  return { list, error };
}

/** Cartão: no desktop como o mockup 1 (foto, nome, preço, "Ver detalhes"); no celular como o conceito (nome, preço e seta). */
export function ServiceCard({ s }: { s: Service }) {
  const price = priceLabel(s);
  return (
    <Link to={`/servicos/${s.slug}`} className="svc">
      <div className="ph" style={{ '--img': `url(${serviceImage(s)})` } as React.CSSProperties} role="img" aria-label={`Imagem ilustrativa de ${s.name}`} />
      <div className="info">
        <span className="name">{s.name}</span>
        <span className="price">{price.startsWith('A partir') ? <>A partir de <b>{price.slice(11)}</b></> : <b>{price}</b>}</span>
        <span className="go" aria-hidden="true">{Icon.chev}</span>
        <span className="meta">{s.durationMin || s.durationNote ? fmtDuration(s.durationMin, s.durationNote) : 'Duração a confirmar'}{!s.bookable && ' · agendamento pelo WhatsApp'}</span>
        <span className="btn block">Ver detalhes</span>
      </div>
    </Link>
  );
}

export default function Servicos() {
  usePageTitle('Serviços');
  const { list, error } = useServices();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const cat = params.get('categoria');
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (list ?? []).filter((s) => (!cat || s.category === cat)
      && (!t || `${s.name} ${s.category}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)));
  }, [list, term, cat]);
  const cats = CATEGORIES.filter((c) => list?.some((s) => s.category === c));

  return (
    <div className="wrap">
      <div className="page-head stack">
        <h1 className="title-line">Nossos serviços</h1>
        <p className="muted">Preços da tabela do salão. O sinal de 30% garante o horário; o restante é pago no dia.</p>
      </div>
      <div className="stack" style={{ gap: 14, marginBottom: 24 }}>
        <label className="search">
          {Icon.search}
          <span className="sr-only">Buscar serviço</span>
          <input type="search" placeholder="Buscar" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Filtrar por estilo">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setParams({})}>Todos</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setParams({ categoria: c })}>{c}</button>)}
        </div>
      </div>
      {error && <Alert kind="danger">{error}</Alert>}
      {!list && !error && <Loading />}
      {list && (shown.length ? (
        <div className="services-grid">{shown.map((s) => <ServiceCard key={s.id} s={s} />)}</div>
      ) : <p className="empty">Nenhum serviço encontrado.</p>)}
      <div style={{ height: 40 }} />
    </div>
  );
}
