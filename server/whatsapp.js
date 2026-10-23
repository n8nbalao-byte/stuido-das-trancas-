// WhatsApp pela Evolution API (v2). Configuração: variáveis EVOLUTION_* do servidor ou, sem elas, o que a Mariana
// salvou no painel (app_settings 'evolution'). A chave nunca vai para o front: a tela só sabe se ela existe.
import { q } from './db.js';
import { fail } from './http.js';

let cached = { at: 0, value: null };

export async function whatsappConfig() {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    return { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE, source: 'env' };
  }
  // ponytail: cópia de 30 s (a fila consulta a cada minuto); salvar no painel limpa a cópia deste processo.
  if (Date.now() - cached.at < 30e3) return cached.value;
  const [row] = await q("SELECT value FROM app_settings WHERE name = 'evolution'");
  const saved = row ? JSON.parse(row.value) : {};
  const value = saved.url && saved.key && saved.instance ? { ...saved, source: 'db' } : null;
  cached = { at: Date.now(), value };
  return value;
}

export async function saveWhatsappConfig({ url, key, instance }, staffId) {
  const prev = await whatsappConfig();
  const value = JSON.stringify({ url, instance, key: key || (prev?.source === 'db' ? prev.key : '') });
  await q("INSERT INTO app_settings (name, value, updated_by) VALUES ('evolution', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)", [value, staffId]);
  cached = { at: 0, value: null };
}

export const whatsappConfigured = async () => !!(await whatsappConfig());

/** Chamada à Evolution. Erros viram mensagens curtas (vão para a tela ou para last_error da fila). */
export async function evolution(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const cfg = await whatsappConfig();
  if (!cfg) fail(503, 'WhatsApp ainda não configurado (Configurações → WhatsApp).');
  let resp;
  try {
    // Nome da instância pode ter espaço ou acento: vai codificado na URL.
    resp = await fetch(`${cfg.url.replace(/\/+$/, '')}${path.replace('{instance}', encodeURIComponent(cfg.instance))}`, {
      method,
      headers: { apikey: cfg.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    fail(502, `Sem conexão com a Evolution API (${e.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de rede'}).`);
  }
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401 || resp.status === 403) fail(502, 'A Evolution API recusou a chave.');
  if (resp.status === 404) fail(404, 'Instância não encontrada na Evolution API.');
  if (!resp.ok) fail(502, `A Evolution API respondeu ${resp.status}.`);
  return data;
}

const toNumber = (phone) => { const d = String(phone).replace(/\D/g, ''); return d.startsWith('55') ? d : `55${d}`; };

export async function sendWhatsapp(phone, text) {
  await evolution('/message/sendText/{instance}', { method: 'POST', body: { number: toNumber(phone), text } });
}

/** Estado da conexão: open (conectado), connecting, close; e o número conectado, quando houver. */
export async function connectionStatus() {
  const cfg = await whatsappConfig();
  if (!cfg) return { configured: false };
  const out = { configured: true, source: cfg.source, url: cfg.url, instance: cfg.instance };
  try {
    out.state = (await evolution('/instance/connectionState/{instance}', { timeout: 8000 }))?.instance?.state ?? 'unknown';
    if (out.state === 'open') {
      const data = await evolution(`/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`, { timeout: 8000 }).catch(() => null);
      const inst = Array.isArray(data) ? data[0] : data;
      const d = String(inst?.ownerJid ?? inst?.instance?.owner ?? '').split('@')[0].replace(/\D/g, '');
      out.number = /^55\d{10,11}$/.test(d) ? d.slice(2) : null;
    }
  } catch (e) {
    out.state = e.status === 404 ? 'missing' : 'error';
    out.message = e.message;
  }
  return out;
}
