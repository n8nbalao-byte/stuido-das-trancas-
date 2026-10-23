import { useEffect, useState, type ReactNode } from 'react';
import { api, type Site } from '../lib/api';

export const Icon = {
  chev: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>,
  back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>,
  menu: <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>,
  close: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  clock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  info: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  alert: <svg width="20" height="20" viewBox="0 0 24 24" fill="#e8a33a" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 7v6M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  bag: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>,
  calendar: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  whatsapp: <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" /></svg>,
};

export const Loading = () => <div className="spinner" role="status" aria-label="Carregando" />;

export function Alert({ kind = '', children }: { kind?: '' | 'danger' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

let siteCache: Promise<Site> | null = null;
/** Dados do salão (endereço, WhatsApp, horários, regras): uma busca por carregamento da página. */
export function useSite() {
  const [site, setSite] = useState<Site>();
  useEffect(() => {
    siteCache ??= api<Site>('/site');
    siteCache.then(setSite, () => { siteCache = null; });
  }, []);
  return site;
}

export function usePageTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} — Studio das Tranças` : 'Studio das Tranças — Campinas'; }, [title]);
}

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Calendário em grade (mockup 1). `available`: dias com vaga ('YYYY-MM-DD'); os demais ficam desabilitados. */
export function Calendar({ month, onMonth, available, value, onChange, min, max }: {
  month: string; onMonth: (m: string) => void; available: Record<string, number>; value: string | null;
  onChange: (d: string) => void; min: string; max: string;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); onMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); };
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" onClick={() => shift(-1)} disabled={month <= min.slice(0, 7)} aria-label="Mês anterior">‹</button>
        <span aria-live="polite">{label}</span>
        <button type="button" onClick={() => shift(1)} disabled={month >= max.slice(0, 7)} aria-label="Próximo mês">›</button>
      </div>
      <div className="cal-grid">
        {WD.map((d, i) => <div key={i} className="wd" aria-hidden="true">{d}</div>)}
        {Array.from({ length: first }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${pad(i + 1)}`;
          const ok = !!available[d];
          return (
            <button key={d} type="button" disabled={!ok} className={`${ok ? 'has' : ''} ${value === d ? 'sel' : ''}`}
              aria-pressed={value === d} aria-label={`${i + 1}${ok ? '' : ' (sem horário)'}`} onClick={() => onChange(d)}>{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}
