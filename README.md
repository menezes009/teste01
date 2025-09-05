# Validador de QR Code – Avulso

## Passo a passo rápido
1. Suba estes arquivos em um repositório no GitHub (ex.: `qr-checkin`).
2. Ative **Settings › Pages** na branch principal e pasta root.
3. Acesse a URL do GitHub Pages e permita o uso da câmera.
4. Escaneie um dos QRs de teste:
   - TESTE123 → Convidado de Exemplo 1
   - TESTE456 → Convidado de Exemplo 2

## Alternativa persistente (Firebase)
- Use `app.firebase.js` (habilite Realtime Database e ajuste as chaves).
- Estrutura no DB: `/events/Avulso/codes/{code}` → `{ name, used: false }`.
