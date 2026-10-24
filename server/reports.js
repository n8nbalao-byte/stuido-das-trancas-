// Relatório financeiro de um período (dias em hora de São Paulo, inclusivos).
// Entradas: sinal Pix conferido (data da conferência), saldo de atendimento concluído (data do atendimento, pago no salão)
// e venda da loja (data em que o pedido foi marcado como pago). Saída: estorno de venda paga cancelada.
import { spDate, addDays } from './time.js';

const PAID = ['paid', 'preparing', 'ready', 'delivered'];
const svc = "CONCAT(JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.service')), IF(JSON_TYPE(JSON_EXTRACT(a.price_snapshot, '$.variant')) = 'STRING', CONCAT(' — ', JSON_UNQUOTE(JSON_EXTRACT(a.price_snapshot, '$.variant'))), ''))";

export async function financialReport(run, fromDay, toDay) {
  const from = spDate(fromDay, 0), to = spDate(addDays(toDay, 1), 0);

  const deposits = await run(
    `SELECT p.confirmed_at AS at, p.amount_cents AS cents, a.id AS ref_id, a.code, a.status, c.name AS customer, ${svc} AS service
     FROM payments p JOIN appointments a ON a.id = p.appointment_id JOIN customers c ON c.id = a.customer_id
     WHERE p.status = 'confirmed' AND p.confirmed_at >= ? AND p.confirmed_at < ?`, [from, to]);

  const completed = await run(
    `SELECT a.start_at AS at, a.balance_cents AS cents, a.total_cents, a.id AS ref_id, a.code, c.name AS customer, ${svc} AS service, s.name AS staff
     FROM appointments a JOIN customers c ON c.id = a.customer_id LEFT JOIN staff s ON s.id = a.staff_id
     WHERE a.status = 'completed' AND a.start_at >= ? AND a.start_at < ?`, [from, to]);

  // Data da venda = primeira vez que o pedido entrou num status pago.
  const sales = await run(
    `SELECT x.at, o.total_cents AS cents, o.id AS ref_id, o.code, c.name AS customer
     FROM (SELECT order_id, MIN(created_at) AS at FROM order_events WHERE to_status IN (?) GROUP BY order_id) x
     JOIN orders o ON o.id = x.order_id JOIN customers c ON c.id = o.customer_id
     WHERE x.at >= ? AND x.at < ?`, [PAID, from, to]);

  const refunds = await run(
    `SELECT e.created_at AS at, -o.total_cents AS cents, o.id AS ref_id, o.code, c.name AS customer, e.reason
     FROM order_events e JOIN orders o ON o.id = e.order_id JOIN customers c ON c.id = o.customer_id
     WHERE e.to_status = 'cancelled' AND e.from_status IN (?) AND e.created_at >= ? AND e.created_at < ?`, [PAID, from, to]);

  const items = sales.length ? await run(
    `SELECT product_name, variant_name, SUM(qty) AS qty, SUM(qty * unit_cents) AS cents FROM order_items
     WHERE order_id IN (?) GROUP BY product_name, variant_name ORDER BY cents DESC`, [sales.map((s) => s.ref_id)]) : [];

  // Situação dos agendamentos com atendimento no período (para faltas, cancelamentos e o que falta receber).
  const appts = await run(
    `SELECT a.status, COUNT(*) AS n, SUM(a.total_cents) AS total, SUM(a.balance_cents) AS balance,
            SUM(CASE WHEN p.status = 'confirmed' THEN a.deposit_cents ELSE 0 END) AS deposit_paid
     FROM appointments a LEFT JOIN payments p ON p.appointment_id = a.id
     WHERE a.start_at >= ? AND a.start_at < ? GROUP BY a.status`, [from, to]);
  const st = Object.fromEntries(appts.map((r) => [r.status, r]));
  const num = (v) => Number(v ?? 0);

  const movements = [
    ...deposits.map((d) => ({ at: d.at, kind: 'sinal', label: `Sinal Pix — ${d.service}`, customer: d.customer, code: d.code, ref: { type: 'appointment', id: d.ref_id }, cents: d.cents })),
    ...completed.map((d) => ({ at: d.at, kind: 'saldo', label: `Saldo no salão — ${d.service}${d.staff ? ` (${d.staff})` : ''}`, customer: d.customer, code: d.code, ref: { type: 'appointment', id: d.ref_id }, cents: d.cents })),
    ...sales.map((d) => ({ at: d.at, kind: 'venda', label: 'Venda da loja', customer: d.customer, code: d.code, ref: { type: 'order', id: d.ref_id }, cents: d.cents })),
    ...refunds.map((d) => ({ at: d.at, kind: 'estorno', label: `Estorno de venda cancelada${d.reason ? ` — ${d.reason}` : ''}`, customer: d.customer, code: d.code, ref: { type: 'order', id: d.ref_id }, cents: num(d.cents) })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const sum = (list) => list.reduce((s, x) => s + num(x.cents), 0);
  const group = (list, key, val) => Object.values(list.reduce((acc, x) => {
    const k = key(x); acc[k] ??= { name: k, count: 0, cents: 0 }; acc[k].count++; acc[k].cents += val(x); return acc;
  }, {})).sort((a, b) => b.cents - a.cents);

  const summary = {
    deposits: sum(deposits), depositsCount: deposits.length,
    balances: sum(completed), completedCount: completed.length,
    sales: sum(sales), salesCount: sales.length,
    refunds: sum(refunds), refundsCount: refunds.length,
    // Sinais de faltas e cancelamentos (retidos conforme a regra do salão, observada a legislação).
    retained: num(st.no_show?.deposit_paid) + num(st.cancelled?.deposit_paid),
    noShowCount: num(st.no_show?.n), cancelledCount: num(st.cancelled?.n),
    // Saldo que ainda vai ser pago no salão: atendimentos confirmados do período.
    toReceive: num(st.confirmed?.balance), confirmedCount: num(st.confirmed?.n),
  };
  summary.total = summary.deposits + summary.balances + summary.sales + summary.refunds;

  return {
    from: fromDay, to: toDay, summary, movements,
    byService: group(completed, (x) => x.service, (x) => num(x.total_cents)),
    byStaff: group(completed, (x) => x.staff ?? 'Sem trancista', (x) => num(x.total_cents)),
    byProduct: items.map((i) => ({ name: i.variant_name === 'Padrão' ? i.product_name : `${i.product_name} (${i.variant_name})`, count: num(i.qty), cents: num(i.cents) })),
  };
}
