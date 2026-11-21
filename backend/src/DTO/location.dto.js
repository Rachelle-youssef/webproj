'use strict';

class HospitalSearchDTO {
  constructor({ name, city }) {
    this.name = name;
    this.city = city;
  }
}

class HospitalLocationDTO {
  constructor(place) {
    this.name = place.name || place.display_name;
    this.address = place.display_name;
    this.latitude = Number(place.lat);
    this.longitude = Number(place.lon);
  }
}

module.exports = { HospitalSearchDTO, HospitalLocationDTO };
