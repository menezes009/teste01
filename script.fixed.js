// script.fixed.js – compatível com seu data.json (array de objetos {codigo, nome, presenca})
let scanner;
let codigosLidos = [];
let ultimoCodigoLido = "";
let aguardando = false;
let devices = [];
let currentCameraId = null;

// Util: extrai 'codigo' de URLs (?codigo=XXX) ou retorna texto puro
function extrairCodigo(decodedText) {
  try {
    // Aceita QR com URL e params extras (?codigo=...&x=y)
    const u = new URL(decodedText);
    const p = new URLSearchParams(u.search || "");
    const c = p.get("codigo");
    if (c) return c.trim();
  } catch (_) { /* not a URL */ }
  // Se não for URL, usa o texto direto (limpo)
  // Remove possíveis prefixos tipo 'codigo=' caso seja texto simples
  const idx = decodedText.indexOf("codigo=");
  const base = idx >= 0 ? decodedText.slice(idx + 7) : decodedText;
  // Se vierem outros params depois (&), corta
  return String(base).split("&")[0].trim();
}

function carregarData() {
  return fetch('data.json?_=' + Date.now()).then(r => r.json());
}

function validarCodigo(codigo) {
  carregarData().then(data => {
    const resultadoEl = document.getElementById('resultado');
    const item = Array.isArray(data) ? data.find(entry => String(entry.codigo).trim() === String(codigo).trim()) : null;

    if (!codigo) {
      resultadoEl.innerHTML = '<p class="invalido">Nenhum código informado.</p>';
    } else if (!item) {
      resultadoEl.innerHTML = '<p class="invalido">Código inválido.</p>';
    } else if (String(item.presenca).toLowerCase() === "sim") {
      resultadoEl.innerHTML = '<p class="usado">❌ Código já utilizado por ' + (item.nome || '') + '</p>';
    } else if (codigosLidos.includes(codigo)) {
      resultadoEl.innerHTML = '<p class="usado">⛔ Código já lido nesta sessão.</p>';
    } else {
      resultadoEl.innerHTML = '<p class="ok">✅ Acesso liberado para ' + (item.nome || '') + '</p>';
      codigosLidos.push(codigo);
      salvarCheckin(item.nome || codigo);
      atualizarLista();
    }

    aguardando = true;
    setTimeout(() => {
      aguardando = false;
      ultimoCodigoLido = "";
    }, 2500);
  }).catch(err => {
    document.getElementById('resultado').innerHTML = '<p class="invalido">Falha ao carregar data.json</p>';
  });
}

function salvarCheckin(nome) {
  const lista = JSON.parse(localStorage.getItem("checkins") || "[]");
  lista.push({ nome, at: Date.now() });
  localStorage.setItem("checkins", JSON.stringify(lista));
}

function atualizarLista() {
  const lista = JSON.parse(localStorage.getItem("checkins") || "[]");
  const listaEl = document.getElementById("lista-validacoes");
  listaEl.innerHTML = "";
  lista.slice().reverse().forEach(item => {
    const li = document.createElement("li");
    const when = new Date(item.at).toLocaleString();
    li.textContent = `${item.nome} — ${when}`;
    listaEl.appendChild(li);
  });
}

function resetarTudo() {
  localStorage.removeItem("checkins");
  codigosLidos = [];
  ultimoCodigoLido = "";
  atualizarLista();
  document.getElementById("resultado").innerHTML = '<p class="invalido">Lista de check-ins zerada.</p>';
}

function exportarLista() {
  const lista = JSON.parse(localStorage.getItem("checkins") || "[]");
  const header = "nome,quando\n";
  const body = lista.map(i => `"${String(i.nome).replace(/"/g,'""')}",${new Date(i.at).toISOString()}`).join("\n");
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(header + body);
  const link = document.createElement("a");
  link.href = csvContent;
  link.download = "checkins.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Câmeras
function popularCameras() {
  return Html5Qrcode.getCameras().then(cams => {
    devices = cams || [];
    const sel = document.getElementById("cameraSelect");
    sel.innerHTML = "";
    devices.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.label || d.id;
      sel.appendChild(opt);
    });
    if (devices[0]) currentCameraId = devices[0].id;
    sel.addEventListener("change", e => {
      currentCameraId = e.target.value;
      restartScanner();
    });
  }).catch(_ => {});
}

function restartScanner(){
  if (!scanner) return;
  scanner.stop().then(()=>startScanner()).catch(()=>startScanner());
}

function startScanner() {
  if (!scanner) scanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: 250, rememberLastUsedCamera: true };

  const cameraConfig = currentCameraId ? { deviceId: { exact: currentCameraId } } : { facingMode: "environment" };

  scanner.start(
    cameraConfig,
    config,
    (decodedText) => {
      const codigo = extrairCodigo(decodedText);
      if (aguardando || codigo === ultimoCodigoLido) return;
      ultimoCodigoLido = codigo;
      validarCodigo(codigo);
    },
    (errorMessage) => { /* silencioso */ }
  ).catch(err => {
    document.getElementById('resultado').innerHTML = '<p class="invalido">Erro ao iniciar câmera. Verifique permissões/HTTPS.</p>';
  });
}

document.getElementById("btnValidar").addEventListener("click", () => {
  const v = document.getElementById("manualInput").value.trim();
  validarCodigo(v);
});

popularCameras().then(() => startScanner());
atualizarLista();
