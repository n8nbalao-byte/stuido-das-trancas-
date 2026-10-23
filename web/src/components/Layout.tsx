import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { fmtPhone, hhmm, waLink, WEEKDAYS } from '../lib/api';
import { useCart } from '../lib/cart';
import { Icon, useSite } from './ui';

/** Site público: cabeçalho do mockup 1 no desktop; no celular, título + traço dourado, menu e pílulas do conceito. */
export function SiteLayout() {
  const site = useSite();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [pathname]);
  const wa = site?.salon.whatsapp ?? '19988651935';
  const count = useCart().reduce((n, i) => n + i.qty, 0);
  const bag = count > 0 && <Link to="/carrinho" className="bag" aria-label={`Meu pedido: ${count} item(ns)`}>{Icon.bag}<span>{count}</span></Link>;

  return (
    <>
      <a href="#conteudo" className="sr-only">Pular para o conteúdo</a>
      <header className="site-header">
        <div className="wrap">
          <div className="bar">
            <Link to="/" className="brand" aria-label="Studio das Tranças — início">
              <img src="/logo.webp" alt="" width="58" height="58" />
              <span>Studio<br /> das Tranças</span>
            </Link>
            <nav className="site-nav" aria-label="Principal">
              <NavLink to="/" end>Início</NavLink>
              <NavLink to="/servicos">Serviços</NavLink>
              <NavLink to="/loja">Loja</NavLink>
              <NavLink to="/sobre">Sobre</NavLink>
              {bag}
              <Link to="/agendar" className="btn">Agendar horário</Link>
            </nav>
            <span className="bag-m">{bag}</span>
            <button className="menu-btn" onClick={() => setMenu(true)} aria-label="Abrir menu" aria-expanded={menu}>{Icon.menu}</button>
          </div>
          <nav className="pills" aria-label="Atalhos">
            <NavLink to="/" end>Início</NavLink>
            <NavLink to="/servicos">Serviços</NavLink>
            <NavLink to="/agendar">Agendar</NavLink>
          </nav>
        </div>
      </header>
      {menu && (
        <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="menu-btn" style={{ justifySelf: 'end' }} onClick={() => setMenu(false)} aria-label="Fechar menu">{Icon.close}</button>
          <Link to="/">Início</Link>
          <Link to="/servicos">Serviços</Link>
          <Link to="/agendar">Agendar horário</Link>
          <Link to="/minha-solicitacao">Minha solicitação</Link>
          <Link to="/loja">Loja</Link>
          {count > 0 && <Link to="/carrinho">Meu pedido ({count})</Link>}
          <Link to="/sobre">Sobre e contato</Link>
          <Link to="/politicas">Regras e privacidade</Link>
        </div>
      )}
      <main id="conteudo"><Outlet /></main>
      <footer className="site-footer">
        <div className="wrap">
          <div className="cols">
            <div className="stack">
              <h3>Studio das Tranças</h3>
              <p>Tranças e cabelos afro em Campinas. Jumbos e acessórios para tranças em geral.</p>
              {site && <p>{site.salon.address}<br />{site.salon.reference}</p>}
              <p><a href={waLink(wa)} target="_blank" rel="noopener">WhatsApp {fmtPhone(wa)}</a></p>
            </div>
            <div>
              <h3>Horários</h3>
              <div className="hours">
                {[2, 3, 4, 5, 6, 0, 1].map((d) => {
                  const h = site?.hours.find((x) => x.weekday === d);
                  return [<span key={`d${d}`}>{WEEKDAYS[d]}</span>, <span key={`h${d}`}>{h ? `${hhmm(h.open)}–${hhmm(h.close)}` : 'Fechado'}</span>];
                })}
              </div>
            </div>
            <div className="stack">
              <h3>Atendimento</h3>
              <Link to="/agendar">Agendar horário</Link>
              <Link to="/minha-solicitacao">Acompanhar minha solicitação</Link>
              <Link to="/politicas">Regras de atendimento e privacidade</Link>
            </div>
          </div>
          <p className="legal">© {new Date().getFullYear()} Studio das Tranças · Campinas – SP · Imagens ilustrativas.</p>
        </div>
      </footer>
      <a className="wa-float" href={waLink(wa, 'Olá! Vim pelo site do Studio das Tranças.')} target="_blank" rel="noopener" aria-label="Falar no WhatsApp">{Icon.whatsapp}</a>
    </>
  );
}
