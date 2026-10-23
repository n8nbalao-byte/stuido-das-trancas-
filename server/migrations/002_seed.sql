-- Dados reais fornecidos pelo salão (lista-servicos.md, 20/10/2026). Duração NULL = "Informação pendente".
-- Onde a lista dá uma faixa ("4 h ou 5 h"), a agenda reserva o tempo maior e mostra a faixa em duration_note.

INSERT INTO business_hours (weekday, open_min, close_min) VALUES
  (2, 540, 1080), (3, 540, 1080), (4, 540, 1140), (5, 480, 1200), (6, 480, 720);

INSERT INTO staff (id, name, role, color) VALUES
  (1, 'Mariana', 'admin', '#5A1F3B'),
  (2, 'Leide', 'trancista', '#B8862E'),
  (3, 'Jhennifer', 'trancista', '#2F5D8A');

-- Jornada inicial = expediente do salão (editável no painel).
INSERT INTO staff_hours (staff_id, weekday, start_min, end_min)
  SELECT s.id, b.weekday, b.open_min, b.close_min FROM staff s CROSS JOIN business_hours b;

INSERT INTO services (sort, slug, name, category, price_cents, price_type, duration_min, duration_note, description) VALUES
  (1,  'alongamento-cabelo-organico-ponto-americano', 'Alongamento com cabelo orgânico, técnica ponto americano', 'Outros', 32000, 'fixed', NULL, NULL, NULL),
  (2,  'boho-braids', 'Boho Braids', 'Boho Braids', 58000, 'fixed', 480, NULL, NULL),
  (3,  'box-braids-m-cintura', 'Box Braids M cintura', 'Box Braids', 52000, 'fixed', 360, NULL, NULL),
  (4,  'box-braids-masculina', 'Box braids masculina', 'Box Braids', 28000, 'from', 240, NULL, NULL),
  (5,  'boxeadora', 'Boxeadora', 'Nagô', 15000, 'fixed', NULL, NULL, NULL),
  (6,  'boxeadora-com-cachos', 'Boxeadora com cachos', 'Nagô', 27000, 'fixed', NULL, NULL, NULL),
  (7,  'bubbles-extensao-sintetica', 'Bubbles com extensão sintética', 'Outros', 8000, 'fixed', NULL, NULL, NULL),
  (8,  'butterfly', 'Butterfly', 'Faux Locs', 45000, 'from', NULL, NULL, 'O preço varia conforme o comprimento.'),
  (9,  'entrelace', 'Entrelace', 'Entrelace', 47000, 'fixed', 300, '4 h a 5 h', NULL),
  (10, 'faux-locs', 'Faux locs', 'Faux Locs', 48000, 'fixed', 360, NULL, NULL),
  (11, 'fresh-curl', 'Fresh Curl', 'Outros', 50000, 'fixed', 480, NULL, NULL),
  (12, 'french-braids-curta', 'French Braids curta', 'French Braids', 41000, 'fixed', 360, NULL, NULL),
  (13, 'french-braids-longa', 'French Braids longa', 'French Braids', 52000, 'fixed', 480, NULL, NULL),
  (14, 'fulani-braids', 'Fulani Braids', 'Fulani Braids', 47000, 'fixed', 360, NULL, NULL),
  (15, 'fulani-braids-cachos-cintura', 'Fulani Braids com cachos até a cintura', 'Fulani Braids', 49000, 'fixed', NULL, NULL, NULL),
  (16, 'fulani-braids-estilo-m', 'Fulani Braids estilo M', 'Fulani Braids', 47000, 'fixed', NULL, NULL, NULL),
  (17, 'fulani-entrelace', 'Fulani + Entrelace', 'Fulani Braids', 49000, 'fixed', 360, '5 h a 6 h', NULL),
  (18, 'fulani-entrelace-liso', 'Fulani + Entrelace liso', 'Fulani Braids', 49000, 'fixed', NULL, NULL, NULL),
  (19, 'fulani-entrelace-cacheado', 'Fulani + Entrelace cacheado', 'Fulani Braids', 49000, 'fixed', NULL, NULL, NULL),
  (20, 'fulani-nago', 'Fulani + Nagô', 'Fulani Braids', 38000, 'fixed', 360, NULL, NULL),
  (21, 'fulani-nina', 'Fulani + Nina', 'Fulani Braids', 38000, 'fixed', NULL, NULL, NULL),
  (22, 'goddess-braids', 'Goddess Braids', 'Goddess Braids', 42000, 'fixed', 360, NULL, NULL),
  (23, 'goddess-braids-chanel', 'Goddess Braids Chanel', 'Goddess Braids', 42000, 'fixed', NULL, NULL, NULL),
  (24, 'goddess-braids-cachos-na-ponta', 'Goddess Braids com cachos na ponta', 'Goddess Braids', 50000, 'fixed', NULL, NULL, NULL),
  (25, 'goddess-braids-m-cintura', 'Goddess Braids M cintura', 'Goddess Braids', 65000, 'fixed', NULL, NULL, NULL),
  (26, 'jypsy-braids', 'Jypsy Braids', 'Boho Braids', 50000, 'fixed', NULL, NULL, NULL),
  (27, 'jypsy-braids-chanel', 'Jypsy Braids Chanel', 'Boho Braids', 42000, 'fixed', NULL, NULL, NULL),
  (28, 'knolles-braids', 'Knolles Braids', 'Box Braids', 52000, 'fixed', 360, NULL, NULL),
  (29, 'marley-afro-twists', 'Marley Afro Twists', 'Twist', 49000, 'fixed', 240, NULL, NULL),
  (30, 'nago', 'Nagô', 'Nagô', 27000, 'fixed', NULL, NULL, NULL),
  (31, 'nago-com-cachos', 'Nagô com cachos', 'Nagô', 32000, 'fixed', 180, NULL, NULL),
  (32, 'nago-masculina', 'Nagô masculina', 'Nagô', 15000, 'fixed', 120, '1 h 30 min a 2 h', NULL),
  (33, 'nina-crochet-braids', 'Nina Crochet Braids', 'Outros', 25000, 'fixed', NULL, NULL, NULL),
  (34, 'rabo-de-cavalo', 'Rabo de cavalo', 'Rabo de cavalo', 25000, 'fixed', NULL, NULL, NULL),
  (35, 'rabo-de-cavalo-cintura', 'Rabo de cavalo cintura', 'Rabo de cavalo', 25000, 'from', 180, NULL, NULL),
  (36, 'rabo-de-cavalo-removivel', 'Rabo de cavalo removível', 'Rabo de cavalo', 6000, 'from', NULL, NULL, NULL),
  (37, 'tiarinha-inteira', 'Tiarinha inteira', 'Tiarinha', 8000, 'fixed', 90, NULL, NULL),
  (38, 'tiarinha-lateral', 'Tiarinha lateral', 'Tiarinha', 5500, 'fixed', 40, NULL, NULL),
  (39, 'tiarinha-topo', 'Tiarinha topo', 'Tiarinha', 5500, 'fixed', 40, NULL, NULL),
  (40, 'tiarinha-topo-ou-lateral', 'Tiarinha topo ou lateral', 'Tiarinha', 5500, 'fixed', NULL, NULL, NULL),
  (41, 'tranca-mega-hair', 'Trança Mega Hair', 'Outros', 55000, 'fixed', 360, NULL, NULL),
  (42, 'tranca-nago', 'Trança Nagô', 'Nagô', 26000, 'fixed', 180, NULL, NULL),
  (43, 'tranca-nago-masculina', 'Trança Nagô masculina', 'Nagô', 15000, 'fixed', NULL, NULL, NULL),
  (44, 'trancas-kids', 'Tranças Kids', 'Kids', 8000, 'from', NULL, NULL, NULL),
  (45, 'trancas-mae-e-filha', 'Tranças Mãe e Filha', 'Kids', 27000, 'fixed', NULL, NULL, NULL);

-- Mais de um preço para o mesmo nome: opções separadas (a Mariana pode renomear no painel).
INSERT INTO service_variants (service_id, sort, name, price_cents, duration_min)
  SELECT id, 1, 'Opção 1 h 30 min', 15000, 90 FROM services WHERE slug = 'boxeadora'
  UNION ALL SELECT id, 2, 'Opção 2 h', 27000, 120 FROM services WHERE slug = 'boxeadora'
  UNION ALL SELECT id, 1, 'Opção A', 42000, 360 FROM services WHERE slug = 'goddess-braids'
  UNION ALL SELECT id, 2, 'Opção B', 50000, 360 FROM services WHERE slug = 'goddess-braids'
  UNION ALL SELECT id, 1, 'Com material', 39000, NULL FROM services WHERE slug = 'nina-crochet-braids'
  UNION ALL SELECT id, 2, 'Só mão de obra (levando o cabelo)', 25000, NULL FROM services WHERE slug = 'nina-crochet-braids';
