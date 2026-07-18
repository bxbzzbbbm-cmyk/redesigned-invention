const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

const app = express();

const PORT = process.env.PORT || 5900;

let sock;

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<title>WhatsApp Pair</title>
</head>
<body>
<h2>WhatsApp Bot Pairing</h2>

<input id="number" placeholder="15551234567">
<button onclick="pair()">Generate Pair Code</button>

<pre id="result"></pre>

<script>
async function pair() {
  const number = document.getElementById("number").value;

  const res = await fetch("/generate-pair?number=" + number);
  const data = await res.json();

  document.getElementById("result").textContent =
    JSON.stringify(data, null, 2);
}
</script>

</body>
</html>
`;

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("WhatsApp connected");
    }

    if (connection === "close") {
      console.log("WhatsApp disconnected");
    }
  });
}

app.get("/", (req, res) => {
  res.send(htmlContent);
});

app.get("/generate-pair", async (req, res) => {
  try {
    const number = String(req.query.number || "")
      .replace(/\D/g, "");

    if (!number) {
      return res.status(400).json({
        error: "number required"
      });
    }

    if (!sock) {
      await startWhatsApp();
    }

    const code = await sock.requestPairingCode(number);

    res.json({
      success: true,
      pairing_code: code,
      number
    });

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startWhatsApp();
