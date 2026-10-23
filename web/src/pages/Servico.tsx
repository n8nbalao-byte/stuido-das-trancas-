import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Icon, Loading, useSite, usePageTitle } from '../components/ui';
import { api, fmtDuration, money, priceLabel, serviceImage, waLink, type Service } from '../lib/api';

export default function Servico() {
  const { slug } = useParams();
  const site = useSite();
  const [s, setS] = useState<Service>();
  const [error, setError] = useState('');
  useEffect(() => { api<Service>(`/services/${slug}`).then(setS, (e) => setError(e.message)); }, [slug]);
  usePageTitle(s?.name ?? 'Serviço');
  if (error) return <div className="narrow page-head"><Alert kind="danger">{error}</Alert></div>;
  if (!s) return <Loading />;
  const wa = site?.salon.whatsapp ?? '19988651935';

  return (
    <div className="wrap page-head">
      <Link to="/servicos" className="row muted" style={{ textDecoration: 'none', marginBottom: 18 }}>{Icon.back} Serviços</Link>
      <div className="two" style={{ alignItems: 'start' }}>
        <div className="svc" style={{ boxShadow: 'none' }}>
          <div className="ph" style={{ aspectRatio: '4 / 3.4', '--img': `url(${serviceImage(s)})` } as React.CSSProperties} role="img" aria-label={`Imagem ilustrativa de ${s.name}`} />
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <span className="badge">{s.category}</span>
          <h1 className="title-line" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>{s.name}</h1>
          {s.variants.length ? (
            <div className="card stack" style={{ gap: 0, padding: '6px 20px' }}>
              {s.variants.map((v) => (
                <div key={v.id} className="sum-row" style={{ borderTop: 0, borderBottom: '1px solid rgb(184 134 46 / 22%)' }}>
                  <span>{v.name}<br /><span className="small muted">{fmtDuration(v.durationMin)}</span></span><b>{money(v.priceCents)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '1.6rem', fontFamily: 'var(--serif)' }}>{priceLabel(s)}</p>
          )}
          {!s.variants.length && <p className="row">{Icon.clock} {fmtDuration(s.durationMin, s.durationNote)}</p>}
          {s.description && <p>{s.description}</p>}
          {s.instructions && <Alert kind="info">{s.instructions}</Alert>}
          {s.priceType === 'from' && <p className="small muted">"A partir de": o valor final depende do comprimento e do volume, e é confirmado no salão. O sinal é calculado sobre o valor inicial.</p>}
          {s.bookable ? (
            <Link to={`/agendar?servico=${s.slug}`} className="btn wine block">Agendar horário <span className="chev">{Icon.chev}</span></Link>
          ) : (
            <>
              <Alert>Este estilo ainda não está disponível no agendamento online. Fale com a gente pelo WhatsApp para combinar.</Alert>
              <a className="btn wine block" href={waLink(wa, `Olá! Quero agendar ${s.name}.`)} target="_blank" rel="noopener">Solicitar pelo WhatsApp <span className="chev">{Icon.chev}</span></a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
