-- Categorias da loja gerenciadas pelo painel (criar, renomear, ordenar, excluir).
-- products.category continua guardando o nome; renomear atualiza os produtos na mesma transação.

CREATE TABLE product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  sort INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO product_categories (name, sort) VALUES ('Jumbos', 1), ('Cabelos', 2), ('Cremes e cuidados', 3), ('Acessórios', 4);
-- Categorias que já estejam em uso e não sejam as de cima.
INSERT IGNORE INTO product_categories (name, sort) SELECT DISTINCT category, 9 FROM products;
