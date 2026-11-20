import { api } from './api.js';
import { mountLocationPicker } from './locationPicker.js';
import { passwordField, resetPasswordVisibility } from './passwordFields.js';

const roleNames = {
  donor: 'Donor',
  recipient: 'Patient',
  hospital: 'Hospital',
  admin: 'Admin'
};
const phonePattern = /^\+?[0-9 ()-]{6,20}$/;

export function mountProfile(
  root,
  escapeHtml,
  onSessionExpired,
  onProfileSaved,
  onPasswordBusy
) {
  root.classList.add('profile-page');
  root.innerHTML = `
<header class="donor-heading">
  <div class="eyebrow">Your LifeLink account</div>
  <h1>My account</h1>
  <p class="mute">Keep your details current and your account secure.</p>
</header>
<p class="profile-load" data-profile-load role="status">Loading your account…</p>
<div data-profile-content hidden>
  <section class="profile-summary" aria-label="Account details">
    <span class="profile-avatar" data-profile-avatar aria-hidden="true"></span>
    <div class="profile-identity">
      <h2 data-profile-name></h2>
      <p data-profile-email></p>
      <span class="pill" data-profile-role></span>
    </div>
    <div class="profile-blood" data-profile-blood hidden>
      <span>Your blood type</span><b data-profile-blood-type></b>
    </div>
  </section>
  <section class="profile-section" aria-labelledby="profile-details-title">
    <div class="profile-section-heading">
      <h2 id="profile-details-title">Personal details</h2>
      <p>Your email, account role and blood type are read-only here.</p>
    </div>
    <form class="card profile-form" data-profile-form>
      <div class="profile-fields">
        <label
          >Full name<input
            name="full_name"
            autocomplete="name"
            minlength="2"
            maxlength="100"
            required /></label
        ><label
          >City<input
            name="city"
            autocomplete="address-level2"
            minlength="2"
            maxlength="60"
            placeholder="Add your city" /></label
        ><label
          >Phone (optional)<input
            name="phone"
            type="tel"
            autocomplete="tel"
            maxlength="20"
            placeholder="+961 3 123 456"
        /></label>
      </div>
      <p class="profile-hint">You can remove your phone number by leaving it blank.</p>
      <div class="profile-availability" data-profile-availability hidden>
        <label class="profile-checkbox"
          ><input type="checkbox" name="is_available" /><span
            >Available for blood donation</span
          ></label
        >
        <p>
          Pause donor matching and invitations when you are unavailable. The donation
          waiting period still applies.
        </p>
      </div>
      <div data-profile-hospital-location hidden></div>
      <details class="profile-location" data-profile-coordinates>
        <summary>Location for matching (optional)</summary>
        <p>
          Coordinates help sort donor matches by distance. Fill both, or leave both blank.
          This optional donor location is never shown on the request map.
        </p>
        <div class="profile-fields">
          <label
            >Latitude<input
              name="latitude"
              type="number"
              step="any"
              min="-90"
              max="90" /></label
          ><label
            >Longitude<input
              name="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
          /></label>
        </div>
      </details>
      <div class="profile-actions">
        <button class="btn" type="submit" data-profile-save>Save changes</button
        ><button class="btn ghost" type="button" data-profile-discard>
          Discard changes
        </button>
      </div>
      <p class="profile-feedback" data-profile-feedback role="status" hidden></p>
    </form>
  </section>
  <section class="profile-section profile-security" aria-labelledby="profile-password-title">
    <div class="profile-section-heading">
      <h2 id="profile-password-title">Password &amp; sign-in</h2>
      <p>
        Updating your password keeps this device signed in and signs out your other
        sessions.
      </p>
    </div>
    <button class="btn ghost" type="button" data-password-open aria-expanded="false">Change password</button>
    <form class="card profile-form" data-password-form hidden>
      ${passwordField('Current password', 'current_password', 'autocomplete="current-password" maxlength="128" required')}
      <div class="profile-fields">
        ${passwordField('New password', 'new_password', 'autocomplete="new-password" minlength="8" maxlength="128" required')}
        ${passwordField('Confirm new password', 'confirm_password', 'autocomplete="new-password" minlength="8" maxlength="128" required')}
      </div>
      <p class="profile-hint">
        Use 8–128 characters and choose a password different from your current one.
      </p>
      <div class="profile-actions">
        <button class="btn" type="submit" data-password-save>Update password</button><button class="btn ghost" type="button" data-password-cancel>Cancel</button>
      </div>
      <p class="profile-feedback" data-password-feedback role="status" hidden></p>
    </form>
  </section>
</div>
`;

  const content = root.querySelector('[data-profile-content]');
  const loading = root.querySelector('[data-profile-load]');
  const form = root.querySelector('[data-profile-form]');
  const passwordForm = root.querySelector('[data-password-form]');
  const feedback = root.querySelector('[data-profile-feedback]');
  const passwordFeedback = root.querySelector('[data-password-feedback]');
  const save = root.querySelector('[data-profile-save]');
  const passwordSave = root.querySelector('[data-password-save]');
  let profile;
  let locationPicker;
  let busy = false;
  let disposed = false;

  function setBusy(value, action = '') {
    busy = value;
    root.querySelectorAll('input, button').forEach((control) => {
      control.disabled = value;
    });
    form.setAttribute('aria-busy', String(value && action === 'profile'));
    passwordForm.setAttribute('aria-busy', String(value && action === 'password'));
    save.textContent = value && action === 'profile' ? 'Saving…' : 'Save changes';
    passwordSave.textContent =
      value && action === 'password' ? 'Updating…' : 'Update password';
  }

  function showFeedback(element, message, error = false) {
    element.textContent = message;
    element.hidden = false;
    element.classList.toggle('donor-error', error);
    element.setAttribute('role', error ? 'alert' : 'status');
  }

  function clearValidation(targetForm) {
    targetForm.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
  }

  function fieldError(input, message) {
    input.setCustomValidity(message);
    const details = input.closest('details');
    if (details) {
      details.open = true;
    }
    input.reportValidity();
    return null;
  }

  function fillProfile(updated) {
    profile = updated;
    form.elements.full_name.closest('label').firstChild.textContent =
      updated.role === 'hospital' ? 'Hospital or clinic name' : 'Full name';
    if (updated.role === 'hospital' && !locationPicker) {
      root.querySelector('[data-profile-coordinates]').remove();
      const location = root.querySelector('[data-profile-hospital-location]');
      location.hidden = false;
      locationPicker = mountLocationPicker(location, form, {
        required: true,
        showCoordinates: false,
        title: 'Hospital location',
        description:
          'New requests use this saved pin. Existing requests keep their own hospital location.'
      });
    }
    if (updated.role !== 'hospital')
      root.querySelector('[data-profile-coordinates]').hidden = !updated.donor;
    root.querySelector('[data-profile-avatar]').textContent = updated.full_name
      .charAt(0)
      .toUpperCase();
    root.querySelector('[data-profile-name]').textContent = updated.full_name;
    root.querySelector('[data-profile-email]').textContent = updated.email;
    root.querySelector('[data-profile-role]').textContent = roleNames[updated.role];
    root.querySelector('[data-profile-blood]').hidden = !updated.donor;
    root.querySelector('[data-profile-blood-type]').textContent =
      updated.donor?.blood_type || '';
    root.querySelector('[data-profile-availability]').hidden = !updated.donor;
    for (const name of ['full_name', 'phone', 'city', 'latitude', 'longitude']) {
      form.elements[name].value = updated[name] ?? '';
    }
    locationPicker?.setLocation(
      updated.latitude != null && updated.longitude != null
        ? [updated.latitude, updated.longitude]
        : null,
      true
    );
    form.elements.is_available.checked = updated.donor?.is_available === true;
    clearValidation(form);
  }

  function changesFromForm() {
    clearValidation(form);
    const changes = {};
    const name = form.elements.full_name.value.trim();
    if (name.length < 2) {
      return fieldError(
        form.elements.full_name,
        'Enter a name with at least two characters.'
      );
    }
    if (name !== profile.full_name) {
      changes.full_name = name;
    }
    const city = form.elements.city.value.trim();
    if (city !== (profile.city || '')) {
      if (city.length < 2) {
        return fieldError(
          form.elements.city,
          'Enter a city with at least two characters.'
        );
      }
      changes.city = city;
    }
    const phone = form.elements.phone.value.trim();
    if (phone && !phonePattern.test(phone)) {
      return fieldError(
        form.elements.phone,
        'Enter a phone number such as +961 3 123 456.'
      );
    }
    if (phone !== (profile.phone || '')) {
      changes.phone = phone || null;
    }
    const latitude = form.elements.latitude.value;
    const longitude = form.elements.longitude.value;
    if ((latitude === '') !== (longitude === '')) {
      return fieldError(
        latitude === '' ? form.elements.latitude : form.elements.longitude,
        'Fill both coordinates, or clear both.'
      );
    }
    const nextLatitude = latitude === '' ? null : Number(latitude);
    const nextLongitude = longitude === '' ? null : Number(longitude);
    if (nextLatitude !== profile.latitude || nextLongitude !== profile.longitude) {
      changes.latitude = nextLatitude;
      changes.longitude = nextLongitude;
    }
    if (
      profile.donor &&
      form.elements.is_available.checked !== profile.donor.is_available
    ) {
      changes.is_available = form.elements.is_available.checked;
    }
    return changes;
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (busy || !profile) {
      return;
    }
    const changes = changesFromForm();
    if (!changes) {
      return;
    }
    if (!Object.keys(changes).length) {
      showFeedback(feedback, 'Your details are already up to date.');
      return;
    }
    setBusy(true, 'profile');
    feedback.hidden = true;
    try {
      const updated = await api('/users/me', { method: 'PATCH', body: changes });
      if (disposed) {
        return;
      }
      fillProfile(updated);
      onProfileSaved(updated);
      showFeedback(feedback, 'Your profile changes were saved.');
    } catch (error) {
      if (disposed) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
      } else {
        showFeedback(
          feedback,
          !error.status || error.status >= 500
            ? 'We couldn’t confirm the save. Refresh to check your latest details before retrying.'
            : error.message,
          true
        );
      }
    } finally {
      if (!disposed) {
        setBusy(false);
      }
    }
  }

  function hidePasswords() {
    resetPasswordVisibility(passwordForm);
  }

  async function changePassword(event) {
    event.preventDefault();
    if (busy) {
      return;
    }
    clearValidation(passwordForm);
    const current = passwordForm.elements.current_password.value;
    const next = passwordForm.elements.new_password.value;
    if (next !== passwordForm.elements.confirm_password.value) {
      fieldError(
        passwordForm.elements.confirm_password,
        'The new passwords do not match.'
      );
      return;
    }
    if (current === next) {
      fieldError(
        passwordForm.elements.new_password,
        'Choose a password different from your current one.'
      );
      return;
    }
    setBusy(true, 'password');
    onPasswordBusy(true);
    passwordFeedback.hidden = true;
    try {
      await api('/users/me/password', {
        method: 'PATCH',
        body: { current_password: current, new_password: next }
      });
      if (disposed) {
        return;
      }
      passwordForm.reset();
      hidePasswords();
      showFeedback(
        passwordFeedback,
        'Password updated. This device stays signed in; your other sessions must sign in again.'
      );
    } catch (error) {
      if (disposed) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
      } else if (!error.status || error.status >= 500) {
        showFeedback(
          passwordFeedback,
          'We couldn’t confirm the password change. If you need to sign in again, try the new password before retrying.',
          true
        );
      } else {
        showFeedback(
          passwordFeedback,
          error.message.startsWith('current_password:')
            ? 'Your current password is not correct.'
            : error.message,
          true
        );
      }
    } finally {
      onPasswordBusy(false);
      if (!disposed) {
        setBusy(false);
      }
    }
  }

  function input(event) {
    const targetForm = event.target.closest('form');
    if (!targetForm) {
      return;
    }
    clearValidation(targetForm);
    (targetForm === form ? feedback : passwordFeedback).hidden = true;
  }

  function invalid(event) {
    const details = event.target.closest('details');
    if (details) {
      details.open = true;
    }
  }

  function click(event) {
    if (busy) {
      return;
    }
    const opener = root.querySelector('[data-password-open]');
    if (event.target.closest('[data-password-open]')) {
      passwordForm.hidden = false;
      opener.hidden = true;
      opener.setAttribute('aria-expanded', 'true');
      passwordForm.elements.current_password.focus();
    }
    if (event.target.closest('[data-password-cancel]')) {
      passwordForm.reset();
      hidePasswords();
      passwordFeedback.hidden = true;
      passwordForm.hidden = true;
      opener.hidden = false;
      opener.setAttribute('aria-expanded', 'false');
    }
    if (event.target.closest('[data-profile-discard]')) {
      fillProfile(profile);
      feedback.hidden = true;
    }
  }

  async function load() {
    setBusy(true);
    try {
      const updated = await api('/auth/me');
      if (disposed) {
        return;
      }
      fillProfile(updated);
      onProfileSaved(updated);
      content.hidden = false;
      loading.hidden = true;
      setBusy(false);
    } catch (error) {
      if (disposed) {
        return;
      }
      if (error.status === 401) {
        onSessionExpired();
        return;
      }
      loading.innerHTML = `<span role="alert">${escapeHtml(error.message)} Use the refresh icon above to load your account again.</span>`;
    }
  }
  form.addEventListener('submit', saveProfile);
  passwordForm.addEventListener('submit', changePassword);
  root.addEventListener('input', input);
  root.addEventListener('invalid', invalid, true);
  root.addEventListener('click', click);
  load();
  return () => {
    disposed = true;
    locationPicker?.dispose();
    passwordForm.reset();
    form.removeEventListener('submit', saveProfile);
    passwordForm.removeEventListener('submit', changePassword);
    root.removeEventListener('input', input);
    root.removeEventListener('invalid', invalid, true);
    root.removeEventListener('click', click);
  };
}
