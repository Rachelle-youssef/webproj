import { api } from './api.js';

export async function mountOverview(root, user, escapeHtml, onSessionExpired) {
  const donor = user.role === 'donor';
  const admin = user.role === 'admin';
  let actions;
  if (admin) {
    actions = [
      [
        'blood',
        'Blood coordination',
        'Review requests, accept offers and confirm collection.',
        'admin',
        'Manage blood'
      ],
      [
        'medicine',
        'Medicine review',
        'Review batches and record medicine handed out.',
        'admin-medicines',
        'Manage medicines'
      ]
    ];
  } else if (donor) {
    actions = [
      [
        'blood',
        'Give blood',
        'Find compatible requests and track your donation from offer to collection.',
        'donor',
        'Open blood donations'
      ],
      [
        'medicine',
        'Share medicine',
        'Submit a medicine batch and follow its review.',
        'donor-medicines',
        'Open medicine donations'
      ]
    ];
  } else {
    actions = [
      [
        'blood',
        'Request blood',
        'Send your hospital request and follow the units received.',
        'requests',
        'Open blood requests'
      ],
      [
        'medicine',
        'Find medicine',
        'Browse available batches and follow your medicine requests.',
        'medicines',
        'Open medicines'
      ]
    ];
  }
  let introduction;
  if (admin) {
    introduction = 'Keep each donation moving toward the person who needs it.';
  } else if (donor) {
    introduction = 'Your next connection could help someone move forward.';
  } else {
    introduction = 'Keep your blood and medicine requests together, one step at a time.';
  }
  root.innerHTML = `<header class="overview-heading">
    <div><div class="eyebrow">Your LifeLink overview</div><h1>Hello, ${escapeHtml(user.full_name.split(' ')[0])}.</h1>
      <p>${introduction}</p></div>
    ${donor ? `<div class="blood-pass"><span>Your blood type</span><strong>${escapeHtml(user.donor?.blood_type || 'Unknown')}</strong></div>` : ''}
    </header>
    <section aria-labelledby="next-title"><div class="section-heading"><h2 id="next-title">Your next steps</h2><span class="mute">Connected to your account</span></div>
      <div data-overview-tasks class="overview-tasks" aria-live="polite"><p role="status">Loading your activity…</p></div></section>
    <section aria-labelledby="paths-title"><h2 id="paths-title">${admin ? 'Coordinate care' : 'Choose your path'}</h2>
      <div class="path-grid">${actions
        .map(
          ([
            kind,
            title,
            description,
            route,
            label
          ]) => `<article class="path-card ${kind}">
        <span class="path-symbol" aria-hidden="true">${kind === 'blood' ? '01' : '02'}</span>
        <h3>${title}</h3><p>${description}</p><a class="path-link" href="#/${route}">${label}<span aria-hidden="true">↗</span></a>
      </article>`
        )
        .join('')}</div></section>
    <section class="journey-note"><div class="eyebrow">From connection to care</div>
      <h2>Follow each step.</h2><p>Blood offers move through admin acceptance and collection. Medicine batches are reviewed before they become available. Open Blood or Medicines to see the details for your account.</p>
      <div class="journey-line" aria-label="Donation process"><span>Offer or request</span><span>Admin review</span><span>Collection or handoff</span></div></section>`;
  const tasks = root.querySelector('[data-overview-tasks]');
  async function count(path) {
    const response = await api(path + '&limit=1&page=1', { includeMeta: true });
    return response.meta.total;
  }
  let definitions;
  if (admin) {
    definitions = [
      {
        label: 'Blood requests in review',
        key: 'pending_requests',
        route: 'admin',
        detail: 'Review submitted requests'
      },
      {
        label: 'Blood offers to accept',
        key: 'pending_donations',
        route: 'admin?queue=offers',
        detail: 'Arrange the next collection'
      },
      {
        label: 'Awaiting blood collection',
        key: 'accepted_donations',
        route: 'admin?queue=collections',
        detail: 'Confirm after collection'
      },
      {
        label: 'Medicine batches in review',
        key: 'pending_medicines',
        route: 'admin-medicines',
        detail: 'Review batch details'
      },
      {
        label: 'Medicine requests in review',
        key: 'pending_medicine_requests',
        route: 'admin-medicines?queue=medicine',
        detail: 'Record medicine handoff'
      }
    ];
  } else if (donor) {
    definitions = [
      {
        label: 'Blood eligibility',
        route: 'donor',
        read: () => api('/blood-donations/eligibility'),
        display: (value) =>
          value.eligible
            ? 'Eligible to offer'
            : `${Number(value.days_remaining)} days remaining`,
        detail: 'Check your next donation date'
      },
      {
        label: 'Invitations to answer',
        route: 'donor',
        read: () => count('/blood-donations?status=invited'),
        detail: 'Review your blood invitations'
      },
      {
        label: 'Accepted blood offers',
        route: 'donor',
        read: () => count('/blood-donations?status=accepted'),
        detail: 'Awaiting collection'
      },
      {
        label: 'Medicine batches in review',
        route: 'donor-medicines',
        read: () => count('/medicines?status=pending'),
        detail: 'Follow the admin decision'
      }
    ];
  } else {
    definitions = [
      {
        label: 'Blood requests in review',
        route: 'requests',
        read: () => count('/blood-requests?status=pending'),
        detail: 'Awaiting an admin decision'
      },
      {
        label: 'Open blood requests',
        route: 'requests',
        read: () => count('/blood-requests?status=open'),
        detail: 'Follow units received'
      },
      {
        label: 'Medicine requests in review',
        route: 'medicines',
        read: () => count('/medicine-requests?status=pending'),
        detail: 'Awaiting medicine handoff'
      }
    ];
  }
  try {
    let results;
    if (admin) {
      const stats = await api('/admin/stats');
      results = [];
      for (const item of definitions) {
        results.push({ status: 'fulfilled', value: stats[item.key] });
      }
    } else {
      // Keep the calls parallel and show the other cards if one request fails.
      const requests = [];
      for (const item of definitions) {
        requests.push(item.read());
      }
      results = await Promise.allSettled(requests);
    }
    if (!root.isConnected) {
      return;
    }
    if (
      results.some(
        (result) => result.status === 'rejected' && result.reason.status === 401
      )
    ) {
      onSessionExpired();
      return;
    }
    tasks.innerHTML = definitions
      .map((item, index) => {
        const result = results[index];
        const loaded = result.status === 'fulfilled';
        let value;
        if (loaded) {
          if (item.display) {
            value = item.display(result.value);
          } else {
            value = Number(result.value).toLocaleString();
          }
        } else {
          value = 'Unavailable';
        }
        return `<a class="task-card" href="#/${item.route}"><span>${item.label}</span><strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(loaded ? item.detail : result.reason.message)}</small><span class="task-arrow" aria-hidden="true">↗</span></a>`;
      })
      .join('');
  } catch (error) {
    if (!root.isConnected) {
      return;
    }
    if (error.status === 401) {
      onSessionExpired();
    } else {
      tasks.innerHTML = `<p class="empty" role="alert">${escapeHtml(error.message)}</p>`;
    }
  }
}
