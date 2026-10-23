import { Link } from 'react-router-dom';
import { Icon, useSite, usePageTitle } from '../components/ui';
import { hhmm, waLink, WEEKDAYS } from '../lib/api';
import { ServiceCard, useServices } from './Servicos';

const FEATURED = ['boho-braids', 'fulani-braids', 'box-braids-m-cintura', 'goddess-braids', 'knolles-braids', 'faux-locs', 'french-braids-longa', 'nago-com-cachos'];

export default function Home() {
  usePageTitle('');
  const site = useSite();
  const { list } = useServices();
  const featured = FEATURED.map((slug) => list?.find((s) => s.slug === slug)).filter((s) => !!s);
  const mapQuery = encodeURIComponent(site?.salon.address ?? 'Rua Dr. José Mathias Ponikwar, 223, Campinas');

  return (
    <>
      {/* Desktop: mockup 1 */}
      <section className="hero">
        <img className="bf bf1" src="/img/borboleta-azul-2.png" alt="" aria-hidden="true" />
        <img className="bf bf2" src="/img/borboleta-laranja.png" alt="" aria-hidden="true" />
        <img className="bf bf3" src="/img/borboleta-azul-2.png" alt="" aria-hidden="true" />
        <div className="wrap">
          <h1>Seu estilo merece um espaço online</h1>
          <p className="sub">Jumbos e Acessórios para Tranças em Geral</p>
          <Link to="/agendar" className="btn">Agendar horário</Link>
        </div>
      </section>
      {/* Celular: conceito */}
      <section className="hero-m">
        <img className="bf bf1" src="/img/borboleta-laranja.png" alt="" aria-hidden="true" />
        <h1 className="title-line">Tranças que expressam sua essência</h1>
        <Link to="/agendar" className="btn wine block">Agendar horário <span className="chev">{Icon.chev}</span></Link>
      </section>

      <section className="section">
        <div className="wrap stack" style={{ gap: 28 }}>
          <div className="row between">
            <h2 className="title-line">Serviços em destaque</h2>
            <Link to="/servicos" className="btn outline sm">Ver todos os serviços</Link>
          </div>
          <div className="services-grid">{featured.map((s) => <ServiceCard key={s.id} s={s} />)}</div>
        </div>
      </section>

      <section className="section band">
        <div className="wrap stack" style={{ gap: 28 }}>
          <h2 className="title-line">Como funciona</h2>
          <div className="how">
            <div><h3>Escolha serviço, data e horário</h3><p className="muted">A agenda mostra só horários com profissional livre para o seu estilo.</p></div>
            <div><h3>Pague o sinal de 30% pelo Pix</h3><p className="muted">O sinal reserva o horário. O restante você paga no dia do atendimento.</p></div>
            <div><h3>A Mariana confirma</h3><p className="muted">Ela confere o pagamento, define a trancista e você recebe a confirmação no WhatsApp.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap two">
          <div className="stack">
            <h2 className="title-line">Antes de vir</h2>
            <ul className="rules">{site?.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            <Link to="/politicas" className="muted">Ver regras completas</Link>
          </div>
          <div className="stack">
            <h2 className="title-line">Onde estamos</h2>
            {site && <p>{site.salon.address}<br /><span className="muted">{site.salon.reference}</span></p>}
            <div className="hours" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
              {[2, 3, 4, 5, 6].map((d) => {
                const h = site?.hours.find((x) => x.weekday === d);
                return [<span key={`d${d}`}>{WEEKDAYS[d]}</span>, <span key={`h${d}`}>{h ? `${hhmm(h.open)}–${hhmm(h.close)}` : 'Fechado'}</span>];
              })}
              <span>Domingo e segunda</span><span>Fechado</span>
            </div>
            <iframe className="map" title="Mapa do Studio das Tranças" loading="lazy" referrerPolicy="no-referrer"
              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} />
            {site && <a className="btn outline" href={waLink(site.salon.whatsapp)} target="_blank" rel="noopener">Falar no WhatsApp</a>}
          </div>
        </div>
      </section>
    </>
  );
}
