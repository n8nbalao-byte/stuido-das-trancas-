-- Vitrine inicial da loja: 10 produtos com foto, variações e estoque (editáveis no painel → Produtos e estoque).

INSERT INTO products (sort, slug, name, category, photo_url, description) VALUES
  (1,  'jumbo-para-trancas-400g', 'Jumbo para tranças 400 g', 'Jumbos', '/img/produtos/jumbo.webp',
   'Cabelo sintético para box braids, nagô, fulani e knotless. Fio macio, não pesa e mantém o brilho por semanas.\nPacote com 400 g — rende uma box braids média até a cintura.'),
  (2,  'jumbo-ombre-400g', 'Jumbo ombré 400 g', 'Jumbos', '/img/produtos/jumbo-ombre.webp',
   'Jumbo em duas cores com degradê suave da raiz às pontas. Ideal para box braids e twists com efeito iluminado.\nPacote com 400 g.'),
  (3,  'cabelo-cacheado-goddess-boho', 'Cabelo cacheado para Goddess e Boho', 'Cabelos', '/img/produtos/cabelo-cacheado.webp',
   'Cachos definidos e leves para finalizar Goddess Braids, Boho Braids e Fulani com cachos. Pode lavar e pentear com os dedos.\nPacote com 100 g.'),
  (4,  'fibra-faux-locs-butterfly', 'Fibra para Faux Locs e Butterfly', 'Cabelos', '/img/produtos/fibra-locs.webp',
   'Fibra texturizada para faux locs, butterfly locs e passion twists. Acabamento natural e caimento leve.\nPacote com 6 mechas.'),
  (5,  'kit-aneis-dourados-trancas', 'Kit anéis dourados para tranças (30 un.)', 'Acessórios', '/img/produtos/aneis.webp',
   'Anéis e argolas douradas para decorar box braids, fulani e locs. Abrem e fecham sem danificar a trança.\n30 peças em tamanhos variados.'),
  (6,  'micangas-para-trancas-100un', 'Miçangas para tranças (100 un.)', 'Acessórios', '/img/produtos/micangas.webp',
   'Miçangas com furo largo, próprias para tranças finas e médias. Perfeitas para fulani e tranças kids.\nPacote com 100 unidades.'),
  (7,  'gel-fixacao-trancas-250g', 'Gel de fixação para tranças 250 g', 'Cremes e cuidados', '/img/produtos/gel.webp',
   'Fixação forte para nagô, baby hair e acabamento das divisões. Não deixa resíduo branco e não endurece o fio.\nPote com 250 g.'),
  (8,  'oleo-ricino-couro-cabeludo-60ml', 'Óleo de rícino para couro cabeludo 60 ml', 'Cremes e cuidados', '/img/produtos/oleo.webp',
   'Hidrata o couro cabeludo e alivia a coceira enquanto você está de tranças. Aplique algumas gotas entre as divisões e massageie.\nFrasco com 60 ml.'),
  (9,  'touca-de-cetim', 'Touca de cetim', 'Acessórios', '/img/produtos/touca.webp',
   'Protege as tranças durante o sono, reduz o frizz e faz o penteado durar mais. Elástico confortável, tamanho único.'),
  (10, 'kit-pentes-madeira', 'Kit pentes de madeira (2 un.)', 'Acessórios', '/img/produtos/pentes.webp',
   'Dois pentes de madeira de dentes largos e médios: desembaraçam sem quebrar o fio e não geram estática.');

-- Variações: [slug, nome, preço em centavos, estoque, ordem]
INSERT INTO product_variants (product_id, name, price_cents, stock_qty, sort)
SELECT p.id, v.name, v.price, v.stock, v.ord FROM products p JOIN (
            SELECT 'jumbo-para-trancas-400g' AS slug, 'Preto 1B' AS name, 2990 AS price, 25 AS stock, 1 AS ord
  UNION ALL SELECT 'jumbo-para-trancas-400g', 'Castanho 4', 2990, 18, 2
  UNION ALL SELECT 'jumbo-para-trancas-400g', 'Mel 27', 2990, 14, 3
  UNION ALL SELECT 'jumbo-para-trancas-400g', 'Ruivo 30', 2990, 10, 4
  UNION ALL SELECT 'jumbo-ombre-400g', '1B / 27', 3490, 12, 1
  UNION ALL SELECT 'jumbo-ombre-400g', '1B / 30', 3490, 10, 2
  UNION ALL SELECT 'jumbo-ombre-400g', '1B / Bordô', 3490, 8, 3
  UNION ALL SELECT 'cabelo-cacheado-goddess-boho', 'Preto 1B', 8990, 10, 1
  UNION ALL SELECT 'cabelo-cacheado-goddess-boho', 'Castanho 4', 8990, 8, 2
  UNION ALL SELECT 'fibra-faux-locs-butterfly', 'Preto 1B', 5990, 12, 1
  UNION ALL SELECT 'fibra-faux-locs-butterfly', 'Pink', 5990, 8, 2
  UNION ALL SELECT 'kit-aneis-dourados-trancas', 'Padrão', 1990, 20, 1
  UNION ALL SELECT 'micangas-para-trancas-100un', 'Brancas', 1490, 15, 1
  UNION ALL SELECT 'micangas-para-trancas-100un', 'Coloridas', 1490, 20, 2
  UNION ALL SELECT 'gel-fixacao-trancas-250g', 'Padrão', 3290, 15, 1
  UNION ALL SELECT 'oleo-ricino-couro-cabeludo-60ml', 'Padrão', 2990, 15, 1
  UNION ALL SELECT 'touca-de-cetim', 'Preta', 2490, 12, 1
  UNION ALL SELECT 'touca-de-cetim', 'Vinho', 2490, 10, 2
  UNION ALL SELECT 'kit-pentes-madeira', 'Padrão', 1690, 15, 1
) v ON v.slug = p.slug;

-- Entrada de estoque registrada, como se tivesse sido lançada no painel.
INSERT INTO stock_movements (variant_id, delta, kind, reason)
SELECT v.id, v.stock_qty, 'entrada', 'Estoque inicial'
FROM product_variants v JOIN products p ON p.id = v.product_id
WHERE p.slug IN ('jumbo-para-trancas-400g','jumbo-ombre-400g','cabelo-cacheado-goddess-boho','fibra-faux-locs-butterfly','kit-aneis-dourados-trancas',
                 'micangas-para-trancas-100un','gel-fixacao-trancas-250g','oleo-ricino-couro-cabeludo-60ml','touca-de-cetim','kit-pentes-madeira');
