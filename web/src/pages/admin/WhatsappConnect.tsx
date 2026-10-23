import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, fmtPhone } from '../../lib/api';

type Status = { configured: boolean; source?: 'env' | 'db'; url?: string; instance?: string; state?: string; number?: string | null; message?: string };
const STATE: Record<string, [string, string]> = {
  open: ['Conectado', 'ok'], connecting: ['Aguardando leitura', 'warn'], close: ['Desconectado', 'danger'],
  missing: ['Instância não encontrada', 'danger'], error: ['Sem comunicação', 'danger'],
};

/** Conexão do número do salão: QR Code ou código de pareamento, desconectar e mensagem de teste. */
export function WhatsappConnect() {
  const [st, setSt] = useState<Status>();
  const [pair, setPair] = useState<{ qr?: string | null; pairingCode?: string | null } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string }>();
  const [phone, setPhone] = useState('');
  const load = () => api<Status>('/admin/whatsapp').then(setSt, () => setSt({ configured: false }));
  useEffect(() => { load(); }, []);
  // Enquanto o QR/código está na tela, confere a conexão a cada 4 s.
  useEffect(() => {
    if (!pair) return;
    const t = setInterval(() => api<Status>('/admin/whatsapp').then((s) => { setSt(s); if (s.state === 'open') { setPair(null); setMsg({ kind: 'ok', text: 'WhatsApp conectado!' }); } }, () => {}), 4000);
    return () => clearInterval(t);
  }, [pair]);

  async function run(name: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(name); setMsg(undefined);
    try { await fn(); if (ok) setMsg({ kind: 'ok', text: ok }); } catch (e: any) { setMsg({ kind: 'danger', text: e.message }); } finally { setBusy(''); }
  }
  const connect = (method: 'qr' | 'code') => run(method, async () => {
    const r = await api<{ qr?: string | null; pairingCode?: string | null; state?: string }>('/admin/whatsapp/connect', { body: { method, phone } });
    if (r.state === 'open') load(); else setPair(r);
  });
  function saveCfg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run('cfg', async () => { await api('/admin/whatsapp', { method: 'PUT', body: { url: f.get('url'), instance: f.get('instance'), key: f.get('key') } }); await load(); }, 'Configuração salva.');
  }

  if (!st) return <div className="panel"><Loading /></div>;
  const [label, tone] = STATE[st.state ?? ''] ?? ['Não configurado', 'muted'];
  const disconnected = st.configured && ['close', 'connecting'].includes(st.state ?? '');

  return (
    <section className="panel stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>WhatsApp do salão{st.number ? ` · ${fmtPhone(st.number)}` : ''}</h2>
        <span className={`badge ${tone}`}>{st.configured ? label : 'Não configurado'}</span>
      </div>
      <p className="muted small">É por este número que saem as instruções do Pix, as confirmações e os lembretes. Para conectar, use o celular do salão.</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {st.message && st.state !== 'close' && <Alert>{st.message}</Alert>}

      {disconnected && (
        <div className="stack">
          <div className="row">
            <button className="btn" disabled={!!busy} onClick={() => connect('qr')}>{busy === 'qr' ? 'Gerando…' : 'Conectar com QR Code'}</button>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); connect('code'); }}>
            <input className="input" type="tel" inputMode="tel" placeholder="Celular do salão (19) 9…" value={phone} onChange={(e) => setPhone(e.target.value)} required style={{ flex: '1 1 220px' }} aria-label="Celular do salão" />
            <button className="btn outline" disabled={!!busy}>{busy === 'code' ? 'Gerando…' : 'Conectar com código'}</button>
          </form>
          {pair?.qr && (
            <div className="stack" style={{ justifyItems: 'start' }}>
              <img src={pair.qr} alt="QR Code para conectar o WhatsApp" width={260} height={260} style={{ borderRadius: 12, border: '1px solid #eadfce' }} />
              <p className="small">No celular do salão: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b> e aponte a câmera para o código. Ele vence em cerca de 40 segundos; gere outro se precisar.</p>
            </div>
          )}
          {pair?.pairingCode && (
            <div className="stack">
              <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '2rem', letterSpacing: '0.2em', fontWeight: 700 }} aria-label={`Código ${pair.pairingCode}`}>{pair.pairingCode}</p>
              <p className="small">No celular do salão: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b> → <b>Conectar com número de telefone</b> e digite o código.</p>
            </div>
          )}
        </div>
      )}

      {st.state === 'open' && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const p = new FormData(e.currentTarget).get('phone'); run('test', () => api('/admin/whatsapp/test', { body: { phone: p } }), 'Mensagem de teste enviada.'); }}>
          <input className="input" name="phone" type="tel" inputMode="tel" placeholder="Enviar teste para (19) 9…" required style={{ flex: '1 1 220px' }} aria-label="Celular para teste" />
          <button className="btn outline" disabled={!!busy}>{busy === 'test' ? 'Enviando…' : 'Enviar teste'}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => run('logout', async () => { await api('/admin/whatsapp/logout', { body: {} }); await load(); }, 'WhatsApp desconectado.')}>Desconectar</button>
        </form>
      )}

      {st.source !== 'env' && (
        <details open={!st.configured}>
          <summary className="small"><b>Servidor da Evolution API</b>{st.configured && ` · ${st.instance}`}</summary>
          <form className="grid-form" style={{ marginTop: 10 }} onSubmit={saveCfg}>
            <label className="field"><span>Endereço</span><input className="input" name="url" required defaultValue={st.url ?? 'https://'} /></label>
            <label className="field"><span>Instância</span><input className="input" name="instance" required defaultValue={st.instance ?? ''} /></label>
            <label className="field"><span>Chave (apikey)</span><input className="input" name="key" type="password" autoComplete="off" placeholder={st.configured ? '•••••• (deixe vazio para manter)' : ''} /></label>
            <button className="btn sm" style={{ alignSelf: 'end' }} disabled={!!busy}>Salvar</button>
          </form>
        </details>
      )}
    </section>
  );
}
