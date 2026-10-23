import { Link } from 'react-router-dom';
import { useSite, usePageTitle } from '../components/ui';
import { fmtPhone, hhmm, waLink, WEEKDAYS } from '../lib/api';

export default function Sobre() {
  usePageTitle('Sobre');
  const site = useSite();
  return (
    <div className="wrap page-head two" style={{ alignItems: 'start' }}>
      <div className="stack" style={{ gap: 18 }}>
        <h1 className="title-line">Sobre o Studio</h1>
        <img src="/img/salao.webp" alt="Trancista trabalhando em um penteado (imagem ilustrativa)" width="1200" height="800" style={{ borderRadius: 18, width: '100%', height: 'auto' }} />
        <p>O Studio das Tranças é um espaço em Campinas dedicado a tranças e cabelos afro, comandado pela Mariana, com as trancistas Leide e Jhennifer.</p>
        <p>Trabalhamos com Fulani, Box Braids, Nagô, Goddess, French Braids, Faux Locs, Twists, Entrelace, Boho e muito mais — além de jumbos e acessórios para tranças.</p>
        <Link to="/agendar" className="btn" style={{ justifySelf: 'start' }}>Agendar horário</Link>
      </div>
      <div className="card stack" id="contato">
        <h2 className="title-line">Contato</h2>
        {site && <>
          <p>{site.salon.address}<br /><span className="muted">{site.salon.reference}</span></p>
          <p><a href={waLink(site.salon.whatsapp)} target="_blank" rel="noopener">WhatsApp {fmtPhone(site.salon.whatsapp)}</a></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 16px' }}>
            {[2, 3, 4, 5, 6, 0, 1].map((d) => {
              const h = site.hours.find((x) => x.weekday === d);
              return [<span key={`d${d}`}>{WEEKDAYS[d]}</span>, <span key={`h${d}`}>{h ? `${hhmm(h.open)}–${hhmm(h.close)}` : 'Fechado'}</span>];
            })}
          </div>
        </>}
      </div>
    </div>
  );
}
