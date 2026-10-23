// Fila persistente de WhatsApp: tudo passa pela tabela notification_queue (dedupe_key único = sem mensagem repetida)
// e um despachante no próprio app envia o que venceu, com tentativas limitadas. Não depende de navegador aberto.
import { q } from './db.js';
import { spParts, hhmm, spDate } from './time.js';
import { sendWhatsapp, whatsappConfigured } from './whatsapp.js';

const MAX_ATTEMPTS = 5;
const money = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const site = () => (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const link = (code) => `${site()}/minha-solicitacao?codigo=${code}`;

export const RULES = [
  'Venha com o cabelo lavado, desembaraçado e sem creme.',
  'Tolerância máxima de atraso: 15 minutos. Depois disso, o atendimento não acontece nesse horário e você pode pedir nova data.',
  'Atraso maior que 15 minutos, falta ou desistência: o sinal não é devolvido.',
  'Evite trazer acompanhantes: o espaço pode estar com grande fluxo.',
];

/** Texto das mensagens. `a` = linha do agendamento com service_name, customer_name, staff_name. */
export const msg = {
  created: (a, s) => `Olá, ${a.customer_name}! Recebemos sua solicitação no ${s.salon.name}.\n\n`
    + `*${a.service_name}* — ${when(a.start_at)}\nTotal: ${money(a.total_cents)}\nSinal (30%): *${money(a.deposit_cents)}*\nSaldo no dia: ${money(a.balance_cents)}\n\n`
    + `Para garantir o horário, pague o sinal pelo Pix em até ${s.holdMinutes} minutos e toque em "Já paguei":\n${link(a.code)}\n\n`
    + `O horário só fica confirmado depois da conferência do pagamento e da aprovação da Mariana.\nCódigo: *${a.code}*`,
  declared: (a) => `💳 Sinal informado: ${a.customer_name} (${a.phone}) diz que pagou ${money(a.deposit_cents)} — ${a.service_name}, ${when(a.start_at)}. Código ${a.code}.\nConfira o Pix e aprove no painel: ${site()}/admin/solicitacoes`,
  paymentConfirmed: (a) => `Olá, ${a.customer_name}! Recebemos seu sinal de ${money(a.deposit_cents)}. ✅\nAgora a Mariana vai definir a trancista e confirmar seu horário de ${when(a.start_at)}. Você recebe a confirmação por aqui.`,
  paymentRejected: (a, s, reason) => `Olá, ${a.customer_name}. Não localizamos o pagamento do sinal (código ${a.code}).${reason ? `\nMotivo: ${reason}` : ''}\nConfira e tente de novo em até ${s.holdMinutes} minutos: ${link(a.code)}`,
  confirmed: (a, s) => `✅ Agendamento confirmado no ${s.salon.name}!\n\n*${a.service_name}*\n${when(a.start_at)}\nTrancista: ${a.staff_name}\nSaldo a pagar no dia: ${money(a.balance_cents)}\n\n`
    + `📍 ${s.salon.address} (${s.salon.reference})\n\n${RULES.map((r) => `• ${r}`).join('\n')}`,
  staffAssigned: (a) => `Novo atendimento para você: *${a.service_name}* — ${when(a.start_at)}. Cliente: ${a.customer_name}.`,
  proposed: (a) => `Olá, ${a.customer_name}! O horário pedido não pôde ser confirmado. A Mariana sugere *${when(a.proposed_start_at)}* para ${a.service_name}.\nPara aceitar, toque aqui: ${link(a.code)}`,
  cancelled: (a, s, reason) => `Olá, ${a.customer_name}. Seu agendamento de ${a.service_name} (${when(a.start_at)}) foi cancelado.${reason ? `\nMotivo: ${reason}` : ''}\nDúvidas: fale com o ${s.salon.name} por aqui.`,
  rescheduled: (a) => `Olá, ${a.customer_name}! Seu atendimento de ${a.service_name} foi remarcado para *${when(a.start_at)}*. Trancista: ${a.staff_name}.`,
  customerRequest: (a, kind, text) => `📩 ${a.customer_name} (${a.phone}) pediu ${kind === 'cancel' ? 'CANCELAMENTO' : 'REMARCAÇÃO'} — ${a.service_name}, ${when(a.start_at)}. Código ${a.code}.${text ? `\n"${text}"` : ''}\n${site()}/admin/solicitacoes`,
  reminderDay: (a, s) => `Bom dia, ${a.customer_name}! Hoje é seu atendimento de ${a.service_name} às ${hhmm(spParts(new Date(a.start_at)).min)} no ${s.salon.name}.\n📍 ${s.salon.address}\nLembre: cabelo lavado, desembaraçado e sem creme. Tolerância de 15 minutos.`,
  reminder15: (a) => `⏰ Faltam 15 minutos para o seu atendimento de ${a.service_name}. Até já!`,
  reminder15Staff: (a) => `⏰ Em 15 minutos: ${a.service_name} com ${a.customer_name}.`,
};

/** Coloca na fila (no mesmo `run` da transação, se houver). Sem telefone, não faz nada. */
export async function enqueue(run, { key, kind, appointmentId = null, phone, body, at = new Date() }) {
  if (!phone) return;
  await run('INSERT IGNORE INTO notification_queue (dedupe_key, kind, appointment_id, phone, body, scheduled_for) VALUES (?,?,?,?,?,?)',
    [key.slice(0, 120), kind, appointmentId, phone, body, at]);
}

export const cancelReminders = (run, appointmentId) =>
  run("UPDATE notification_queue SET status = 'cancelled' WHERE appointment_id = ? AND kind = 'reminder' AND status = 'pending'", [appointmentId]);

/** Lembretes do dia (horário configurável) e 15 min antes, para cliente e trancista. A chave inclui o horário: remarcar gera novos. */
export async function scheduleReminders(run, a, s) {
  const start = new Date(a.start_at);
  const tag = `${a.id}-${start.toISOString()}`;
  const [h, m] = s.reminderTime.split(':').map(Number);
  const dayAt = spDate(spParts(start).day, h * 60 + m);
  const now = Date.now();
  if (dayAt.getTime() > now && dayAt < start) {
    await enqueue(run, { key: `rem-day-${tag}`, kind: 'reminder', appointmentId: a.id, phone: a.phone, body: msg.reminderDay(a, s), at: dayAt });
  }
  const before = new Date(start.getTime() - 15 * 60e3);
  if (before.getTime() > now) {
    await enqueue(run, { key: `rem-15-${tag}`, kind: 'reminder', appointmentId: a.id, phone: a.phone, body: msg.reminder15(a), at: before });
    await enqueue(run, { key: `rem-15s-${tag}`, kind: 'reminder', appointmentId: a.id, phone: a.staff_phone, body: msg.reminder15Staff(a), at: before });
  }
}

/** Envia o que venceu. Cada linha é "reservada" com UPDATE condicional: dois processos do app não enviam a mesma. */
export async function dispatch(limit = 10) {
  // Linha presa em "sending" por queda do processo volta para a fila depois de 10 min.
  await q("UPDATE notification_queue SET status = 'pending' WHERE status = 'sending' AND scheduled_for < ?", [new Date(Date.now() - 10 * 60e3)]);
  // Sem Evolution configurada a fila espera (não gasta tentativas); aviso que ficou velho demais não é mais enviado.
  if (!(await whatsappConfigured())) return;
  // ponytail: lembretes não passam por esse corte (são criados dias antes); se um lembrete atrasar muito, ainda sai.
  await q("UPDATE notification_queue SET status = 'cancelled', last_error = 'Desatualizada: não enviada' WHERE status = 'pending' AND kind <> 'reminder' AND created_at < ?", [new Date(Date.now() - 6 * 3600e3)]);
  const rows = await q("SELECT id, phone, body, attempts FROM notification_queue WHERE status = 'pending' AND scheduled_for <= ? ORDER BY scheduled_for LIMIT ?", [new Date(), limit]);
  for (const r of rows) {
    const claim = await q("UPDATE notification_queue SET status = 'sending', attempts = attempts + 1, scheduled_for = ? WHERE id = ? AND status = 'pending'", [new Date(), r.id]);
    if (!claim.affectedRows) continue;
    try {
      await sendWhatsapp(r.phone, r.body);
      await q("UPDATE notification_queue SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?", [new Date(), r.id]);
    } catch (e) {
      const attempts = r.attempts + 1;
      const retryAt = new Date(Date.now() + attempts * 5 * 60e3);
      await q('UPDATE notification_queue SET status = ?, last_error = ?, scheduled_for = ? WHERE id = ?',
        [attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', String(e.message).slice(0, 300), retryAt, r.id]);
    }
  }
}

