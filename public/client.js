const publicVapidKey =
  'BCKSc8wkr2vgE8J75qCAefS59G9b04rPWXRNoDo_81plcl-qa-CysG4mp7eCgYgJbi3316_tzCWkPMyMeKbDRCo';

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

function saveSecret() {
  const secret = document.getElementById('secret-code').value;
  if (secret) {
    localStorage.setItem('water-secret', secret);
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
  }
}

if (localStorage.getItem('water-secret')) {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
}

function getLocalTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function subscribeUser() {
  if (!('serviceWorker' in navigator))
    return alert('No Service Worker support!');

  const register = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });

  const subscription = await register.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  });

  await fetch('/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      timezone: getLocalTimezone(),
    }),
    headers: {
      'content-type': 'application/json',
      'x-api-key': localStorage.getItem('water-secret'),
    },
  });

  alert('Subscribed with Timezone: ' + getLocalTimezone());
}

async function updateTimezone() {
  await subscribeUser();
  document.getElementById('status').innerText =
    'Timezone updated to ' + getLocalTimezone();
}

async function logDrink() {
  const res = await fetch('/log-drink', {
    method: 'POST',
    headers: {
      'x-api-key': localStorage.getItem('water-secret'),
    },
  });

  if (res.ok) {
    document.getElementById('status').innerText =
      'Logged at ' + new Date().toLocaleTimeString();
  } else {
    alert('Failed. Check secret code.');
  }
}
