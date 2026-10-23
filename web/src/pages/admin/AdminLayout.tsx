import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Icon, Loading } from '../../components/ui';
import { api } from '../../lib/api';

type Me = { id: number; name: string; role: string } | null;

export default function AdminLayout() {
  const [me, setMe] = useState<Me | undefined>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { api<Me>('/auth/me').then(setMe, () => setMe(null)); }, []);
  useEffect(() => {
    setOpen(false);
    if (me) api<{ counts: Record<string, number> }>('/admin/dashboard').then((d) => setCounts(d.counts), () => {});
  }, [pathname, me]);
  useEffect(() => { document.title = 'Painel — Studio das Tranças'; }, []);

  if (me === undefined) return <Loading />;
  if (!me || me.role !== 'admin') return <Navigate to="/entrar" replace />;
  const pend = (counts.proof_submitted ?? 0) + (counts.awaiting_approval ?? 0);

  async function logout() { await api('/auth/logout', { method: 'POST' }); location.href = '/entrar'; }

  return (
    <div className="admin">
      <div className="admin-top"><button onClick={() => setOpen(true)} aria-label="Abrir menu">{Icon.menu}</button> Studio das Tranças</div>
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <div className="row between">
          <Link to="/admin" className="brand"><img src="/logo.webp" alt="" /><span>Studio das Tranças</span></Link>
          {open && <button className="menu-btn" style={{ display: 'grid', color: '#fff' }} onClick={() => setOpen(false)} aria-label="Fechar menu">{Icon.close}</button>}
        </div>
        <nav>
          <NavLink to="/admin" end>Início</NavLink>
          <NavLink to="/admin/solicitacoes">Solicitações {pend > 0 && <span className="count">{pend}</span>}</NavLink>
          <NavLink to="/admin/agenda">Agenda</NavLink>
          <NavLink to="/admin/servicos">Serviços e preços</NavLink>
          <NavLink to="/admin/equipe">Equipe</NavLink>
          <NavLink to="/admin/pedidos">Pedidos da loja {counts.orders_open > 0 && <span className="count">{counts.orders_open}</span>}</NavLink>
          <NavLink to="/admin/produtos">Produtos e estoque</NavLink>
          <NavLink to="/admin/notificacoes">WhatsApp</NavLink>
          <NavLink to="/admin/configuracoes">Configurações</NavLink>
        </nav>
        <div style={{ marginTop: 'auto' }} className="stack">
          <a href="/" target="_blank" rel="noopener" style={{ color: '#e9dfd1' }}>Ver o site</a>
          <span className="small" style={{ color: '#a9a092' }}>{me.name}</span>
          <button className="btn sm outline" style={{ color: '#fff', boxShadow: 'inset 0 0 0 1.5px #fff' }} onClick={logout}>Sair</button>
        </div>
      </aside>
      <div className="admin-main"><Outlet /></div>
    </div>
  );
}
