-- Additive upgrade: preserves existing users and donations.
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
