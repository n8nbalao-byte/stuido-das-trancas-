import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fits, freeSlots, splitDeposit } from '../server/slots.js';
import { spDate, spParts } from '../server/time.js';

const day = '2030-03-05'; // terça
const now = new Date('2030-01-01T00:00:00Z');
const business = { open: 540, close: 1080 };
const p = (id, extra = {}) => ({ id, start: 540, end: 1080, breakStart: null, breakEnd: null, ...extra });
const at = (h, m = 0) => spDate(day, h * 60 + m);
const appt = (staffId, h, hours) => ({ staffId, start: at(h), end: new Date(at(h).getTime() + hours * 3600e3) });

test('sinal 30% e saldo em centavos inteiros', () => {
  assert.deepEqual(splitDeposit(52000), { deposit: 15600, balance: 36400 });
  assert.deepEqual(splitDeposit(5500), { deposit: 1650, balance: 3850 });
  assert.deepEqual(splitDeposit(58000), { deposit: 17400, balance: 40600 });
  for (const t of [1, 33, 99, 12345, 6000]) { const s = splitDeposit(t); assert.equal(s.deposit + s.balance, t); }
});

test('fuso: 09:00 em São Paulo é 12:00 UTC', () => {
  assert.equal(at(9).toISOString(), '2030-03-05T12:00:00.000Z');
  assert.deepEqual(spParts(at(9)), { day, min: 540, weekday: 2 });
});

test('serviço de 8 h numa terça (09–18) só cabe até 10:00', () => {
  const slots = freeSlots({ day, block: 480, business, staff: [p(1)], busy: [], off: [], now });
  assert.deepEqual(slots.map((s) => s.time), ['09:00', '09:30', '10:00']);
});

test('sem profissional habilitada não há horário', () => {
  assert.equal(freeSlots({ day, block: 60, business, staff: [], busy: [], off: [], now }).length, 0);
});

test('mesma profissional não pode ter dois atendimentos sobrepostos', () => {
  const busy = [appt(1, 9, 2)];
  assert.equal(fits(at(10), at(11), { staff: [p(1)], busy, off: [] }), false);
  assert.equal(fits(at(11), at(12), { staff: [p(1)], busy, off: [] }), true);
});

test('três simultâneos em profissionais diferentes; o quarto é recusado', () => {
  const staff = [p(1), p(2), p(3), p(4)];
  const busy = [appt(1, 9, 3), appt(2, 9, 3)];
  assert.equal(fits(at(10), at(11), { staff, busy, off: [] }), true);
  busy.push(appt(3, 9, 3));
  assert.equal(fits(at(10), at(11), { staff, busy, off: [] }), false);
});

test('reserva ainda sem trancista ocupa capacidade', () => {
  const staff = [p(1), p(2)];
  const busy = [appt(null, 9, 3), appt(null, 9, 3)];
  assert.equal(fits(at(10), at(11), { staff, busy, off: [] }), false);
  assert.equal(fits(at(12), at(13), { staff, busy, off: [] }), true);
});

test('pausa e folga bloqueiam a profissional', () => {
  assert.equal(fits(at(11), at(13), { staff: [p(1, { breakStart: 720, breakEnd: 780 })], busy: [], off: [] }), false);
  const off = [{ staffId: 1, start: at(9), end: at(18) }];
  assert.equal(fits(at(10), at(11), { staff: [p(1)], busy: [], off }), false);
});

test('não oferece horário no passado nem antes da antecedência mínima', () => {
  const slots = freeSlots({ day, block: 60, business, staff: [p(1)], busy: [], off: [], now: at(12) });
  assert.equal(slots[0].time, '13:00');
});

test('dia fechado não tem horário', () => {
  assert.equal(freeSlots({ day, block: 60, business: null, staff: [p(1)], busy: [], off: [], now }).length, 0);
});
