const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const axios = require('axios');

const userMessageTimestamps = new Map();
let isReconnecting = false;
let reconnectTimeout = null;

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["kangwifi kfai", "anonymous", "1.0.0"],
    });

    sock.ev.on('messages.upsert', handleMessages(sock));
    sock.ev.on('connection.update', updateConnection(sock));
    sock.ev.on('creds.update', saveCreds);
}

function handleMessages(sock) {
    return async (m) => {
        const msg = m.messages[0];
        if (!msg.message || (msg.key && msg.key.remoteJid === 'status@broadcast')) return;

        const from = msg.key.remoteJid;
        const messageBody = extractMessageBody(msg);

        if (!messageBody || !isRateLimited(from)) return;

        console.log('Received message:', messageBody);
    };
}

function extractMessageBody(msg) {
    return msg.message.conversation || 
           msg.message.extendedTextMessage?.text || 
           msg.message.imageMessage?.caption || 
           null;
}

function isRateLimited(from) {
    const now = Date.now();
    const lastMessageTime = userMessageTimestamps.get(from) || 0;

    if (now - lastMessageTime < 2000) {
        console.log('Rate limit exceeded, ignoring message');
        return false;
    }

    userMessageTimestamps.set(from, now);
    return true;
}

function updateConnection(sock) {
    return async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                if (!isReconnecting) {
                    isReconnecting = true;
                    console.log('Connection lost, reconnecting...');
                    if (reconnectTimeout) clearTimeout(reconnectTimeout);
                    reconnectTimeout = setTimeout(() => startSock(), 10000);
                }
            } else {
                console.log('Connection closed. You are logged out.');
            }
        } else if (connection === 'open') {
            console.log('Connected');
            isReconnecting = false;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
        }
    };
}

// Start the socket connection
startSock();
