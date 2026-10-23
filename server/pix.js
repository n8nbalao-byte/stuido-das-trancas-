// Pix com chave fixa: monta o código "copia e cola" (BR Code estático, padrão EMV do Banco Central) com o valor exato
// e o identificador da cobrança. O app não fala com o banco: a Mariana confere o recebimento no painel.

export const PIX_TYPES = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];

function checkDigits(d, weights) {
  const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidCpf(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

export function isValidCnpj(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return checkDigits(d, w1) === Number(d[12]) && checkDigits(d, [6, ...w1]) === Number(d[13]);
}

/** Normaliza e valida a chave conforme o tipo. Devolve a chave no formato do Pix ou null se inválida. */
export function normalizePixKey(type, value) {
  const v = String(value ?? '').trim();
  if (type === 'CPF') { const d = v.replace(/\D/g, ''); return isValidCpf(d) ? d : null; }
  if (type === 'CNPJ') { const d = v.replace(/\D/g, ''); return isValidCnpj(d) ? d : null; }
  if (type === 'EMAIL') { const e = v.toLowerCase(); return e.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; }
  if (type === 'TELEFONE') {
    let d = v.replace(/\D/g, '');
    if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
    return /^\d{10,11}$/.test(d) ? `+55${d}` : null;
  }
  if (type === 'ALEATORIA') { const k = v.toLowerCase(); return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k) ? k : null; }
  return null;
}

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
// Nome e cidade no BR Code: só letras sem acento, números e espaço.
const plain = (s, max) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max).trim();

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(s) {
  let crc = 0xffff;
  for (const byte of Buffer.from(s, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Código Pix estático com valor (em centavos), quem recebe e o identificador (txid: até 25 letras/números). */
export function brCode({ key, amountCents, name, city, txid }) {
  const payload = [
    field('00', '01'),
    field('26', field('00', 'br.gov.bcb.pix') + field('01', key)),
    field('52', '0000'),
    field('53', '986'),
    field('54', (amountCents / 100).toFixed(2)),
    field('58', 'BR'),
    field('59', plain(name, 25) || 'STUDIO DAS TRANCAS'),
    field('60', plain(city, 15) || 'CAMPINAS'),
    field('62', field('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')),
    '6304',
  ].join('');
  return payload + crc16(payload);
}
