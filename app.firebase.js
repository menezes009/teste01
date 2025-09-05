// app.firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const EVENT_NAME = "Avulso";
const READ_DELAY_MS = 2000;
let lastScanned = "";
let lastTime = 0;
let detector = null;
let scanning = false;
let stream = null;

// ===== Preencha com suas chaves Firebase =====
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "",
  appId: ""
};
// ============================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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
elMode.textContent = 'ADVANCED';

function setBadge(text, cls) {
  elStatus.textContent = text;
  elStatus.className = `badge ${cls||''}`.trim();
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

  if ('BarcodeDetector' in window) {
    try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} 
  }
  scanning = true;
  loopScan();
  elStart.disabled = true;
  elStop.disabled = false;
  setBadge('Lendo… aponte o QR para a câmera', '');
}

function stop() {
  scanning = false;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
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
        if (code && !(code === lastScanned && now - lastTime < READ_DELAY_MS)) {
          lastScanned = code; lastTime = now;
          await validateAndConsume(code);
        }
      }
    }
  } catch {} 
  requestAnimationFrame(loopScan);
}

async function validateAndConsume(code) {
  // Estrutura no DB: /events/{EVENT_NAME}/codes/{code} -> { name: "Fulano", used: true/false }
  const path = `events/${encodeURIComponent(EVENT_NAME)}/codes/${encodeURIComponent(code)}`;
  const codeRef = ref(db, path);

  try {
    await runTransaction(codeRef, (current) => {
      if (current === null) {
        // código não existe -> não altera
        return current;
      }
      if (current.used) {
        return current; // já usado
      }
      // marca como usado
      return { ...current, used: true, usedAt: Date.now() };
    }, { applyLocally: false });

    const snap = await get(codeRef);
    const val = snap.val();
    if (!val) {
      setBadge('Inválido', 'err');
      elGuest.textContent = `Código não encontrado: ${code}`;
      return;
    }
    if (val.used && val.usedAt) {
      const delta = Date.now() - val.usedAt;
      if (delta < 1500) {
        setBadge('APROVADO ✓', 'ok');
        elGuest.textContent = `${val.name || 'Convidado'} – entrada liberada.`;
      } else {
        setBadge('Já usado', 'warn');
        elGuest.textContent = `${val.name || 'Convidado'} – tentativa repetida.`;
      }
    } else {
      setBadge('Erro de validação', 'err');
      elGuest.textContent = `Tente novamente: ${code}`;
    }
  } catch (e) {
    setBadge('Erro de rede/perm.', 'err');
    elGuest.textContent = e.message || 'Falha ao validar';
  }
}

document.getElementById('btnStart').addEventListener('click', start);
document.getElementById('btnStop').addEventListener('click', stop);
document.getElementById('cameraSelect').addEventListener('change', () => { if (stream) { stop(); start(); } });
document.getElementById('btnManual').addEventListener('click', () => validateAndConsume(document.getElementById('manualCode').value.trim()));
