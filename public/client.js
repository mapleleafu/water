const publicVapidKey =
  'BCKSc8wkr2vgE8J75qCAefS59G9b04rPWXRNoDo_81plcl-qa-CysG4mp7eCgYgJbi3316_tzCWkPMyMeKbDRCo';

let goalReachedToday = false;
let allTimezones = [];

// --- Utils ---
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getHeaders() {
  return {
    'content-type': 'application/json',
    'x-api-key': localStorage.getItem('water-secret'),
  };
}

function showToast(
  message,
  type = 'info',
  clickable = false,
  onClick = null,
  duration = 3000,
) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  if (clickable && onClick) {
    toast.style.cursor = 'pointer';
    toast.onclick = onClick;
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), duration / 10);
  }, duration);
}

// --- Auth & State ---
function init() {
  const secret = localStorage.getItem('water-secret');
  const userId = localStorage.getItem('water-user-id');
  const userName = localStorage.getItem('water-user-name');

  if (!secret) {
    showSection('auth-section');
  } else if (!userId) {
    showSection('user-section');
    fetchUsers();
  } else {
    showSection('app-section');
    document.getElementById('welcome-msg').innerText = `Hello, ${userName}!`;

    checkAndSyncTimezone(true);
    startCountdown();
    fetchStats();
  }
}

function checkAndSyncTimezone(autoSync = false) {
  const storedTz = localStorage.getItem('water-timezone');
  const currentBrowserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (autoSync && storedTz && storedTz !== currentBrowserTz) {
    subscribeUser(currentBrowserTz, true).then(() => {
      showToast(
        `✅ Travel detected! Timezone synced to ${currentBrowserTz}. Click to update manually.`,
        'success',
        true,
        openTimezoneModal,
      );
      updateCurrentTimezoneLabel();
    });
  } else if (!autoSync) {
    subscribeUser(currentBrowserTz, true).then(() => {
      showToast(
        `✅ Timezone synced to ${currentBrowserTz}. Click to update manually.`,
        'success',
        true,
        openTimezoneModal,
      );
    });
    updateCurrentTimezoneLabel();
  } else {
    updateCurrentTimezoneLabel();
  }
}

function showSection(id) {
  ['auth-section', 'user-section', 'app-section'].forEach((s) =>
    document.getElementById(s).classList.add('hidden'),
  );
  document.getElementById(id).classList.remove('hidden');
}

async function saveSecret() {
  const secret = document.getElementById('secret-code').value;
  if (!secret) return;

  try {
    const res = await fetch('/validate-app-secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret }),
    });

    if (res.ok) {
      localStorage.setItem('water-secret', secret);
      init();
    } else {
      showToast('Invalid Secret Code. Please try again.', 'error');
    }
  } catch (err) {
    showToast('Server error. Please try again later.', 'error');
  }
}

function switchUser() {
  localStorage.removeItem('water-user-id');
  localStorage.removeItem('water-user-name');
  goalReachedToday = false;
  init();
}

// --- User Management ---
async function fetchUsers() {
  try {
    const res = await fetch('/users', { headers: getHeaders() });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('water-secret');
        init();
        return;
      }
      throw new Error('Auth failed');
    }
    const users = await res.json();

    const list = document.getElementById('user-list');
    list.innerHTML = '';

    users.forEach((user) => {
      const div = document.createElement('div');
      div.className = 'user-card';
      div.innerText = user.name;
      div.onclick = () => selectUser(user.id, user.name);
      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
  }
}

async function createUser() {
  const name = document.getElementById('new-username').value;
  if (!name) return showToast('Enter a name', 'error');

  try {
    const res = await fetch('/users', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });

    if (res.status === 409) {
      return showToast('Username already taken.', 'error');
    }

    if (!res.ok) throw new Error('Create user failed');
    const user = await res.json();
    selectUser(user.id, user.name);
  } catch (err) {
    showToast('Failed to create user', 'error');
  }
}

function selectUser(id, name) {
  localStorage.setItem('water-user-id', id);
  localStorage.setItem('water-user-name', name);
  init();
}

async function subscribeUser(customTimezone = null, silent = false) {
  if (!('serviceWorker' in navigator)) {
    if (!silent) showToast('No Service Worker support!', 'error');
    return;
  }

  try {
    const register = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    const subscription = await register.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });

    // Use custom timezone or fallback to stored or detected
    let timezone =
      customTimezone ||
      localStorage.getItem('water-timezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    const res = await fetch('/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        timezone: timezone,
        userId: localStorage.getItem('water-user-id'),
      }),
      headers: getHeaders(),
    });

    if (res.status === 404) {
      if (!silent)
        showToast(
          'User session expired. Please re-select your profile.',
          'error',
        );
      switchUser();
      return;
    }

    // Save preference if successful
    localStorage.setItem('water-timezone', timezone);
    updateCurrentTimezoneLabel();

    if (!silent) showToast('✅ Reminders enabled!', 'success');
  } catch (err) {
    console.error('Subscription failed', err);
    if (!silent) showToast('Failed to enable notifications.', 'error');
  }
}

async function logDrink() {
  const amount = parseInt(document.getElementById('drink-amount').value);
  const res = await fetch('/log-drink', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      userId: localStorage.getItem('water-user-id'),
      amount: amount,
    }),
  });

  if (res.ok) {
    showToast(`Logged ${amount}ml`, 'success');
    fetchStats();
  } else if (res.status === 404) {
    showToast('User not found. Please re-select.', 'error');
    switchUser();
  } else {
    showToast('Failed to log drink.', 'error');
  }
}

async function fetchStats() {
  const userId = localStorage.getItem('water-user-id');
  if (!userId) return;

  try {
    const res = await fetch(`/stats/${userId}`, { headers: getHeaders() });
    if (res.status === 404) {
      switchUser();
      return;
    }
    const data = await res.json();

    // 1. Today's Total & Glass
    document.getElementById('today-total').innerText = data.todayTotal;
    const fillPercent = Math.min((data.todayTotal / 2000) * 100, 100);
    document.getElementById('water-fill').style.height = `${fillPercent}%`;

    const statusEl = document.getElementById('goal-status');
    if (data.todayTotal >= 2000) {
      statusEl.innerText = 'Goal Reached! 🥳';
      statusEl.style.color = '#28a745';
      if (!goalReachedToday) {
        triggerConfetti();
        goalReachedToday = true;
      }
    } else {
      statusEl.innerText = `${2000 - data.todayTotal}ml to go!`;
      statusEl.style.color = '#94a3b8';
      goalReachedToday = false;
    }

    // 2. Weekly Graph
    const graphContainer = document.getElementById('weekly-graph');
    graphContainer.innerHTML = '';

    const max = Math.max(...data.history.map((d) => d.amount), 2000);

    data.history.forEach((day) => {
      const bar = document.createElement('div');
      bar.className = 'graph-bar';
      bar.style.height = '100%';

      const fill = document.createElement('div');
      fill.className = 'graph-bar-fill';
      const height = (day.amount / max) * 100;
      fill.style.height = `${height}%`;
      if (day.amount >= 2000) fill.style.background = '#28a745';

      bar.appendChild(fill);
      graphContainer.appendChild(bar);
    });
  } catch (err) {
    console.error('Stats fetch failed', err);
  }
}

// --- Timezone Management ---
function renderTimezoneOptions(list) {
  const select = document.getElementById('timezone-select');
  const noResults = document.getElementById('no-tz-results');
  select.innerHTML = '';

  if (list.length === 0) {
    select.classList.add('hidden');
    noResults.classList.remove('hidden');
    return;
  }

  select.classList.remove('hidden');
  noResults.classList.add('hidden');

  const current =
    localStorage.getItem('water-timezone') ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  list.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.innerText = tz.replace(/_/g, ' ');
    if (tz === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function filterTimezones() {
  const query = document.getElementById('timezone-search').value.toLowerCase();
  const filtered = allTimezones.filter((tz) =>
    tz.toLowerCase().includes(query),
  );
  renderTimezoneOptions(filtered);
}

function openTimezoneModal() {
  const modal = document.getElementById('timezone-modal');
  modal.classList.remove('hidden');

  document.getElementById('timezone-search').value = '';

  if (allTimezones.length === 0) {
    let timezones = [];
    try {
      timezones = Intl.supportedValuesOf('timeZone');
    } catch (e) {
      console.warn('Intl not supported, using fallback');
    }

    if (!timezones || timezones.length === 0) {
      timezones = [
        'UTC',
        'America/New_York',
        'America/Los_Angeles',
        'America/Chicago',
        'America/Toronto',
        'America/Sao_Paulo',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Europe/Madrid',
        'Europe/Istanbul',
        'Europe/Moscow',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Dubai',
        'Asia/Kolkata',
        'Australia/Sydney',
        'Pacific/Auckland',
      ];
    }
    allTimezones = timezones;
  }

  renderTimezoneOptions(allTimezones);
}

function closeTimezoneModal() {
  document.getElementById('timezone-modal').classList.add('hidden');
}

async function saveTimezone() {
  const select = document.getElementById('timezone-select');
  const newTz = select.value;
  if (!newTz) return;

  closeTimezoneModal();
  await subscribeUser(newTz, true).then(() => {
    showToast(`✅ Timezone updated to ${newTz}`, 'success');
  });
}

function updateCurrentTimezoneLabel() {
  const current =
    localStorage.getItem('water-timezone') ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const label = document.getElementById('current-timezone-label');
  if (label) {
    const short = current.split('/').pop().replace(/_/g, ' ');
    label.innerText = short;
  }
}

function startCountdown() {
  function update() {
    const now = new Date();
    const currentHour = now.getHours();

    let nextDate = new Date(now);
    nextDate.setMinutes(0);
    nextDate.setSeconds(0);
    nextDate.setMilliseconds(0);

    let nextHour = currentHour + (currentHour % 2 === 0 ? 2 : 1);

    if (currentHour % 2 === 0 && now.getMinutes() > 0) {
      // nextHour is already +2
    }

    if (nextHour < 8) nextHour = 8;
    if (nextHour > 22) {
      nextHour = 8;
      nextDate.setDate(nextDate.getDate() + 1);
    }

    nextDate.setHours(nextHour);

    const diff = nextDate - now;

    if (diff <= 0) {
      document.getElementById('countdown-timer').innerText = "It's time!";
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('countdown-timer').innerText =
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  update();
  setInterval(update, 1000);
}

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let particles = [];
  const colors = ['#00d2ff', '#3a7bd5', '#28a745', '#ffc107', '#e83e8c'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * 150,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngleIncremental: Math.random() * 0.07 + 0.05,
      tiltAngle: 0,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.d);

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();

      if (p.y > canvas.height) {
        particles[i] = { ...p, y: -20, x: Math.random() * canvas.width };
      }
    });
  }

  let animationId = setInterval(draw, 20);
  setTimeout(() => {
    clearInterval(animationId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, 5000);
}

init();
