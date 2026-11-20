-- =====================================================================
-- LifeLink database schema
-- Target: MySQL 9.7 LTS or 8.4 LTS, InnoDB engine, utf8mb4 characters.
-- Run it with `npm run db:setup` (recommended) or paste it into
-- MySQL Workbench on a server that has no `lifelink` database yet.
--
-- Naming rules used everywhere in this file
--   tables        plural, snake_case            blood_requests
--   columns       singular, snake_case          units_needed
--   primary key   id  (1-to-1 and join tables use their foreign keys)
--   foreign key   <table singular>_id           blood_type_id
--                 <role>_id when the role matters donor_id, requester_id
--                 reviewed_by for the admin who decided
--   booleans      is_<adjective>                is_active
--   times         created_at, updated_at, *_at  stored in UTC (DATETIME)
--   constraints   fk_<table>_<column>, uq_<table>_<columns>,
--                 ck_<table>_<rule>, idx_<table>_<purpose>
-- =====================================================================

CREATE DATABASE IF NOT EXISTS lifelink CHARACTER SET utf8mb4;
USE lifelink;

-- ---------------------------------------------------------------------
-- 1. Lookup tables (fixed reference data, filled at the end of the file)
-- ---------------------------------------------------------------------

CREATE TABLE roles (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(20)      NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_roles_name UNIQUE (name)
) ENGINE = InnoDB;

CREATE TABLE blood_types (
  id    TINYINT UNSIGNED NOT NULL,
  label VARCHAR(3)       NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_blood_types_label UNIQUE (label)
) ENGINE = InnoDB;

-- Which donor blood type may be given to which recipient blood type
-- (red blood cells). One row per allowed pair.
CREATE TABLE blood_compatibility (
  donor_blood_type_id     TINYINT UNSIGNED NOT NULL,
  recipient_blood_type_id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (donor_blood_type_id, recipient_blood_type_id),
  CONSTRAINT fk_blood_compatibility_donor
    FOREIGN KEY (donor_blood_type_id) REFERENCES blood_types (id),
  CONSTRAINT fk_blood_compatibility_recipient
    FOREIGN KEY (recipient_blood_type_id) REFERENCES blood_types (id)
) ENGINE = InnoDB;

CREATE TABLE medicine_categories (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40)      NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_medicine_categories_name UNIQUE (name)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 2. People
-- ---------------------------------------------------------------------

-- Every account: donors, recipients (patients), hospitals and admins.
-- Accounts are never deleted; an admin deactivates them instead.
CREATE TABLE users (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  role_id       TINYINT UNSIGNED NOT NULL,
  full_name     VARCHAR(100)     NOT NULL,
  email         VARCHAR(254)     NOT NULL,              -- longest valid email address
  password_hash VARCHAR(255)     NOT NULL,              -- Argon2id string, never the password
  phone         VARCHAR(20)      NULL,
  city          VARCHAR(60)      NULL,
  latitude      DECIMAL(8, 6)    NULL,                  -- -90.000000 .. 90.000000
  longitude     DECIMAL(9, 6)    NULL,                  -- -180.000000 .. 180.000000
  is_active     BOOLEAN          NOT NULL DEFAULT TRUE,
  session_version INT UNSIGNED   NOT NULL DEFAULT 0,    -- +1 on password change: older sessions stop working
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT ck_users_latitude  CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT ck_users_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_users_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  INDEX idx_users_role_active (role_id, is_active)
) ENGINE = InnoDB;

-- Server-side login sessions. Anonymous visitors create no rows.
CREATE TABLE IF NOT EXISTS sessions (
  id_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  session_version INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id_hash),
  INDEX idx_sessions_expiry (expires_at),
  INDEX idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Extra data that only donors have (one row per donor, same id as the user).
CREATE TABLE donor_profiles (
  user_id            INT UNSIGNED     NOT NULL,
  blood_type_id      TINYINT UNSIGNED NOT NULL,
  last_donation_date DATE             NULL,             -- drives the 56-day waiting period
  is_available       BOOLEAN          NOT NULL DEFAULT TRUE,
  updated_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_donor_profiles_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_donor_profiles_blood_type
    FOREIGN KEY (blood_type_id) REFERENCES blood_types (id),
  INDEX idx_donor_profiles_matching (blood_type_id, is_available, last_donation_date)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 3. Blood
-- ---------------------------------------------------------------------

-- A need for blood, from a hospital, a recipient or the admin.
-- pending -> (admin approves) open -> fulfilled, or cancelled at any point.
CREATE TABLE blood_requests (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  requester_id   INT UNSIGNED     NOT NULL,
  blood_type_id  TINYINT UNSIGNED NOT NULL,
  units_needed   TINYINT UNSIGNED NOT NULL,
  units_received TINYINT UNSIGNED NOT NULL DEFAULT 0,
  has_hospital_pin BOOLEAN NOT NULL DEFAULT FALSE, -- explicit treating-hospital location; never a patient home fallback
  urgency        ENUM('normal', 'urgent', 'sos') NOT NULL DEFAULT 'normal',  -- order matters: sorts normal < urgent < sos
  hospital_name  VARCHAR(120)     NOT NULL,
  city           VARCHAR(60)      NULL,
  latitude       DECIMAL(8, 6)    NULL,
  longitude      DECIMAL(9, 6)    NULL,
  status         ENUM('pending', 'open', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'pending',
  admin_note     VARCHAR(255)     NULL,                 -- reason shown to the requester when denied
  reviewed_by    INT UNSIGNED     NULL,
  reviewed_at    DATETIME         NULL,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_blood_requests_requester   FOREIGN KEY (requester_id)  REFERENCES users (id),
  CONSTRAINT fk_blood_requests_blood_type  FOREIGN KEY (blood_type_id) REFERENCES blood_types (id),
  CONSTRAINT fk_blood_requests_reviewed_by FOREIGN KEY (reviewed_by)   REFERENCES users (id),
  CONSTRAINT ck_blood_requests_units_needed   CHECK (units_needed BETWEEN 1 AND 50),
  CONSTRAINT ck_blood_requests_units_received CHECK (units_received <= units_needed),
  CONSTRAINT ck_blood_requests_latitude  CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT ck_blood_requests_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_blood_requests_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  INDEX idx_blood_requests_status (status, urgency, created_at)
) ENGINE = InnoDB;

-- One donor's blood donation. request_id is NULL for an independent offer.
-- invited (admin asked) -> pending (donor agreed) -> accepted (admin approved) -> completed (blood received);
-- or declined (donor said no) / cancelled (admin said no).
CREATE TABLE blood_donations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  donor_id    INT UNSIGNED NOT NULL,
  request_id  INT UNSIGNED NULL,
  status      ENUM('invited', 'pending', 'completed', 'declined', 'cancelled', 'accepted') NOT NULL DEFAULT 'pending',
  admin_note  VARCHAR(255) NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  accepted_at DATETIME NULL, -- offer acceptance; reviewed_at records completion/cancellation
  CONSTRAINT uq_blood_donations_request_donor UNIQUE (request_id, donor_id),  -- one answer per donor per request
  CONSTRAINT fk_blood_donations_donor       FOREIGN KEY (donor_id)    REFERENCES users (id),
  CONSTRAINT fk_blood_donations_request     FOREIGN KEY (request_id)  REFERENCES blood_requests (id),
  CONSTRAINT fk_blood_donations_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
  INDEX idx_blood_donations_donor (donor_id, status),
  INDEX idx_blood_donations_status (status, created_at)
) ENGINE = InnoDB;

-- Current units of each blood type in the blood bank (one row per type).
CREATE TABLE blood_stock (
  blood_type_id   TINYINT UNSIGNED  NOT NULL,
  units_available SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- UNSIGNED: stock can never go below zero
  updated_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (blood_type_id),
  CONSTRAINT fk_blood_stock_blood_type FOREIGN KEY (blood_type_id) REFERENCES blood_types (id)
) ENGINE = InnoDB;

-- Every change to blood_stock, so the inventory can be audited:
-- where each unit came from (a donation) and where it went (a request).
CREATE TABLE blood_stock_movements (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  blood_type_id TINYINT UNSIGNED NOT NULL,
  change_units  SMALLINT         NOT NULL,              -- +1 for a donation, negative when dispensed
  reason        ENUM('donation', 'dispensed', 'adjustment') NOT NULL,
  donation_id   INT UNSIGNED     NULL,                  -- the donation that added the unit
  request_id    INT UNSIGNED     NULL,                  -- the request that received the units
  created_by    INT UNSIGNED     NULL,
  note          VARCHAR(255)     NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_blood_stock_movements_blood_type FOREIGN KEY (blood_type_id) REFERENCES blood_types (id),
  CONSTRAINT fk_blood_stock_movements_donation   FOREIGN KEY (donation_id)   REFERENCES blood_donations (id),
  CONSTRAINT fk_blood_stock_movements_request    FOREIGN KEY (request_id)    REFERENCES blood_requests (id),
  CONSTRAINT fk_blood_stock_movements_created_by FOREIGN KEY (created_by)    REFERENCES users (id),
  CONSTRAINT ck_blood_stock_movements_nonzero CHECK (change_units <> 0),
  INDEX idx_blood_stock_movements_type (blood_type_id, created_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 4. Medicines
-- ---------------------------------------------------------------------

-- An admin's appeal to all donors for a specific medicine.
CREATE TABLE medicine_calls (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by    INT UNSIGNED NOT NULL,
  medicine_name VARCHAR(120) NOT NULL,
  quantity      INT UNSIGNED NOT NULL,
  note          VARCHAR(300) NULL,
  status        ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  closed_at     DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_medicine_calls_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT ck_medicine_calls_quantity CHECK (quantity BETWEEN 1 AND 100000),
  INDEX idx_medicine_calls_status (status, created_at)
) ENGINE = InnoDB;

-- A batch of medicine given by a donor. It is public only once approved.
-- quantity_available goes down as requests are dispensed.
CREATE TABLE medicines (
  id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  donor_id           INT UNSIGNED     NOT NULL,
  category_id        TINYINT UNSIGNED NOT NULL,
  call_id            INT UNSIGNED     NULL,             -- set when the donation answers an admin's call
  name               VARCHAR(120)     NOT NULL,
  description        VARCHAR(500)     NULL,
  quantity_donated   INT UNSIGNED     NOT NULL,
  quantity_available INT UNSIGNED     NOT NULL,
  expiry_date        DATE             NOT NULL,
  photo_url          VARCHAR(500)     NULL,
  status             ENUM('pending', 'approved', 'rejected', 'expired', 'dispensed') NOT NULL DEFAULT 'pending',
  admin_note         VARCHAR(255)     NULL,
  reviewed_by        INT UNSIGNED     NULL,
  reviewed_at        DATETIME         NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_medicines_donor       FOREIGN KEY (donor_id)    REFERENCES users (id),
  CONSTRAINT fk_medicines_category    FOREIGN KEY (category_id) REFERENCES medicine_categories (id),
  CONSTRAINT fk_medicines_call        FOREIGN KEY (call_id)     REFERENCES medicine_calls (id) ON DELETE SET NULL,
  CONSTRAINT fk_medicines_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
  CONSTRAINT ck_medicines_quantity_donated   CHECK (quantity_donated BETWEEN 1 AND 10000),
  CONSTRAINT ck_medicines_quantity_available CHECK (quantity_available <= quantity_donated),
  INDEX idx_medicines_status_expiry (status, expiry_date),
  INDEX idx_medicines_name (name)
) ENGINE = InnoDB;

-- A recipient or hospital asking for part of an approved medicine batch.
CREATE TABLE medicine_requests (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  requester_id INT UNSIGNED NOT NULL,
  medicine_id  INT UNSIGNED NOT NULL,
  quantity     INT UNSIGNED NOT NULL,
  status       ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  admin_note   VARCHAR(255) NULL,
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_medicine_requests_requester   FOREIGN KEY (requester_id) REFERENCES users (id),
  CONSTRAINT fk_medicine_requests_medicine    FOREIGN KEY (medicine_id)  REFERENCES medicines (id),
  CONSTRAINT fk_medicine_requests_reviewed_by FOREIGN KEY (reviewed_by)  REFERENCES users (id),
  CONSTRAINT ck_medicine_requests_quantity CHECK (quantity BETWEEN 1 AND 10000),
  INDEX idx_medicine_requests_status (status, created_at),
  INDEX idx_medicine_requests_requester (requester_id, status)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 5. Notifications and audit trail
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('sos', 'request', 'invite', 'response', 'donation', 'medicine', 'thanks', 'account') NOT NULL,
  message    VARCHAR(255) NOT NULL,
  link       VARCHAR(100) NULL,                         -- page to open, for example #/queue
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, id)
) ENGINE = InnoDB;

-- Security-relevant events: logins, failed logins, admin decisions.
CREATE TABLE audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NULL,                      -- NULL for failed logins of unknown emails
  action     VARCHAR(60)     NOT NULL,                  -- for example auth.login_failed
  entity     VARCHAR(40)     NULL,                      -- for example blood_request
  entity_id  INT UNSIGNED    NULL,
  ip_address VARCHAR(45)     NULL,                      -- 45 characters fits any IPv6 address
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_audit_logs_user (user_id, created_at),
  INDEX idx_audit_logs_entity (entity, entity_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 6. Reference data
-- ---------------------------------------------------------------------

INSERT INTO roles (name) VALUES ('donor'), ('recipient'), ('hospital'), ('admin');

INSERT INTO blood_types (id, label) VALUES
  (1, 'A+'), (2, 'A-'), (3, 'B+'), (4, 'B-'), (5, 'AB+'), (6, 'AB-'), (7, 'O+'), (8, 'O-');

-- Red blood cell compatibility: 27 allowed donor -> recipient pairs.
INSERT INTO blood_compatibility (donor_blood_type_id, recipient_blood_type_id)
SELECT d.id, r.id
FROM blood_types AS d
JOIN blood_types AS r
  ON (d.label, r.label) IN (
    ('O-', 'O-'), ('O-', 'O+'), ('O-', 'A-'), ('O-', 'A+'), ('O-', 'B-'), ('O-', 'B+'), ('O-', 'AB-'), ('O-', 'AB+'),
    ('O+', 'O+'), ('O+', 'A+'), ('O+', 'B+'), ('O+', 'AB+'),
    ('A-', 'A-'), ('A-', 'A+'), ('A-', 'AB-'), ('A-', 'AB+'),
    ('A+', 'A+'), ('A+', 'AB+'),
    ('B-', 'B-'), ('B-', 'B+'), ('B-', 'AB-'), ('B-', 'AB+'),
    ('B+', 'B+'), ('B+', 'AB+'),
    ('AB-', 'AB-'), ('AB-', 'AB+'),
    ('AB+', 'AB+')
  );

-- The blood bank starts empty: one stock row per blood type.
INSERT INTO blood_stock (blood_type_id) SELECT id FROM blood_types;

INSERT INTO medicine_categories (name) VALUES
  ('General'), ('Pain relief'), ('Antibiotics'), ('Chronic care'), ('Vitamins'), ('First aid'), ('Other');
