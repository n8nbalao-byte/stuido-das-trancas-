import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/Layout';
import Agendar from './pages/Agendar';
import AdminLayout from './pages/admin/AdminLayout';
import Agenda from './pages/admin/Agenda';
import Atendimento from './pages/admin/Atendimento';
import Configuracoes from './pages/admin/Configuracoes';
import Dashboard from './pages/admin/Dashboard';
import Equipe from './pages/admin/Equipe';
import Login from './pages/admin/Login';
import Notificacoes from './pages/admin/Notificacoes';
import AdminServicos from './pages/admin/Servicos';
import Solicitacoes from './pages/admin/Solicitacoes';
import Home from './pages/Home';
import Carrinho from './pages/Carrinho';
import Loja from './pages/Loja';
import Produto from './pages/Produto';
import Pedidos from './pages/admin/Pedidos';
import Produtos from './pages/admin/Produtos';
import Relatorios from './pages/admin/Relatorios';
import MinhaSolicitacao from './pages/MinhaSolicitacao';
import NotFound from './pages/NotFound';
import Politicas from './pages/Politicas';
import Servico from './pages/Servico';
import Servicos from './pages/Servicos';
import Sobre from './pages/Sobre';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="servicos/:slug" element={<Servico />} />
        <Route path="agendar" element={<Agendar />} />
        <Route path="minha-solicitacao" element={<MinhaSolicitacao />} />
        <Route path="loja" element={<Loja />} />
        <Route path="loja/:slug" element={<Produto />} />
        <Route path="carrinho" element={<Carrinho />} />
        <Route path="sobre" element={<Sobre />} />
        <Route path="politicas" element={<Politicas />} />
        <Route path="entrar" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="solicitacoes" element={<Solicitacoes />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="atendimento/:id" element={<Atendimento />} />
        <Route path="servicos" element={<AdminServicos />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="notificacoes" element={<Notificacoes />} />
        <Route path="configuracoes" element={<Configuracoes />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
