// DTOs for blood requests, donations and stock.
'use strict';

// ---- Input DTOs: PL -> BLL ----
class BloodRequestInputDTO {
  constructor({
    blood_type_id,
    units_needed,
    urgency = 'normal',
    hospital_name,
    city = null,
    latitude = null,
    longitude = null
  }) {
    this.blood_type_id = blood_type_id;
    this.units_needed = units_needed;
    this.urgency = urgency;
    this.hospital_name = hospital_name;
    this.city = city;
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

class BloodRequestFilterDTO {
  constructor({ status, urgency, blood_type_id, city }) {
    this.status = status ?? null;
    this.urgency = urgency ?? null;
    this.bloodTypeId = blood_type_id ?? null;
    this.city = city || null;
  }
}

class ReviewDTO {
  constructor({ decision, note }) {
    this.decision = decision;
    this.note = note || null;
  }
}

class NoteDTO {
  constructor({ note }) {
    this.note = note || null;
  }
}

class RequestLocationDTO {
  constructor({ latitude, longitude }) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
}

class DispenseDTO {
  constructor({ blood_type_id, units, note }) {
    this.blood_type_id = blood_type_id;
    this.units = units;
    this.note = note || null;
  }
}

class DonationOfferDTO {
  constructor({ request_id }) {
    this.request_id = request_id ?? null;
  }
}

class InvitationDTO {
  constructor({ donor_id }) {
    this.donor_id = donor_id;
  }
}

class InvitationAnswerDTO {
  constructor({ accept }) {
    this.accept = accept;
  }
}

class DonationFilterDTO {
  constructor({ status, request_id }) {
    this.status = status ?? null;
    this.requestId = request_id ?? null;
  }
}

class StockAdjustmentDTO {
  constructor({ blood_type_id, change_units, note }) {
    this.blood_type_id = blood_type_id;
    this.change_units = change_units;
    this.note = note;
  }
}

class MovementFilterDTO {
  constructor({ blood_type_id, reason }) {
    this.bloodTypeId = blood_type_id ?? null;
    this.reason = reason ?? null;
  }
}

// ---- Output DTOs: DAL -> BLL -> PL ----

/** Full view of a request, for its owner and for admins. */
class BloodRequestDTO {
  constructor(row) {
    this.id = row.id;
    this.blood_type_id = row.blood_type_id;
    this.blood_type = row.blood_type;
    this.units_needed = row.units_needed;
    this.units_received = row.units_received;
    this.urgency = row.urgency;
    this.hospital_name = row.hospital_name;
    this.city = row.city;
    this.latitude = row.latitude;
    this.has_hospital_pin = Boolean(row.has_hospital_pin);
    this.longitude = row.longitude;
    this.status = row.status;
    this.admin_note = row.admin_note;
    this.created_at = row.created_at;
    this.reviewed_at = row.reviewed_at;
    this.requester = {
      id: row.requester_id,
      full_name: row.requester_name
    };
  }
}

/** What a donor sees: no requester identity, no admin notes, plus the donor's own answer if any. */
class OpenBloodRequestDTO {
  constructor(row) {
    this.id = row.id;
    this.blood_type_id = row.blood_type_id;
    this.blood_type = row.blood_type;
    this.units_needed = row.units_needed;
    this.units_received = row.units_received;
    this.urgency = row.urgency;
    this.hospital_name = row.hospital_name;
    this.city = row.city;
    this.latitude = row.latitude;
    this.has_hospital_pin = Boolean(row.has_hospital_pin);
    this.longitude = row.longitude;
    this.created_at = row.created_at;
    this.my_response = row.my_response ?? null;
    this.can_offer_again = Boolean(
      row.can_offer_again ||
        (row.my_response === 'cancelled' &&
          row.my_response_note === 'Withdrawn by the donor.' &&
          row.my_response_reviewer === null)
    );
  }
}

class DonationDTO {
  constructor(row) {
    this.id = row.id;
    this.status = row.status;
    this.can_offer_again =
      row.status === 'cancelled' &&
      row.admin_note === 'Withdrawn by the donor.' &&
      row.reviewed_by === null;
    this.admin_note = row.admin_note;
    this.created_at = row.created_at;
    this.accepted_at = row.accepted_at;
    this.reviewed_at = row.reviewed_at;
    this.donor = {
      id: row.donor_id,
      full_name: row.donor_name,
      blood_type: row.donor_blood_type
    };
    if (row.request_id === null) {
      this.request = null;
    } else {
      this.request = {
        id: row.request_id,
        hospital_name: row.request_hospital,
        city: row.request_city,
        blood_type: row.request_blood_type,
        urgency: row.request_urgency,
        status: row.request_status
      };
    }
  }
}

/** A donor who could give blood for a request (admins only). */
class MatchDTO {
  constructor(row) {
    this.donor_id = row.donor_id;
    this.full_name = row.full_name;
    this.blood_type = row.blood_type;
    this.city = row.city;
    this.distance_km = row.distance_km;
    this.last_donation_date = row.last_donation_date;
  }
}

class EligibilityDTO {
  constructor({
    eligible,
    last_donation_date,
    next_eligible_date,
    days_remaining,
    interval_days
  }) {
    this.eligible = eligible;
    this.last_donation_date = last_donation_date;
    this.next_eligible_date = next_eligible_date;
    this.days_remaining = days_remaining;
    this.interval_days = interval_days;
  }
}

class StockLevelDTO {
  constructor(row) {
    this.blood_type_id = row.blood_type_id;
    this.blood_type = row.blood_type;
    this.units_available = row.units_available;
    this.updated_at = row.updated_at;
  }
}

class StockMovementDTO {
  constructor(row) {
    this.id = row.id;
    this.blood_type = row.blood_type;
    this.change_units = row.change_units;
    this.reason = row.reason;
    this.donation_id = row.donation_id;
    this.request_id = row.request_id;
    this.created_by = row.created_by_name;
    this.note = row.note;
    this.created_at = row.created_at;
  }
}

class BloodTypeDTO {
  constructor(row) {
    this.id = row.id;
    this.label = row.label;
  }
}

module.exports = {
  BloodRequestInputDTO,
  BloodRequestFilterDTO,
  ReviewDTO,
  NoteDTO,
  RequestLocationDTO,
  DispenseDTO,
  DonationOfferDTO,
  InvitationDTO,
  InvitationAnswerDTO,
  DonationFilterDTO,
  StockAdjustmentDTO,
  MovementFilterDTO,
  BloodRequestDTO,
  OpenBloodRequestDTO,
  DonationDTO,
  MatchDTO,
  EligibilityDTO,
  StockLevelDTO,
  StockMovementDTO,
  BloodTypeDTO
};
