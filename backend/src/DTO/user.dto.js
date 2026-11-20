// DTOs for accounts. Each one lists exactly which fields may cross a layer boundary,
// so nothing else (a password hash, an extra field sent by an attacker) slips through.
'use strict';

// ---- Input DTOs: PL -> BLL (built from validated request data) ----
class RegisterDTO {
  constructor({
    full_name,
    email,
    password,
    role,
    city = null,
    phone = null,
    latitude = null,
    longitude = null,
    blood_type_id = null
  }) {
    this.full_name = full_name;
    this.email = email;
    this.password = password;
    this.role = role;
    this.city = city;
    this.phone = phone;
    this.latitude = latitude;
    this.longitude = longitude;
    if (role === 'donor') {
      this.blood_type_id = blood_type_id;
    } else {
      this.blood_type_id = null;
    }
  }
}

class LoginDTO {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
  }
}
const EDITABLE = ['full_name', 'phone', 'city', 'latitude', 'longitude', 'is_available'];

/** Only the fields that were actually sent are present. */
class ProfileUpdateDTO {
  constructor(input) {
    for (const field of EDITABLE) {
      if (Object.hasOwn(input, field)) {
        this[field] = input[field];
      }
    }
  }
}

class PasswordChangeDTO {
  constructor({ current_password, new_password }) {
    this.current_password = current_password;
    this.new_password = new_password;
  }
}

class UserFilterDTO {
  constructor({ role, is_active, q }) {
    this.role = role ?? null;
    if (is_active === undefined) {
      this.isActive = null;
    } else {
      this.isActive = is_active === 'true';
    }
    this.q = q || null;
  }
}

// ---- Output DTOs: DAL -> BLL -> PL ----

/** What the API shows about an account. Never contains the password hash. */
class UserDTO {
  constructor(row) {
    this.id = row.id;
    this.full_name = row.full_name;
    this.email = row.email;
    this.role = row.role;
    this.phone = row.phone;
    this.city = row.city;
    this.latitude = row.latitude;
    this.longitude = row.longitude;
    this.is_active = row.is_active;
    this.created_at = row.created_at;
    if (row.role === 'donor') {
      this.donor = {
        blood_type_id: row.blood_type_id,
        blood_type: row.blood_type,
        last_donation_date: row.last_donation_date,
        is_available: row.is_available
      };
    } else {
      this.donor = null;
    }
  }
}

/** DAL -> BLL, for sign-in only: includes the hash, never leaves the BLL. */
class CredentialsDTO {
  constructor(row) {
    this.id = row.id;
    this.full_name = row.full_name;
    this.role = row.role;
    this.password_hash = row.password_hash;
    this.is_active = row.is_active;
    this.session_version = row.session_version;
  }
}

/** DAL -> BLL -> PL: the signed-in user attached to each request. */
class SessionUserDTO {
  constructor(row) {
    this.id = row.id;
    this.full_name = row.full_name;
    this.role = row.role;
    this.is_active = row.is_active;
    this.session_version = row.session_version;
  }
}

/** BLL -> PL: result of a sign-up or sign-in. */
class AuthResultDTO {
  constructor(user, sessionVersion) {
    this.user = user;
    this.sessionVersion = sessionVersion;
  }
}

module.exports = {
  RegisterDTO,
  LoginDTO,
  ProfileUpdateDTO,
  PasswordChangeDTO,
  UserFilterDTO,
  UserDTO,
  CredentialsDTO,
  SessionUserDTO,
  AuthResultDTO
};
