const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const http = require("http");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 5900;

let currentQrText = "";
let isConnected = false;

// Инициализация сокета WhatsApp
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
        },
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;

        if (qr) {
            currentQrText = qr; // Сохраняем сырой текст QR-кода
        }

        if (connection === 'close') {
            isConnected = false;
            currentQrText = "";
            console.log("Соединение закрыто. Перезапуск через 3 секунды...");
            setTimeout(startWhatsAppBot, 3000);
        } else if (connection === 'open') {
            isConnected = true;
            currentQrText = "";
            console.log('✅ WhatsApp Bot successfully connected!');
        }
    });

    // Автоответчик на команду "ping"
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (text?.toLowerCase() === 'ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! 🏓' });
        }
    });
}

// Запуск бота в фоне
startWhatsAppBot();

// Встроенная HTML страница
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp QR Bot</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #e5ddd5; margin: 0; }
        .box { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 100%; max-width: 360px; }
        h2 { color: #075e54; margin-top: 0; margin-bottom: 10px; }
        p { font-size: 14px; color: #666; margin-bottom: 20px; }
        .qr-frame { margin: 20px auto; width: 240px; height: 240px; display: flex; align-items: center; justify-content: center; background: #f9f9f9; border: 1px dashed #ccc; border-radius: 8px; overflow: hidden; }
        img { width: 100%; height: 100%; object-fit: contain; }
        .status { font-weight: bold; font-size: 16px; margin-top: 15px; color: #555; }
        .active { color: #25d366; }
        .wait { color: #f57c00; }
    </style>
    <script>
        // Функция динамического обновления статуса и картинки раз в 3 секунды без перезагрузки всей страницы
        setInterval(async () => {
            try {
                const res = await fetch('/status');
                const data = await res.json();
                const frame = document.getElementById('qr-frame');
                const statusSpan = document.getElementById('status-text');

                if (data.connected) {
                    frame.innerHTML = '<div class="status active">✅ Connected!</div>';
                    statusSpan.className = 'active';
                    statusSpan.innerText = 'Active';
                } else if (data.hasQr) {
                    // Добавляем timestamp к URL, чтобы браузер принудительно обновлял кэш картинки .png
                    frame.innerHTML = '<img src="/qr.png?t=' + new Date().getTime() + '" alt="WhatsApp QR">';
                    statusSpan.className = 'wait';
                    statusSpan.innerText = 'Waiting for link';
                } else {
                    frame.innerHTML = '<div class="status wait">Generating QR...</div>';
                    statusSpan.className = 'wait';
                    statusSpan.innerText = 'Waiting for link';
                }
            } catch (e) {}
        }, 3000);
    </script>
</head>
<body>
    <div class="box">
        <h2>WhatsApp Bot</h2>
        <p>Scan the QR code using your WhatsApp application</p>
        
        <div class="qr-frame" id="qr-frame">
            <div class="status wait">Loading...</div>
        </div>
        
        <div class="status">
            Status: <span id="status-text" class="wait">Checking...</span>
        </div>
    </div>
</body>
</html>
`;

// Создание HTTP-сервера на чистом модуле http
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
    } 
    // Эндпоинт генерации и отдачи .png изображения QR-кода
    else if (url.pathname === '/qr.png') {
        if (currentQrText && !isConnected) {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            QRCode.toBuffer(currentQrText, { type: 'png', margin: 2 }, (err, buffer) => {
                if (err) {
                    res.writeHead(500);
                    res.end();
                } else {
                    res.end(buffer);
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    } 
    // Эндпоинт проверки текущего статуса
    else if (url.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: isConnected,
            hasQr: currentQrText !== ""
        }));
    } 
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Слушаем хост 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on:`);
    console.log(`-> Local: http://127.0.0.1:5900`);
    console.log(`-> Render Port: ${PORT}`);
});