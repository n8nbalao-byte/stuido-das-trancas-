// Loja: pedido montado no site e finalizado pelo WhatsApp. O pedido reserva o estoque; só o pagamento confirmado
// pela Mariana vira venda (sai do estoque). Cancelar antes do pagamento libera a reserva; depois, devolve ao estoque.
import { newCode } from './booking.js';
import { fail } from './http.js';
import { enqueue } from './notify.js';
import { getSettings } from './settings.js';

export const ORDER_FLOW = ['created', 'awaiting_confirmation', 'awaiting_payment', 'paid', 'preparing', 'ready', 'delivered'];
const PAID = new Set(['paid', 'preparing', 'ready', 'delivered']);
const money = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Resumo em texto (mensagem do WhatsApp). */
export function orderText(o, items) {
  return [
    `Pedido *${o.code}* — Studio das Tranças`,
    ...items.map((i) => `• ${i.qty}× ${i.product_name}${i.variant_name !== 'Padrão' ? ` (${i.variant_name})` : ''} — ${money(i.unit_cents * i.qty)}`),
    `Total: *${money(o.total_cents)}*`,
    o.delivery === 'entrega' ? 'Entrega (combinar endereço e frete)' : 'Retirada no salão',
    `Nome: ${o.customer_name}`,
    o.notes ? `Obs.: ${o.notes}` : null,
  ].filter(Boolean).join('\n');
}

export async function loadOrder(run, id) {
  const [o] = await run('SELECT o.*, c.name AS customer_name, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
  if (!o) fail(404, 'Pedido não encontrado.');
  const items = await run('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
  return { ...o, items };
}

/** items: [{ variantId, qty }]. Trava as variações, confere o disponível e reserva. */
export async function createOrder(run, { items, name, phone, delivery, notes }) {
  const wanted = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const id = Number(it.variantId), qty = Number(it.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) fail(400, 'Item inválido no pedido.');
    wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }
  if (!wanted.size || wanted.size > 30) fail(400, 'O pedido está vazio.');
  const rows = await run(
    `SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id IN (?) AND v.active = 1 AND p.active = 1 FOR UPDATE`, [[...wanted.keys()]]);
  if (rows.length !== wanted.size) fail(409, 'Algum produto do carrinho não está mais disponível. Atualize o carrinho.');
  let total = 0;
  for (const v of rows) {
    const qty = wanted.get(v.id);
    if (v.stock_qty - v.reserved_qty < qty) fail(409, `Estoque insuficiente: ${v.product_name}${v.name !== 'Padrão' ? ` (${v.name})` : ''}. Disponível: ${Math.max(0, v.stock_qty - v.reserved_qty)}.`);
    total += v.price_cents * qty;
  }
  await run('INSERT INTO customers (name, phone, consent_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), consent_at = VALUES(consent_at)', [name, phone, new Date()]);
  const [customer] = await run('SELECT id FROM customers WHERE phone = ?', [phone]);
  let code;
  for (let i = 0; ; i++) {
    code = newCode();
    const [dup] = await run('SELECT 1 FROM orders WHERE code = ?', [code]);
    if (!dup) break;
    if (i > 5) fail(500, 'Não foi possível gerar o código. Tente de novo.');
  }
  const r = await run('INSERT INTO orders (code, customer_id, total_cents, delivery, notes) VALUES (?,?,?,?,?)',
    [code, customer.id, total, delivery === 'entrega' ? 'entrega' : 'retirada', notes || null]);
  for (const v of rows) {
    const qty = wanted.get(v.id);
    await run('INSERT INTO order_items (order_id, variant_id, product_name, variant_name, unit_cents, qty) VALUES (?,?,?,?,?,?)', [r.insertId, v.id, v.product_name, v.name, v.price_cents, qty]);
    await run('UPDATE product_variants SET reserved_qty = reserved_qty + ? WHERE id = ?', [qty, v.id]);
  }
  await run("INSERT INTO order_events (order_id, to_status) VALUES (?, 'created')", [r.insertId]);
  const o = await loadOrder(run, r.insertId);
  const s = await getSettings(run);
  await enqueue(run, { key: `order-${o.id}`, kind: 'order', phone: s.adminPhone, body: `🛍️ Novo pedido pelo site (${o.phone}):\n\n${orderText(o, o.items)}\n\n${(process.env.PUBLIC_URL || '').replace(/\/+$/, '')}/admin/pedidos` });
  return o;
}

/** Muda o status do pedido com o efeito no estoque. Não volta de pago para não pago; cancelado e entregue são finais. */
export async function setOrderStatus(run, id, to, reason, staffId) {
  if (to !== 'cancelled' && !ORDER_FLOW.includes(to)) fail(400, 'Status inválido.');
  const [o] = await run('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
  if (!o) fail(404, 'Pedido não encontrado.');
  if (o.status === to) return;
  if (o.status === 'cancelled' || o.status === 'delivered') fail(409, 'Pedido já encerrado.');
  const wasPaid = PAID.has(o.status);
  if (wasPaid && to !== 'cancelled' && !PAID.has(to)) fail(409, 'Pedido pago não volta para "não pago". Cancele, se for o caso.');
  if (to === 'cancelled' && !reason) fail(400, 'Informe o motivo do cancelamento.');
  const items = await run('SELECT variant_id, qty FROM order_items WHERE order_id = ?', [id]);
  await run(`SELECT id FROM product_variants WHERE id IN (?) FOR UPDATE`, [items.map((i) => i.variant_id)]);
  for (const it of items) {
    if (to === 'cancelled' && !wasPaid) {
      await run('UPDATE product_variants SET reserved_qty = reserved_qty - ? WHERE id = ?', [it.qty, it.variant_id]);
    } else if (to === 'cancelled' && wasPaid) {
      await run('UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?', [it.qty, it.variant_id]);
      await run("INSERT INTO stock_movements (variant_id, delta, kind, reason, order_id, staff_id) VALUES (?,?,'devolucao',?,?,?)", [it.variant_id, it.qty, reason, id, staffId]);
    } else if (!wasPaid && PAID.has(to)) {
      await run('UPDATE product_variants SET stock_qty = stock_qty - ?, reserved_qty = reserved_qty - ? WHERE id = ?', [it.qty, it.qty, it.variant_id]);
      await run("INSERT INTO stock_movements (variant_id, delta, kind, order_id, staff_id) VALUES (?,?,'venda',?,?)", [it.variant_id, -it.qty, id, staffId]);
    }
  }
  await run('UPDATE orders SET status = ? WHERE id = ?', [to, id]);
  await run('INSERT INTO order_events (order_id, from_status, to_status, reason, staff_id) VALUES (?,?,?,?,?)', [id, o.status, to, reason || null, staffId]);
}

/** Entrada (+) ou saída (−) manual. O estoque nunca fica abaixo do que já está reservado em pedidos. */
export async function adjustStock(run, variantId, delta, reason, staffId) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) fail(400, 'Quantidade inválida.');
  const [v] = await run('SELECT * FROM product_variants WHERE id = ? FOR UPDATE', [variantId]);
  if (!v) fail(404, 'Variação não encontrada.');
  if (v.stock_qty + delta < v.reserved_qty) fail(409, `Saída maior que o disponível: há ${v.stock_qty} no estoque e ${v.reserved_qty} reservado(s) em pedidos.`);
  await run('UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?', [delta, variantId]);
  await run('INSERT INTO stock_movements (variant_id, delta, kind, reason, staff_id) VALUES (?,?,?,?,?)', [variantId, delta, delta > 0 ? 'entrada' : 'saida', reason || null, staffId]);
}
