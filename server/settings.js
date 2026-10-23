import { q } from './db.js';

// Valores iniciais vindos dos documentos do salão; a Mariana altera em Configurações.
export const DEFAULTS = {
  salon: {
    name: 'Studio das Tranças',
    whatsapp: '19988651935',
    address: 'Rua Dr. José Mathias Ponikwar, 223 – Jardim Campo Belo I, Campinas – SP',
    reference: 'Em frente ao Mercado Generoso',
  },
  pix: { type: '', key: '', name: '', city: 'Campinas' }, // vazio até a Mariana cadastrar: nunca inventar chave
  holdMinutes: 30,
  reminderTime: '07:00',
  adminPhone: '19988651935',
};

export async function getSettings(run = q) {
  const rows = await run('SELECT name, value FROM app_settings');
  const out = structuredClone(DEFAULTS);
  for (const r of rows) if (r.name in DEFAULTS) out[r.name] = JSON.parse(r.value);
  return out;
}

export async function saveSetting(name, value, staffId) {
  await q('INSERT INTO app_settings (name, value, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)', [name, JSON.stringify(value), staffId]);
}

/** Celular brasileiro: DDD + número (10 ou 11 dígitos), sem o 55. null se inválido. */
export function normalizePhone(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  return /^[1-9]{2}\d{8,9}$/.test(d) ? d : null;
}
