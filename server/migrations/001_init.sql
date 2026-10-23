-- Studio das Tranças: esquema inicial. Valores em centavos (INT), horários em UTC (DATETIME), minutos do dia em hora de São Paulo.

CREATE TABLE app_settings (
  name VARCHAR(60) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(20) NULL,
  role ENUM('admin','trancista') NOT NULL DEFAULT 'trancista',
  color VARCHAR(7) NOT NULL DEFAULT '#5A1F3B',
  active TINYINT(1) NOT NULL DEFAULT 1,
  email VARCHAR(120) NULL UNIQUE,
  password_hash VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  staff_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE login_attempts (
  email VARCHAR(120) PRIMARY KEY,
  fails INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expediente do salão (sem linha = fechado). 0 = domingo.
CREATE TABLE business_hours (
  weekday TINYINT PRIMARY KEY,
  open_min SMALLINT NOT NULL,
  close_min SMALLINT NOT NULL,
  CHECK (close_min > open_min)
) ENGINE=InnoDB;

-- Jornada individual por dia da semana, com pausa opcional.
CREATE TABLE staff_hours (
  staff_id INT NOT NULL,
  weekday TINYINT NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  break_start_min SMALLINT NULL,
  break_end_min SMALLINT NULL,
  PRIMARY KEY (staff_id, weekday),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CHECK (end_min > start_min)
) ENGINE=InnoDB;

CREATE TABLE staff_time_off (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  reason VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  INDEX (starts_at),
  CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description TEXT NULL,
  instructions TEXT NULL,
  price_cents INT NULL,
  price_type ENUM('fixed','from') NOT NULL DEFAULT 'fixed',
  duration_min SMALLINT NULL,          -- NULL = informação pendente: não entra no agendamento online
  duration_note VARCHAR(60) NULL,      -- ex.: "4 h a 5 h" quando o salão informou uma faixa
  buffer_min SMALLINT NOT NULL DEFAULT 0,
  photo_url VARCHAR(300) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort INT NOT NULL DEFAULT 0,
  CHECK (price_cents IS NULL OR price_cents >= 0),
  CHECK (duration_min IS NULL OR duration_min > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_cents INT NOT NULL,
  duration_min SMALLINT NULL,
  sort INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (service_id) REFERENCES services(id),
  CHECK (price_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE service_price_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  variant_id INT NULL,
  field VARCHAR(30) NOT NULL,
  old_value VARCHAR(100) NULL,
  new_value VARCHAR(100) NULL,
  staff_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Competências: quem executa cada serviço (não presumir que todas fazem tudo).
CREATE TABLE staff_skills (
  staff_id INT NOT NULL,
  service_id INT NOT NULL,
  PRIMARY KEY (staff_id, service_id),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(11) NOT NULL UNIQUE,
  notes TEXT NULL,
  consent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code CHAR(6) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  service_id INT NOT NULL,
  variant_id INT NULL,
  staff_id INT NULL,                   -- NULL até a Mariana atribuir
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,            -- fim do bloco ocupado (duração + preparo)
  status VARCHAR(30) NOT NULL,
  total_cents INT NOT NULL,
  deposit_cents INT NOT NULL,
  balance_cents INT NOT NULL,
  price_snapshot JSON NOT NULL,        -- serviço, opção, preço e duração no momento da reserva
  hold_expires_at DATETIME NULL,
  proposed_start_at DATETIME NULL,
  proposed_end_at DATETIME NULL,
  proposed_staff_id INT NULL,
  customer_request VARCHAR(500) NULL,  -- pedido de cancelamento/remarcação aguardando a Mariana
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (variant_id) REFERENCES service_variants(id),
  FOREIGN KEY (staff_id) REFERENCES staff(id),
  INDEX (start_at),
  INDEX (status),
  CHECK (deposit_cents + balance_cents = total_cents)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico (somente inserção): status, atraso, falta, remarcação, pedidos da cliente.
CREATE TABLE appointment_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  reason VARCHAR(500) NULL,
  staff_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  INDEX (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL UNIQUE,  -- um sinal por agendamento (impede cobrança duplicada)
  amount_cents INT NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'pix',
  status ENUM('pending','declared','confirmed','rejected') NOT NULL DEFAULT 'pending',
  txid VARCHAR(25) NOT NULL UNIQUE,
  pix_payload TEXT NULL,
  provider VARCHAR(30) NULL,           -- futuro: provedor com webhook
  provider_ref VARCHAR(100) NULL UNIQUE,
  declared_at DATETIME NULL,
  confirmed_by INT NULL,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fila persistente de WhatsApp.
CREATE TABLE notification_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dedupe_key VARCHAR(120) NOT NULL UNIQUE,
  kind VARCHAR(30) NOT NULL,
  appointment_id INT NULL,
  phone VARCHAR(15) NOT NULL,
  body TEXT NOT NULL,
  scheduled_for DATETIME NOT NULL,
  status ENUM('pending','sending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(300) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (status, scheduled_for),
  INDEX (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
