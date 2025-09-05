// app.zxing.js
// Fallback de leitura de QR usando @zxing/library (funciona em iOS/Safari e outros navegadores sem BarcodeDetector)
const EVENT_NAME = "Avulso";
const READ_DELAY_MS = 2000;
let lastScanned = "";
let lastTime = 0;
let usedLocal = new Set();
let codesMap = {};

// UI refs
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
elMode.textContent = 'ZXING Fallback';

function setBadge(text, cls) {
  elStatus.textContent = text;
  elStatus.className = `badge ${cls||''}`.trim();
}

async function loadData() {
  const res = await fetch('data.json?_=' + Date.now());
  const data = await res.json();
  if (Array.isArray(data)) {
    data.forEach(row => { codesMap[row.code] = { name: row.name || '' }; });
  } else {
    codesMap = data;
  }
}

let stream = null;
let currentDeviceId = null;
let codeReader = null;
let stopFn = null;

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
  if (cams[0]) currentDeviceId = cams[0].deviceId;
}

async function start() {
  await loadData();
  await listCameras();
  setBadge('Iniciando câmera…', '');

  // Importa ZXing por ESM (via CDN)
  const lib = await import('https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm');
  const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, NotFoundException } = lib;

  // constraints para pegar a câmera selecionada
  const constraints = {
    video: currentDeviceId ? { deviceId: { exact: currentDeviceId } } : { facingMode: 'environment' },
    audio: false
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  elVideo.srcObject = stream;
  await elVideo.play();

  // Instancia leitor
  codeReader = new BrowserMultiFormatReader();
  // Apenas QR para focar
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  codeReader.setHints(hints);

  // Decodifica direto do device
  stopFn = await codeReader.decodeFromVideoDevice(
    currentDeviceId || undefined,
    elVideo,
    (result, err) => {
      if (result) {
        const code = (result.getText() || '').trim();
        handleCode(code);
      }
      // ignora NotFoundException (sem QR no frame)
    }
  );

  elStart.disabled = true;
  elStop.disabled = false;
  setBadge('Lendo… aponte o QR para a câmera', '');
}

function stop() {
  try { if (stopFn) stopFn(); } catch {}
  stopFn = null;
  if (codeReader) {
    try { codeReader.reset(); } catch {}
    codeReader = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  elStart.disabled = false;
  elStop.disabled = true;
  setBadge('Parado', '');
}

function handleCode(code, now = Date.now()) {
  if (!code) return;
  if (code === lastScanned && now - lastTime < READ_DELAY_MS) return;
  lastScanned = code; lastTime = now;

  if (!codesMap[code]) {
    setBadge('Inválido', 'err');
    elGuest.textContent = `Código não encontrado: ${code}`;
    return;
  }

  if (usedLocal.has(code)) {
    setBadge('Já usado (sessão)', 'warn');
    elGuest.textContent = `${codesMap[code].name || 'Convidado'} – já validado nesta sessão.`;
    return;
  }

  usedLocal.add(code);
  setBadge('APROVADO ✓', 'ok');
  elGuest.textContent = `${codesMap[code].name || 'Convidado'} – entrada liberada.`;
}

elStart.addEventListener('click', start);
elStop.addEventListener('click', stop);
elCamera.addEventListener('change', (e) => {
  currentDeviceId = e.target.value || currentDeviceId;
  if (stream) { stop(); start(); }
});
elBtnManual.addEventListener('click', () => handleCode(elManual.value.trim()));
