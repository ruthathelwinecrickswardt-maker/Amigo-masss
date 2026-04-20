const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const TelegramBot = require("node-telegram-bot-api");
const pino = require("pino");
const fs = require("fs");

// 🔑 TELEGRAM TOKEN
const TELEGRAM_TOKEN = "8785724584:AAFjUIcHDX3mxZofXRww09zd0L5-PzFM_2c";

// 🤖 TELEGRAM BOT
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// 📂 SESSION
const SESSION_DIR = "./sessions";
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

// 🕒 TIME
const startTime = Date.now();

// 🔥 UTILS
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];

function normalize(text) {
    return text.toLowerCase().replace(/(.)\1+/g, "$1").replace(/[^a-z0-9 ]/g, "");
}

function getUptime() {
    let s = Math.floor((Date.now() - startTime) / 1000);
    let d = Math.floor(s / 86400);
    let h = Math.floor((s % 86400) / 3600);
    let m = Math.floor((s % 3600) / 60);
    let sec = s % 60;
    return `${d}d ${h}h ${m}m ${sec}s`;
}

// 📜 MENU
function getMenu(user) {
    return `
┏━━━〔 ᴀᴅᴀᴍ ʙᴏᴛ 〕━━━┓
  👋 Hi, ${user}
┗━━━━━━━━━━━━━━┛

┌─── STATUS ───┐
Owner  : Adam
Uptime : ${getUptime()}
Host   : Render
└──────────────┘

.menu
.ping
.dice
.math

Powered by Adam ⚡
`;
}

// 🧠 KEYWORD BOT
const intents = [
    { patterns: ["hi", "hello"], responses: ["Hi 😄", "Hello 👋"] },
    { patterns: ["sugham"], responses: ["Sukham aanu 😌"] }
];

function getReply(text) {
    const msg = normalize(text);
    for (let i of intents) {
        for (let p of i.patterns) {
            if (msg.includes(p)) return random(i.responses);
        }
    }
    return "Hmm 🤔";
}

// 🔥 RUN WHATSAPP BOT
async function startBot(number, chatId) {

    const sessionPath = `${SESSION_DIR}/${number}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino())
        },
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    // 🔗 PAIR CODE SEND TO TELEGRAM
    if (!sock.authState.creds.registered) {
        const code = await sock.requestPairingCode(number);
        bot.sendMessage(chatId, `📲 Pair Code: ${code}`);
    }

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {

        if (connection === "open") {
            bot.sendMessage(chatId, "✅ WhatsApp Connected!");
        }

        if (connection === "close") {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot(number, chatId);
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text;

        if (!text) return;

        const from = msg.key.remoteJid;
        const sender = msg.pushName || "User";
        const clean = text.toLowerCase().trim();

        let reply;

        if (clean === ".menu") reply = getMenu(sender);
        else if (clean === ".ping") reply = "🏓 Pong!";
        else if (clean === ".dice") reply = "🎲 " + (Math.floor(Math.random()*6)+1);

        else if (clean.startsWith(".math")) {
            try {
                const exp = clean.replace(".math", "").trim();
                reply = "🧮 " + eval(exp);
            } catch {
                reply = "Invalid 😅";
            }
        }

        else reply = getReply(text);

        await sock.sendPresenceUpdate("composing", from);
        await new Promise(r => setTimeout(r, 400));

        await sock.sendMessage(from, { text: reply });
    });
}

// 🤖 TELEGRAM COMMANDS

// /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `
🤖 ADAM BOT

Use:
/pair 91xxxxxxxxxx
`);
});

// /pair
bot.onText(/\/pair (.+)/, async (msg, match) => {
    const number = match[1];
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, "⏳ Generating Pair Code...");

    startBot(number, chatId);
});
