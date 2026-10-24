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
| produtos/jumbo · jumbo-ombre · cabelo-cacheado · fibra-locs · aneis | 1677319378211-06f6a50b49bd · 1560264641-1b5191cc63e2 · 1540920798597-102964c2d7ba · 1648010035157-ce441ddbaa0c · 1757866332595-3c464fb4e43d |
| produtos/micangas · gel · oleo · touca · pentes | 1776164951072-060a20ce0c75 · 1744309694479-d322305c541a · 1790145001749-788a05d5e151 · 1743931230723-2c1a77230642 · 1680670500665-22e480bcb0fa |

## Loja

Vitrine em `/loja` (começa com 10 produtos da migration `004_vitrine.sql`, editáveis em Produtos e estoque), carrinho no aparelho (`/carrinho`) e pedido finalizado pelo WhatsApp do salão (o pedido também cai na fila de avisos da Mariana). O pedido **reserva** o estoque; ao marcar **Pago** no painel vira venda e baixa o estoque; cancelar antes do pagamento libera a reserva, depois devolve ao estoque. Saídas manuais nunca deixam o estoque abaixo do reservado. Fotos dos produtos por upload no painel (pasta `UPLOAD_DIR`, fora do deploy).

## WhatsApp (Evolution API)

Instância `studio` em `https://evolution-api-yksm.srv1139708.hstgr.cloud`, configurada nas variáveis `EVOLUTION_*` do servidor (sem elas, a Mariana pode informar endereço, instância e chave no painel). A chave nunca vai para o navegador nem para o repositório.

A conexão do número é feita pela própria Mariana em **Painel → WhatsApp**: "Conectar com QR Code" (ler com o celular do salão em Dispositivos conectados) ou "Conectar com código" (digitar o código de pareamento no celular). Depois dá para enviar uma mensagem de teste ou desconectar. Enquanto não conecta, as mensagens ficam na fila; avisos com mais de 6 h são descartados para não chegarem fora de hora.

## Produção

`https://studiodastrancas.n8nbalao.com` — Node app na Hostinger (u770915504), deploy automático a cada push na `main`. Variáveis no hPanel: `DATABASE_URL` (banco `u770915504_studio`, senha com `@` codificado como `%40`), `NODE_ENV`, `PUBLIC_URL`, `UPLOAD_DIR=/home/u770915504/studio-uploads`, `EVOLUTION_*`. Comandos por SSH na pasta `~/domains/studiodastrancas.n8nbalao.com/hbuilds/current/nodejs` com `/opt/alt/alt-nodejs22/root/bin/node --env-file=$HOME/domains/studiodastrancas.n8nbalao.com/hbuilds/config/.env`.

## Pendências do salão

- Chave Pix e nome do recebedor (Configurações) — sem isso a cliente não paga o sinal.
- Quem faz cada serviço (Equipe → Competências) — sem isso nenhum horário aparece.
- Durações dos 26 serviços "pendentes"; nomes das opções do Goddess Braids.
- WhatsApp de Leide e Jhennifer (lembretes) e as variáveis da Evolution no servidor.
- Revisar os 10 produtos da vitrine (preços, estoque, fotos) em Produtos e estoque.
- Novas profissionais: Equipe → Adicionar profissional (nasce com a jornada do salão; marcar as competências).
- Conectar o WhatsApp do salão (Painel → WhatsApp) e trocar a senha temporária (Configurações → Minha senha).
- Próximas fases: impressão 80 mm, Pix automático com provedor (webhook).
