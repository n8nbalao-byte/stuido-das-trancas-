import { useState, type FormEvent } from 'react';
import { Alert, Loading } from '../../components/ui';
import { api, hhmm, toMin, WEEKDAYS } from '../../lib/api';
import { useLoad } from './common';

type Settings = {
  salon: { name: string; whatsapp: string; address: string; reference: string };
  pix: { type: string; key: string; name: string; city: string };
  holdMinutes: number; reminderTime: string; adminPhone: string; whatsappConfigured: boolean;
  hours: { weekday: number; open: number; close: number }[];
};

export default function Configuracoes() {
  const [s, error, reload] = useLoad<Settings>('/admin/settings');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string }>();
  if (error) return <Alert kind="danger">{error}</Alert>;
  if (!s) return <Loading />;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '');
    const body = {
      salon: { name: g('name'), whatsapp: g('whatsapp'), address: g('address'), reference: g('reference') },
      pix: { type: g('pixType'), key: g('pixKey'), name: g('pixName'), city: g('pixCity') },
      holdMinutes: Number(g('hold')), reminderTime: g('reminder'), adminPhone: g('adminPhone'),
      hours: [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`on${d}`) === 'on').map((d) => ({ weekday: d, open: toMin(g(`o${d}`)), close: toMin(g(`c${d}`)) })),
    };
    try { await api('/admin/settings', { method: 'PUT', body }); setMsg({ kind: 'ok', text: 'Configurações salvas.' }); reload(); } catch (err: any) { setMsg({ kind: 'danger', text: err.message }); }
    window.scrollTo(0, 0);
  }

  return (
    <form className="stack" style={{ gap: 18, maxWidth: 860 }} onSubmit={save}>
      <h1>Configurações</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <section className="panel stack">
        <h2>Pix do sinal</h2>
        {!s.pix.key && <Alert>Sem chave Pix a cliente não consegue pagar o sinal pelo site.</Alert>}
        <div className="grid-form">
          <label className="field"><span>Tipo de chave</span>
            <select className="select" name="pixType" defaultValue={s.pix.type || 'CNPJ'}>
              <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="TELEFONE">Celular</option><option value="ALEATORIA">Chave aleatória</option>
            </select>
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}><span>Chave</span><input className="input" name="pixKey" defaultValue={s.pix.key} placeholder="vazio = Pix desligado" /></label>
          <label className="field"><span>Nome do recebedor (como no banco)</span><input className="input" name="pixName" defaultValue={s.pix.name} maxLength={60} /></label>
          <label className="field"><span>Cidade</span><input className="input" name="pixCity" defaultValue={s.pix.city || 'Campinas'} /></label>
        </div>
        <p className="small muted">O site gera o QR Code e o Copia e Cola com o valor exato e um identificador. A confirmação do pagamento é feita por você no painel.</p>
      </section>
      <section className="panel stack">
        <h2>Agendamento e lembretes</h2>
        <div className="grid-form">
          <label className="field"><span>Prazo para pagar o sinal (min)</span><input className="input" type="number" name="hold" min={10} max={1440} defaultValue={s.holdMinutes} /></label>
          <label className="field"><span>Lembrete no dia, às</span><input className="input" type="time" name="reminder" defaultValue={s.reminderTime} /></label>
          <label className="field"><span>WhatsApp que recebe os avisos</span><input className="input" name="adminPhone" defaultValue={s.adminPhone} /></label>
        </div>
        <p className="small muted">Lembrete 15 minutos antes vai para a cliente e para a trancista (cadastre o WhatsApp dela em Equipe).</p>
      </section>
      <section className="panel stack">
        <h2>Salão</h2>
        <div className="grid-form">
          <label className="field"><span>Nome</span><input className="input" name="name" defaultValue={s.salon.name} /></label>
          <label className="field"><span>WhatsApp do salão</span><input className="input" name="whatsapp" defaultValue={s.salon.whatsapp} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Endereço</span><input className="input" name="address" defaultValue={s.salon.address} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Referência</span><input className="input" name="reference" defaultValue={s.salon.reference} /></label>
        </div>
      </section>
      <section className="panel stack">
        <h2>Expediente</h2>
        {[2, 3, 4, 5, 6, 0, 1].map((d) => {
          const h = s.hours.find((x) => x.weekday === d);
          return (
            <div key={d} className="row">
              <label className="check" style={{ width: 120 }}><input type="checkbox" name={`on${d}`} defaultChecked={!!h} /> {WEEKDAYS[d]}</label>
              <input className="input" type="time" name={`o${d}`} defaultValue={hhmm(h?.open ?? 540)} style={{ width: 130 }} aria-label="Abre" />
              <span>às</span>
              <input className="input" type="time" name={`c${d}`} defaultValue={hhmm(h?.close ?? 1080)} style={{ width: 130 }} aria-label="Fecha" />
            </div>
          );
        })}
      </section>
      <section className="panel">
        <h2>WhatsApp (Evolution API)</h2>
        <p>{s.whatsappConfigured ? 'Configurado.' : 'Não configurado.'} Conexão do número (QR Code ou código) em <a href="/admin/notificacoes">WhatsApp</a>.</p>
      </section>
      <button className="btn" style={{ justifySelf: 'start' }}>Salvar configurações</button>
    </form>
  );
}
