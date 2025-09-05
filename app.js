// app.js
const EVENT_NAME = "Avulso";
const READ_DELAY_MS = 2000; // delay mínimo entre leituras
let lastScanned = "";
let lastTime = 0;
let usedLocal = new Set(); // evita recontagem nessa aba/sessão
let codesMap = {}; // { code: { name, extra? } }

// UI refs
const elEvent = document.getElementById('eventName');
const elMode = document.getElementById('appMode');
const elCamera = document.getElementById('cameraSelect');
const elStart = document.getElementById('btnStart');
const elStop = document.getElementById('btnStop');
const elVideo = document.getElementById('video');
const elCanvas = document.getElementById('canvas');
const elStatus = document.getElementById('statusBadge');
const elGuest = document.getElementById('guestInfo');
const elManual = document.getElementById('manualCode');
const elBtnManual = document.getElementById('btnManual');

elEvent.textContent = EVENT_NAME;
elMode.textContent = 'SIMPLER';

let stream = null;
let detector = null;
let scanning = false;

function setBadge(text, cls) {
  elStatus.textContent = text;
  elStatus.className = `badge ${cls||''}`.trim();
}

async function loadData() {
  const res = await fetch('data.json?_=' + Date.now());
  const data = await res.json();
  // aceita array ou objeto
  if (Array.isArray(data)) {
    // array de {code, name}
    data.forEach(row => { codesMap[row.code] = { name: row.name || '' }; });
  } else {
    codesMap = data; // { code: {name} }
  }
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

async function start() {
  await loadData();
  await listCameras();
  setBadge('Iniciando câmera…', '');
  const constraints = {
    video: {
      deviceId: elCamera.value ? { exact: elCamera.value } : undefined,
      facingMode: 'environment'
    },
    audio: false
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  elVideo.srcObject = stream;
  await elVideo.play();

  // Tenta usar BarcodeDetector
  if ('BarcodeDetector' in window) {
    try {
      detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch {}
  }
  scanning = true;
  loopScan();
  elStart.disabled = true;
  elStop.disabled = false;
  setBadge('Lendo… aponte o QR para a câmera', '');
}

function stop() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  elStart.disabled = false;
  elStop.disabled = true;
  setBadge('Parado', '');
}

async function loopScan() {
  if (!scanning) return;
  try {
    const now = Date.now();
    if (detector) {
      const barcodes = await detector.detect(elVideo);
      if (barcodes && barcodes.length) {
        const code = (barcodes[0].rawValue || '').trim();
        handleCode(code, now);
      }
    } else {
      // Fallback simples: captura frame (sem decodificar) – use entrada manual
      // Você pode integrar jsQR ou @zxing/library para decodificar frames aqui.
    }
  } catch (e) {
    // silencioso para estabilidade
  }
  requestAnimationFrame(loopScan);
}

function handleCode(code, now=Date.now()) {
  if (!code) return;
  if (code === lastScanned && now - lastTime < READ_DELAY_MS) return; // debounce
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

  // Marca usado nesta sessão
  usedLocal.add(code);
  setBadge('APROVADO ✓', 'ok');
  elGuest.textContent = `${codesMap[code].name || 'Convidado'} – entrada liberada.`;
}

elStart.addEventListener('click', start);
elStop.addEventListener('click', stop);
elCamera.addEventListener('change', () => { if (stream) { stop(); start(); } });
elBtnManual.addEventListener('click', () => handleCode(elManual.value.trim()));
