// app.local.js – ZERO EDIT: pronto para subir e usar (sem backend)
// - Persistência: localStorage (por aparelho/navegador)
// - Leitor: ZXing (fallback universal via CDN)
// - Dashboard: dashboard-local.html
const EVENT_NAME = 'teste01';
const READ_DELAY_MS = 1800;
let lastScanned = '';
let lastTime = 0;
let codesMap = {};
let usedLocal = new Set(JSON.parse(localStorage.getItem(`used_${EVENT_NAME}`) || '[]'));

// UI
const elEvent = document.getElementById('eventName');
const elMode = document.getElementById('appMode');
const elCamera = document.getElementById('cameraSelect');
const elStart = document.getElementById('btnStart');
const elStop = document.getElementById('btnStop');
const elVideo = document.getElementById('video');
const elStatus = document.getElementById('statusBadge');
const elGuest = document.getElementById('guestInfo');
const elManual = document.getElementById('manualCode');
const elBtnManual = document.getElementById('btnManual');

elEvent.textContent = EVENT_NAME;
elMode.textContent = 'LOCAL';

function setBadge(text, cls) {
  elStatus.textContent = text;
  elStatus.className = `badge ${cls||''}`.trim();
}

async function loadData() {
  const res = await fetch('data.json?_=' + Date.now());
  const data = await res.json();
  codesMap = data;
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  elCamera.innerHTML = '';
  cams.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = c.deviceId;
    opt.textContent = c.label || `Câmera ${i+1}`;
    elCamera.appendChild(opt);
  });
}

let stopZX = null;
async function start() {
  await loadData();
  await listCameras();
  setBadge('Iniciando câmera…','');

  const constraints = {
    video: elCamera.value ? { deviceId: { exact: elCamera.value } } : { facingMode: 'environment' },
    audio: false
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  elVideo.srcObject = stream;
  await elVideo.play();

  const lib = await import('https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm');
  const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = lib;
  const reader = new BrowserMultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  reader.setHints(hints);

  stopZX = await reader.decodeFromVideoDevice(
    elCamera.value || undefined,
    elVideo,
    (result, err) => {
      if (result) {
        const code = (result.getText() || '').trim();
        const now = Date.now();
        if (code && !(code === lastScanned && now - lastTime < READ_DELAY_MS)) {
          lastScanned = code; lastTime = now;
          handleCode(code);
        }
      }
    }
  );

  elStart.disabled = true;
  elStop.disabled = false;
  setBadge('Lendo… (ZXing)', '');
}

function stop() {
  try { if (stopZX) stopZX(); } catch {}
  elStart.disabled = false;
  elStop.disabled = true;
  setBadge('Parado','');
}

function persistUsed() {
  localStorage.setItem(`used_${EVENT_NAME}`, JSON.stringify(Array.from(usedLocal)));
}

function addCheckinLog(entry) {
  const key = `checkins_${EVENT_NAME}`;
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  arr.push(entry);
  localStorage.setItem(key, JSON.stringify(arr));
}

function handleCode(code) {
  if (!codesMap[code]) {
    setBadge('Inválido', 'err');
    elGuest.textContent = `Código não encontrado: ${code}`;
    return;
  }
  if (usedLocal.has(code)) {
    setBadge('Já usado (neste aparelho)', 'warn');
    elGuest.textContent = `${codesMap[code].name || 'Convidado'} – já validado neste aparelho.`;
    return;
  }
  usedLocal.add(code); persistUsed();
  const entry = { code, name: codesMap[code].name || 'Convidado', at: Date.now(), deviceId: 'local' };
  addCheckinLog(entry);
  setBadge('APROVADO ✓', 'ok');
  elGuest.textContent = `${entry.name} – entrada liberada.`;
}

elStart.addEventListener('click', start);
elStop.addEventListener('click', stop);
elCamera.addEventListener('change', () => { if (stopZX) { stop(); start(); } });
elBtnManual.addEventListener('click', () => handleCode(elManual.value.trim()));
