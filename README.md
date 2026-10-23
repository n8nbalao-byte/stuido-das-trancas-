# Studio das Tranças

Site público + agendamento com sinal de 30% via Pix + painel da Mariana. React/Vite (web/), Express 5 (server/), MySQL.

## Rodar localmente

```bash
cp .env.example .env            # ajuste DATABASE_URL
npm install
npm run migrate                 # cria tabelas e os 45 serviços reais
npm run make-admin -- mariana@exemplo.com "senha-com-10+"   # login do painel (profissional 1 = Mariana)
npm run build && npm start      # http://localhost:3000  (painel: /entrar)
# ou, em desenvolvimento: npm run api  +  npm run web
npm test                        # agenda (sem banco) + integração (precisa de TEST_DATABASE_URL)
```

## Implantação (Hostinger, Node.js app)

1. hPanel → Sites → `studiodastrancas.n8nbalao.com` → Node.js app ligado a este repositório (branch `main`, Node 22, entrada `server.js`, build `npm run build`).
2. Variáveis no painel (nunca no repositório): `DATABASE_URL=mysql://u770915504_studio:<senha>@127.0.0.1:3306/u770915504_studio`, `NODE_ENV=production`, `PUBLIC_URL=https://studiodastrancas.n8nbalao.com`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE=studio`, `UPLOAD_DIR=/home/<usuario>/studio-uploads`.
3. As migrations rodam sozinhas no boot. Depois do primeiro deploy, por SSH: `npm run make-admin -- <email> "<senha>"`.
4. Backup diário do banco em `~/studio-backups` (14 dias), feito pelo próprio app.

O app processa a fila de WhatsApp e expira reservas não pagas a cada minuto (não depende de navegador aberto).

## Regras implementadas

- A cliente escolhe serviço, data e horário — nunca a trancista. Horários consideram expediente, jornada, pausas, folgas, competências, atendimentos confirmados e reservas em andamento; até 3 simultâneos; nunca a mesma profissional em dois atendimentos.
- Sinal = `Math.round(total × 30%)` em centavos; saldo = total − sinal. Preço, sinal e saldo ficam gravados na reserva (`price_snapshot`).
- Reserva fica guardada por `holdMinutes` (padrão 30) e expira. "Já paguei" não confirma nada: a Mariana confere o Pix, escolhe a trancista (o servidor revalida) e só então o horário é confirmado.
- Serviço sem duração ou sem profissional habilitada não aparece no agendamento online (CTA WhatsApp).
- Cancelamento/remarcação pedidos pela cliente vão para análise da Mariana. Atraso, falta, desistência e remarcação ficam no histórico com motivo.
- Lembretes: no dia (horário configurável) e 15 min antes, para cliente e trancista; cancelados/refeitos ao cancelar ou remarcar.

Decisões tomadas sobre os dados (confirmar com a Mariana):
- Durações em faixa ("4 h ou 5 h"): a agenda reserva o tempo maior e o site mostra a faixa (Entrelace, Fulani + Entrelace, Nagô masculina).
- Boxeadora: opções pareadas na ordem da lista (R$ 150 / 1 h 30 e R$ 270 / 2 h). Goddess Braids: "Opção A" (R$ 420) e "Opção B" (R$ 500) — renomear no painel.
- Nina Crochet Braids: "Com material" (R$ 390) e "Só mão de obra" (R$ 250), duração pendente.

## Imagens

Fotos ilustrativas do [Unsplash](https://unsplash.com/license) (uso comercial livre, sem atribuição obrigatória), recortadas e tratadas para a paleta do site em `web/public/img/`. Borboletas recortadas do próprio logo. O rodapé informa "Imagens ilustrativas" até chegarem fotos reais dos trabalhos (painel → Serviços → Foto).

| Arquivo | Foto (images.unsplash.com/photo-…) |
|---|---|
| hero-desktop | 1572955304332-bf714bd49add |
| hero-mobile | 1759756655332-d66200497312 (Malama Mushitu) |
| cat-fulani · cat-box-braids · cat-nago · cat-goddess | 1774773132713-52f8f7825e63 · 1612459284970-e8f027596582 · 1673470907547-1c0c6a996095 · 1770419252624-e14e9f9de640 |
| cat-french · cat-faux-locs · cat-twist · cat-entrelace | 1709672262859-68cb9b39ae4f · 1755705098201-41a342182818 · 1636302925868-52075f44d810 · 1762810629910-5ad48ad9b181 |
| cat-boho · cat-rabo-de-cavalo · cat-tiarinha · cat-kids · cat-outros | 1770182022686-879a575d4f09 · 1770182023775-4706ce1bed72 · 1770182023641-def05e36a69e · 1785547217618-b3c40af30f4b · 1613099084406-4b9140fc780a |
| salao (página Sobre) | 1763048208932-cbe149724374 |

## Loja

Vitrine em `/loja`, carrinho no aparelho (`/carrinho`) e pedido finalizado pelo WhatsApp do salão (o pedido também cai na fila de avisos da Mariana). O pedido **reserva** o estoque; ao marcar **Pago** no painel vira venda e baixa o estoque; cancelar antes do pagamento libera a reserva, depois devolve ao estoque. Saídas manuais nunca deixam o estoque abaixo do reservado. Fotos dos produtos por upload no painel (pasta `UPLOAD_DIR`, fora do deploy).

## WhatsApp (Evolution API)

Instância `studio` em `https://evolution-api-yksm.srv1139708.hstgr.cloud`. A chave vai **só** na variável `EVOLUTION_API_KEY` do servidor (nunca no repositório nem no `.env` local, para o ambiente de teste não mandar mensagem de verdade). Em 23/10/2026 a instância respondia `state: close`: falta ler o QR Code no painel da Evolution com o celular do salão.

## Pendências do salão

- Chave Pix e nome do recebedor (Configurações) — sem isso a cliente não paga o sinal.
- Quem faz cada serviço (Equipe → Competências) — sem isso nenhum horário aparece.
- Durações dos 26 serviços "pendentes"; nomes das opções do Goddess Braids.
- WhatsApp de Leide e Jhennifer (lembretes) e as variáveis da Evolution no servidor.
- Cadastro dos produtos (nome, preço, estoque, foto) em Produtos e estoque.
- Ler o QR Code da instância `studio` na Evolution.
- Próximas fases: impressão 80 mm, Pix automático com provedor (webhook).
