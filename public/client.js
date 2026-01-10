const publicVapidKey =
  'BCKSc8wkr2vgE8J75qCAefS59G9b04rPWXRNoDo_81plcl-qa-CysG4mp7eCgYgJbi3316_tzCWkPMyMeKbDRCo';

let goalReachedToday = false;
let allTimezones = [];
let weeklyChartInstance = null;
let hourlyChartInstance = null;

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
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// --- Auth & State ---
function init() {
  const secret = localStorage.getItem('water-secret');
  const userId = localStorage.getItem('water-user-id');
  const userName = localStorage.getItem('water-user-name');
  
  if (localStorage.getItem('water-theme') === 'light') {
    document.body.classList.add('light-mode');
  }

  if (!secret) {
    showSection('auth-section');
  } else if (!userId) {
    showSection('user-section');
    fetchUsers();
  } else {
    showSection('app-section');
    document.getElementById('welcome-msg').innerText = `Hey, ${userName}!`;

    checkAndSyncTimezone(true);
    startCountdown();
    fetchStats();
    populateQuietHourSelects();
  }
}

function populateQuietHourSelects() {
    const start = document.getElementById('quiet-start');
    const end = document.getElementById('quiet-end');
    if (!start || !end) return;
    
    start.innerHTML = '';
    end.innerHTML = '';
    
    for (let i = 0; i < 24; i++) {
        const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i-12} PM`;
        const optStart = new Option(label, i);
        const optEnd = new Option(label, i);
        start.add(optStart);
        end.add(optEnd);
    }
}

function checkAndSyncTimezone(autoSync = false) {
  const storedTz = localStorage.getItem('water-timezone');
  const currentBrowserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (autoSync && storedTz && storedTz !== currentBrowserTz) {
    subscribeUser(currentBrowserTz, true).then(() => {
      showToast(
        `✅ Timezone updated to ${currentBrowserTz}.`,
        'success',
        true,
        openSettingsModal,
      );
    });
  }
}

function showSection(id) {
  ['auth-section', 'user-section', 'app-section'].forEach((s) =>
    document.getElementById(s).classList.add('hidden'),
  );
  document.getElementById(id).classList.remove('hidden');
}

function toggleDarkMode() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('water-theme', isLight ? 'light' : 'dark');
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
      showToast('Invalid Secret Code.', 'error');
    }
  } catch (err) {
    showToast('Server error.', 'error');
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
      div.className = 'user-card card';
      div.style.cursor = 'pointer';
      div.style.margin = '0';
      div.innerText = user.name;
      div.onclick = () => selectUser(user.id, user.name);
      list.appendChild(div);
    });
  } catch (err) { console.error(err); }
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
    if (res.status === 409) return showToast('Username taken.', 'error');
    if (!res.ok) throw new Error('Failed');
    const user = await res.json();
    selectUser(user.id, user.name);
  } catch (err) { showToast('Error creating profile', 'error'); }
}

function selectUser(id, name) {
  localStorage.setItem('water-user-id', id);
  localStorage.setItem('water-user-name', name);
  init();
}

async function subscribeUser(customTimezone = null, silent = false) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const register = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const subscription = await register.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });
    let timezone = customTimezone || localStorage.getItem('water-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    if (res.status === 404) return switchUser();
    localStorage.setItem('water-timezone', timezone);
    if (!silent) showToast('✅ Reminders enabled!', 'success');
  } catch (err) { console.error(err); }
}

async function logDrink() {
  const amount = parseInt(document.getElementById('drink-amount').value);
  const userId = localStorage.getItem('water-user-id');
  try {
    const res = await fetch('/log-drink', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ userId, amount }),
    });
    if (res.ok) {
      showToast(`Logged ${amount}ml`, 'success');
      fetchStats();
    } else throw new Error();
  } catch (err) {
    const queue = JSON.parse(localStorage.getItem('water-offline-queue') || '[]');
    queue.push({ userId, amount, timestamp: Date.now() });
    localStorage.setItem('water-offline-queue', JSON.stringify(queue));
    const cur = parseInt(document.getElementById('today-total').innerText || '0');
    document.getElementById('today-total').innerText = cur + amount;
    showToast(`Offline. Logged ${amount}ml locally.`, 'info');
  }
}

async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('water-offline-queue') || '[]');
  if (queue.length === 0) return;
  const newQueue = [];
  let synced = 0;
  for (const item of queue) {
      try {
          const res = await fetch('/log-drink', {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ userId: item.userId, amount: item.amount })
          });
          if (res.ok) synced++; else newQueue.push(item);
      } catch (e) { newQueue.push(item); }
  }
  localStorage.setItem('water-offline-queue', JSON.stringify(newQueue));
  if (synced > 0) {
      showToast(`Synced ${synced} drinks!`, 'success');
      fetchStats();
  }
}

window.addEventListener('online', syncOfflineQueue);

async function fetchStats() {
  const userId = localStorage.getItem('water-user-id');
  if (!userId) return;
  if (navigator.onLine) await syncOfflineQueue();

  try {
    const res = await fetch(`/stats/${userId}?goal=2000`, { headers: getHeaders() });
    if (res.status === 404) return switchUser();
    const data = await res.json();

    document.getElementById('today-total').innerText = data.todayTotal;
    document.getElementById('water-fill').style.height = `${Math.min((data.todayTotal / 2000) * 100, 100)}%`;

    const statusEl = document.getElementById('goal-status');
    if (data.todayTotal >= 2000) {
      statusEl.innerText = 'Goal Reached! 🥳';
      statusEl.style.color = 'var(--success)';
      if (!goalReachedToday) { triggerConfetti(); goalReachedToday = true; }
    } else {
      statusEl.innerText = `${2000 - data.todayTotal}ml to go!`;
      statusEl.style.color = 'var(--muted)';
      goalReachedToday = false;
    }

    if (data.currentStreak > 0) {
      document.getElementById('streak-container').classList.remove('hidden');
      document.getElementById('streak-count').innerText = `${data.currentStreak} Day Streak!`;
    } else document.getElementById('streak-container').classList.add('hidden');
    
    document.getElementById('avg-intake').innerText = data.averageDaily;
    document.getElementById('completion-rate').innerText = `${data.completionRate}%`;
    document.getElementById('longest-streak').innerText = data.longestStreak;
    document.getElementById('total-glasses').innerText = data.totalLogs;

    // Heatmap Range
    const range = parseInt(document.getElementById('heatmap-range').value);
    const heatmapEl = document.getElementById('heatmap');
    heatmapEl.innerHTML = '';
    data.heatmap.slice(-range).forEach(day => {
      const div = document.createElement('div');
      div.className = 'heatmap-day';
      if (day.met) div.className += ' met';
      else if (day.amount > 0) div.className += ' partial';
      div.title = `${day.date}: ${day.amount}ml`;
      div.onclick = () => openDayDetailModal(day.date);
      heatmapEl.appendChild(div);
    });

    updateCharts(data);
    
    // Set preferences in UI
    if (data.preferences) {
        document.getElementById('quiet-start').value = data.preferences.quietStart;
        document.getElementById('quiet-end').value = data.preferences.quietEnd;
    }

  } catch (err) { console.error(err); }
}

async function openDayDetailModal(date) {
    const userId = localStorage.getItem('water-user-id');
    const modal = document.getElementById('day-detail-modal');
    const dateTitle = document.getElementById('detail-date');
    const logsContainer = document.getElementById('day-logs');
    
    dateTitle.innerText = new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    logsContainer.innerHTML = 'Loading...';
    modal.classList.remove('hidden');
    
    try {
        const res = await fetch(`/stats/${userId}/day/${date}`, { headers: getHeaders() });
        const logs = await res.json();
        
        if (logs.length === 0) {
            logsContainer.innerHTML = '<p style="color:var(--muted)">No drinks logged this day.</p>';
        } else {
            logsContainer.innerHTML = logs.map(log => `
                <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border)">
                    <span>${new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span style="font-weight:bold; color:var(--primary)">${log.amount}ml</span>
                </div>
            `).join('');
        }
    } catch (e) {
        logsContainer.innerHTML = 'Error loading details.';
    }
}

function closeDayDetailModal() {
    document.getElementById('day-detail-modal').classList.add('hidden');
}

function updateCharts(data) {
  const ctxWeekly = document.getElementById('weekly-chart').getContext('2d');
  if (weeklyChartInstance) weeklyChartInstance.destroy();
  
  const isLight = document.body.classList.contains('light-mode');
  const textColor = isLight ? '#1e293b' : '#f8fafc';

  weeklyChartInstance = new Chart(ctxWeekly, {
    type: 'bar',
    data: {
      labels: data.history.map(d => d.day),
      datasets: [{
        label: 'ml',
        data: data.history.map(d => d.amount),
        backgroundColor: data.history.map(d => d.amount >= 2000 ? '#10b981' : '#0ea5e9'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: isLight ? '#f1f5f9' : '#334155' }, ticks: { color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      }
    }
  });

  const ctxHourly = document.getElementById('hourly-chart').getContext('2d');
  if (hourlyChartInstance) hourlyChartInstance.destroy();
  hourlyChartInstance = new Chart(ctxHourly, {
    type: 'line',
    data: {
      labels: data.hourly.map(h => `${h.hour}:00`),
      datasets: [{
        data: data.hourly.map(h => h.amount),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true, tension: 0.4, pointRadius: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { display: false },
        x: { ticks: { maxTicksLimit: 6, color: textColor }, grid: { display: false } }
      }
    }
  });
}

// --- Settings & Preferences ---
function openSettingsModal() { document.getElementById('settings-modal').classList.remove('hidden'); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.add('hidden'); }

async function savePreferences() {
    const userId = localStorage.getItem('water-user-id');
    const quietStart = parseInt(document.getElementById('quiet-start').value);
    const quietEnd = parseInt(document.getElementById('quiet-end').value);
    
    try {
        const res = await fetch('/preferences', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ userId, quietStart, quietEnd })
        });
        if (res.ok) showToast('Preferences saved!', 'success');
        else throw new Error();
    } catch (e) { showToast('Error saving preferences.', 'error'); }
}

async function muteReminders(hours) {
  const userId = localStorage.getItem('water-user-id');
  try {
    const res = await fetch('/mute', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ userId, hours }),
    });
    if (res.ok) showToast(`🔕 Muted for ${hours} hour.`, 'success');
  } catch (err) { showToast('Error.', 'error'); }
}

async function exportData() {
    const userId = localStorage.getItem('water-user-id');
    const name = localStorage.getItem('water-user-name');
    try {
        const res = await fetch(`/stats/${userId}?goal=2000`, { headers: getHeaders() });
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `water_data_${name}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Data exported!', 'success');
    } catch (e) { showToast('Export failed.', 'error'); }
}

// --- Timezone Management ---
function openTimezoneModal() {
  document.getElementById('timezone-modal').classList.remove('hidden');
  document.getElementById('timezone-search').value = '';
  if (allTimezones.length === 0) {
    try { allTimezones = Intl.supportedValuesOf('timeZone'); } catch (e) { allTimezones = ['UTC', 'Europe/London', 'America/New_York']; }
  }
  renderTimezoneOptions(allTimezones);
}
function closeTimezoneModal() { document.getElementById('timezone-modal').classList.add('hidden'); }
function renderTimezoneOptions(list) {
  const select = document.getElementById('timezone-select');
  select.innerHTML = '';
  const cur = localStorage.getItem('water-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  list.forEach((tz) => {
    const opt = new Option(tz.replace(/_/g, ' '), tz);
    if (tz === cur) opt.selected = true;
    select.add(opt);
  });
}
function filterTimezones() {
  const q = document.getElementById('timezone-search').value.toLowerCase();
  renderTimezoneOptions(allTimezones.filter(tz => tz.toLowerCase().includes(q)));
}
async function saveTimezone() {
  const newTz = document.getElementById('timezone-select').value;
  closeTimezoneModal();
  await subscribeUser(newTz, true).then(() => showToast(`Updated to ${newTz}`, 'success'));
}

function startCountdown() {
  function update() {
    const now = new Date();
    let next = new Date(now);
    next.setMinutes(0); next.setSeconds(0); next.setMilliseconds(0);
    let nh = now.getHours() + (now.getHours() % 2 === 0 ? 2 : 1);
    if (now.getHours() % 2 === 0 && now.getMinutes() > 0) {} 
    // This is simple logic, real logic depends on quiet hours. But for UI, next even hour is fine.
    if (nh > 23) { nh = 0; next.setDate(next.getDate()+1); }
    next.setHours(nh);
    const diff = next - now;
    if (diff <= 0) { document.getElementById('countdown-timer').innerHTML = "Ready! 💧"; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown-timer').innerHTML = `Next: <span style="color:var(--primary)">${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}</span>`;
  }
  update(); setInterval(update, 1000);
}

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  let particles = [];
  const colors = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ef4444'];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4, d: Math.random() * 150, color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10, tiltAngleIncremental: Math.random() * 0.07 + 0.05, tiltAngle: 0,
    });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      p.tiltAngle += p.tiltAngleIncremental; p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2; p.x += Math.sin(p.d);
      ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y); ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2); ctx.stroke();
      if (p.y > canvas.height) { particles[i] = { ...p, y: -20, x: Math.random() * canvas.width }; }
    });
  }
  let id = setInterval(draw, 20);
  setTimeout(() => { clearInterval(id); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 5000);
}

init();
