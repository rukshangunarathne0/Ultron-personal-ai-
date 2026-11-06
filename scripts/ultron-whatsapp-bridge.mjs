#!/usr/bin/env node
/**
 * ULTRON LOCAL PERSONAL WHATSAPP BRIDGE (Phone-Number Pairing Code)
 * -----------------------------------------------------------------
 * Run on your PC to connect Ultron directly to your personal WhatsApp
 * with ZERO third-party cloud accounts:
 *
 *   npm install --no-save @whiskeysockets/baileys pino
 *   node scripts/ultron-whatsapp-bridge.mjs +9477XXXXXXX
 *
 * 1. Enter the 8-digit Pairing Code shown here into WhatsApp on your phone
 *    (Settings -> Linked Devices -> Link a Device -> Link with phone number instead).
 * 2. Keep this terminal open — https://ultron-personal-ai.vercel.app automatically
 *    detects http://localhost:3005 and reads unseen messages & sends replies!
 */

import http from 'node:http';

const PORT = 3005;
const argPhone = (process.argv[2] || '').replace(/[^0-9]/g, '');

const unseenMessages = [];
let connectionStatus = 'starting';
let pairingCode = null;
let sockRef = null;

async function startBaileys() {
  let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  } catch {
    console.error(
      '\n[ULTRON WA BRIDGE] Install Baileys once first:\n  npm install --no-save @whiskeysockets/baileys pino\n'
    );
    process.exit(1);
  }

  const pino = (await import('pino')).default;
  const { state, saveCreds } = await useMultiFileAuthState('.ultron-wa-auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: !argPhone,
    logger: pino({ level: 'silent' }),
  });
  sockRef = sock;

  sock.ev.on('creds.update', saveCreds);

  if (argPhone && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(argPhone);
        pairingCode = code;
        console.log(`\n=================================================`);
        console.log(`  ULTRON WHATSAPP 8-DIGIT PAIRING CODE: ${code}`);
        console.log(`  Open WhatsApp -> Linked Devices -> Link with phone number`);
        console.log(`=================================================\n`);
      } catch (err) {
        console.error('Pairing code error:', err.message);
      }
    }, 2500);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      connectionStatus = 'authorized';
      pairingCode = null;
      console.log('[ULTRON WA BRIDGE] WhatsApp Connected & Authorized on port 3005!');
    } else if (connection === 'close') {
      connectionStatus = 'disconnected';
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        startBaileys();
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      if (m.key.fromMe) continue;
      const text =
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        '';
      if (!text) continue;
      unseenMessages.unshift({
        id: m.key.id || String(Date.now()),
        platform: 'whatsapp',
        sender: m.pushName || m.key.remoteJid?.replace('@s.whatsapp.net', '') || 'Contact',
        chatId: m.key.remoteJid || '',
        text,
        timestamp: new Date((Number(m.messageTimestamp) || Date.now() / 1000) * 1000).toISOString(),
        seenByOperator: false,
      });
      if (unseenMessages.length > 50) unseenMessages.pop();
    }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/whatsapp/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        authorized: connectionStatus === 'authorized',
        state: connectionStatus,
        pairingCode,
        unseenCount: unseenMessages.filter((m) => !m.seenByOperator).length,
      })
    );
    return;
  }

  if (req.url?.startsWith('/whatsapp/unread') && req.method === 'GET') {
    const unread = unseenMessages.filter((m) => !m.seenByOperator);
    unread.forEach((m) => {
      m.seenByOperator = true;
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: unread.length ? unread : unseenMessages.slice(0, 10) }));
    return;
  }

  if (req.url === '/whatsapp/send' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { to, text } = JSON.parse(body || '{}');
        const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        await sockRef.sendMessage(jid, { text });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ULTRON WA BRIDGE] Listening on http://localhost:${PORT}`);
  startBaileys();
});
