import { Link } from 'react-router-dom';
import { usePageTitle } from '../components/ui';

export default function NotFound() {
  usePageTitle('Página não encontrada');
  return (
    <div className="narrow page-head stack center" style={{ gap: 18 }}>
      <h1 className="title-line center">Página não encontrada</h1>
      <p className="muted">O endereço pode ter mudado.</p>
      <Link to="/" className="btn" style={{ justifySelf: 'center' }}>Voltar ao início</Link>
    </div>
  );
}
