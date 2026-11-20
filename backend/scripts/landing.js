// Community home: real totals and links to each role's workspace.
const number = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );

const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
  pill: '<path d="m9 4-5 5a6.4 6.4 0 0 0 9 9l5-5a6.4 6.4 0 0 0-9-9Z"/><path d="m7 7 10 10"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1C-1 10 7 17 12 21c5-4 13-11 8-16Z"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  person: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>',
  document: '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>'
};

function icon(name, className = '') {
  return `<svg class="home-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function stockCards(stock) {
  if (!Array.isArray(stock) || !stock.length) {
    return '<p class="home-unavailable">Blood stock is temporarily unavailable. You can still sign in to donate or request support.</p>';
  }
  const maximum = Math.max(20, ...stock.map((item) => Number(item.units_available) || 0));
  return `<div class="home-stock-grid">${stock
    .map((item) => {
      const units = Math.max(0, Number(item.units_available) || 0);
      let level = 'available';
      let label = 'Available';
      if (units < 3) {
        level = 'low';
        label = 'Low stock';
      } else if (units < 8) {
        level = 'limited';
        label = 'Limited';
      }
      const width = Math.min(100, (units / maximum) * 100);
      return `<article class="home-stock-item ${level}">
      <div class="home-stock-top"><strong>${escapeHtml(item.blood_type)}</strong>${icon('drop')}</div>
      <p><b>${number(units)}</b> <span>units available</span></p>
      <div class="home-stock-meter" aria-hidden="true"><span style="width:${width}%"></span></div>
      <span class="home-stock-state"><i></i>${label}</span>
    </article>`;
    })
    .join('')}</div>`;
}

function impactStats(stats) {
  const items = [
    ['blood_donations', 'Blood donations completed'],
    ['medicines', 'Medicine units donated'],
    ['donors', 'Registered donors'],
    ['fulfilled', 'Blood requests fulfilled']
  ];
  return items
    .map(
      ([key, label]) =>
        `<div class="home-impact-item"><b>${stats ? number(stats[key]) : '—'}</b><span>${label}</span></div>`
    )
    .join('');
}

function workspaceLinks(user) {
  if (!user) {
    return { blood: '#/register', medicine: '#/register', map: '#/login' };
  }
  if (user.role === 'donor') {
    return { blood: '#/donor', medicine: '#/donor-medicines', map: '#/map' };
  }
  if (user.role === 'admin') {
    return { blood: '#/admin', medicine: '#/admin-medicines', map: '#/map' };
  }
  return { blood: '#/requests', medicine: '#/medicines', map: '#/map' };
}

export function landing(stats, user) {
  const links = workspaceLinks(user);
  const joinLink = user ? '#/overview' : '#/register';
  return `<div class="community-home">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-copy">
        <p class="home-kicker"><span></span> A community of care. Across Lebanon.</p>
        <h1 id="home-title">Connecting Blood Donors.<br>Supporting Patients.<br><em>Saving Lives.</em></h1>
        <p class="home-intro">Give blood. Share medicine. Help care reach the people who need it, one connection at a time.</p>
        <div class="home-actions"><a class="home-button" href="${joinLink}">${user ? 'Open my workspace' : 'Be part of the good'}${icon('arrow')}</a><button class="home-text-button" type="button" data-home-target="home-how">See how it works <span aria-hidden="true">↘</span></button></div>
        <div class="home-hero-note">${icon('shield')}<span>Real people. Reviewed donations. Care that connects.</span></div>
      </div>
      <div class="home-art home-network" role="img" aria-label="LifeLink connects blood donors, patients and medical assistance through one central blood drop.">
        <div class="home-art-grid"></div>
        <div class="net-node net-node-top" data-node="medical"><span class="net-badge">${icon('document')}</span><b>Medical assistance</b><small>Documents, evidence and healthcare support</small></div>
        <div class="net-node" data-node="donors"><span class="net-badge">${icon('heart')}</span><b>Blood donors</b><small>People willing to donate blood</small></div>
        <div class="net-node" data-node="patients"><span class="net-badge">${icon('person')}</span><b>Patients</b><small>People requesting blood donations</small></div>
        <div class="net-logo">${icon('drop')}<span>LifeLink</span></div>
      </div>
    </section>

    <section class="home-impact" aria-label="LifeLink community impact"><div class="home-impact-caption"><span class="home-kicker">THE GOOD WE DO</span><p>Small actions.<br>Real impact.</p></div>${impactStats(stats)}${stats ? '' : '<p class="home-impact-unavailable" role="status">Community totals are temporarily unavailable.</p>'}</section>

    <section class="home-section home-ways" aria-labelledby="home-ways-title">
      <div class="home-section-heading"><div><p class="home-kicker">MORE THAN ONE WAY TO HELP</p><h2 id="home-ways-title">Your kindness.<br><em>Their next chapter.</em></h2></div><p>Something you can give could mean everything to someone else. Find your way to make a difference.</p></div>
      <div class="home-ways-grid">
        <article class="home-way home-way-blood"><div class="home-way-top"><span>01 / GIVE BLOOD</span>${icon('drop')}</div><h3>A part of you.<br>A world of possibility.</h3><p>Offer to donate blood to an open request or the blood bank. LifeLink checks compatibility and your donation waiting period.</p><a class="home-card-link" href="${links.blood}">${user ? 'Open blood workspace' : 'Start with a blood donation'}${icon('arrow')}</a><span class="home-way-watermark" aria-hidden="true">${icon('drop')}</span></article>
        <article class="home-way home-way-medicine"><div class="home-way-top"><span>02 / SHARE MEDICINE</span>${icon('pill')}</div><h3>More care.<br>Less left unused.</h3><p>Submit a medicine donation for review. Admins check the batch before it becomes available for patients and hospitals to request.</p><a class="home-card-link" href="${links.medicine}">${user ? 'Open medicine workspace' : 'Give medicine a new purpose'}${icon('arrow')}</a><span class="home-way-watermark" aria-hidden="true">${icon('pill')}</span></article>
      </div>
    </section>

    <section class="home-process home-section" id="home-how" aria-labelledby="home-how-title">
      <div class="home-section-heading"><div><p class="home-kicker">A SIMPLE START</p><h2 id="home-how-title">Good intentions.<br><em>A clear next step.</em></h2></div><a class="home-inline-link" href="${joinLink}">${user ? 'Back to my workspace' : 'Create your account'}${icon('arrow')}</a></div>
      <ol class="home-steps"><li><span class="home-step-number">01</span><h3>Find your place.</h3><p>Join as a donor, patient or hospital. Your workspace brings the right actions together.</p></li><li><span class="home-step-number">02</span><h3>Make a connection.</h3><p>Offer blood, submit medicine for review, or create a request for the support you need.</p></li><li><span class="home-step-number">03</span><h3>Follow it through.</h3><p>Track reviews and offers. Admins record blood collection and medicine handoffs when they happen.</p></li></ol>
    </section>

    <section class="home-stock-section home-section" id="home-stock" aria-labelledby="home-stock-title">
      <div class="home-section-heading"><div><p class="home-kicker"><span></span> FROM THE LIFELINK BLOOD BANK</p><h2 id="home-stock-title">Every type matters.<br><em>Including yours.</em></h2></div><div><p>See the units currently recorded in our blood bank. A donation today can help replenish tomorrow’s supply.</p><span class="home-stock-key"><i></i>Low: 0–2 <i></i>Limited: 3–7 <i></i>Available: 8+</span></div></div>
      ${stockCards(stats?.stock)}
      <div class="home-stock-footer"><span>Stock reflects recorded units. Requests are reviewed by an admin.</span><a class="home-inline-link" href="${links.blood}">${user ? 'Go to blood workspace' : 'Join as a donor'}${icon('arrow')}</a></div>
    </section>

    <section class="home-section home-together" aria-labelledby="home-together-title"><div class="home-together-copy"><p class="home-kicker">CARE HAS A PLACE FOR EVERYONE</p><h2 id="home-together-title">Different needs.<br><em>One community.</em></h2><p>From the person offering a donation to the hospital coordinating care, LifeLink keeps the next step within reach.</p><a class="home-inline-link" href="${links.map}">${user ? 'Explore the request map' : 'Log in to explore the request map'}${icon('arrow')}</a></div><div class="home-roles"><article><span>01</span><div><h3>Here to give?</h3><p>Find compatible blood requests and share medicine for review.</p></div>${icon('heart')}</article><article><span>02</span><div><h3>Here for support?</h3><p>Create blood or medicine requests and follow their progress.</p></div>${icon('plus')}</article><article><span>03</span><div><h3>Coordinating care?</h3><p>Hospitals can manage requests and select their location on the map.</p></div>${icon('pin')}</article></div></section>

    <section class="home-section home-faq" aria-labelledby="home-faq-title"><div><p class="home-kicker">A FEW THINGS TO KNOW</p><h2 id="home-faq-title">Care starts<br>with <em>clarity.</em></h2><p>Know what to expect before you take the first step.</p></div><div class="home-questions"><details><summary>Does an accepted blood offer mean I have donated?<span aria-hidden="true">+</span></summary><p>No. Acceptance is the first step. An admin records completion after the blood has actually been collected.</p></details><details><summary>Can I donate any medicine?<span aria-hidden="true">+</span></summary><p>You can submit a batch with its quantity and expiry date. An admin reviews it before it becomes available. Expired batches cannot be dispensed.</p></details><details><summary>How do I know when I can give blood again?<span aria-hidden="true">+</span></summary><p>Your donor workspace shows your eligibility. LifeLink enforces a 56-day waiting period after a completed blood donation.</p></details><details><summary>Will my personal information be shown publicly?<span aria-hidden="true">+</span></summary><p>Community totals do not show donor names. The request map shows hospital locations attached to open requests, not donors’ home locations.</p></details></div></section>

    <section class="home-closing"><span class="home-closing-mark" aria-hidden="true">${icon('heart')}</span><p class="home-kicker">THE NEXT CONNECTION COULD BE YOU</p><h2>A little kindness.<br><em>A lasting difference.</em></h2><a class="home-button" href="${joinLink}">${user ? 'Continue in my workspace' : 'Join the LifeLink community'}${icon('arrow')}</a><p>Give blood. Share medicine. Show up for someone.</p></section>
    <div class="home-signoff"><span>MADE FOR CONNECTION. BUILT FOR LEBANON.</span><span>LifeLink <span aria-hidden="true">↗</span></span></div>
  </div>`;
}
