require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const puppeteer  = require('puppeteer');
const QRCode     = require('qrcode');
const nodemailer = require('nodemailer');
const dns        = require('dns');

// Force IPv4-first resolution to prevent IPv6 ENETUNREACH errors on Render
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files ───────────────────────────────────────────────────────────
const passesDir = path.join(__dirname, 'passes');
if (!fs.existsSync(passesDir)) fs.mkdirSync(passesDir, { recursive: true });
app.use(express.static(path.join(__dirname)));
app.use('/passes', express.static(passesDir));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'gmr-aerocity-pass.html')));

// ── Gmail ──────────────────────────────────────────────────────────────────
// Custom lookup forces IPv4 — Render free tier has no IPv6 egress and
// the top-level `family:4` option is not respected by all nodemailer versions.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback);
  },
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────
function generatePassId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'GMR-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function todayStr() {
  const d = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Boarding Pass HTML — Aerocity destination design ───────────────────────
function buildPassHTML({ passId, name, email, phone, qrSrc }) {
  const seed = passId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const bars = Array.from({ length: 44 }, (_, i) => {
    const h  = 10 + ((seed * 7 + i * 13) % 20);
    const w  = i % 3 === 0 ? 4 : i % 5 === 0 ? 2 : 3;
    const op = ((55 + (seed + i * 17) % 40) / 100).toFixed(2);
    return `<div style="background:rgba(255,255,255,${op});height:${h}px;width:${w}px;flex-shrink:0;border-radius:1px"></div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:840px;height:360px;overflow:hidden;background:transparent;font-family:Arial,sans-serif}
.pass{width:840px;height:360px;background:#FAFAF8;display:flex;flex-direction:column;border-radius:12px;overflow:hidden}

/* Header */
.hd{background:#1A3B6E;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.ht{color:#F5A623;font-size:17px;font-weight:900;letter-spacing:4px}
.hs{color:rgba(255,255,255,.4);font-size:8px;letter-spacing:3px;margin-top:2px}
.hb{background:#E87722;color:#fff;padding:5px 16px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:1px}

/* Main */
.main{flex:1;display:flex;padding:16px 24px 12px;gap:0;overflow:hidden}
.left{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding-right:20px;border-right:2px dashed #d4cfc4}

/* Guest */
.guest-lbl{font-size:7.5px;color:#9a8c78;letter-spacing:2.5px;font-weight:700;text-transform:uppercase}
.guest-name{font-size:22px;font-weight:900;color:#1A3B6E;margin-top:3px;text-transform:uppercase;letter-spacing:.5px}
.guest-contact{font-size:10px;color:#9a8c78;margin-top:4px;letter-spacing:.3px}

/* Creative Aerocity destination section */
.dest-row{display:flex;align-items:center;gap:10px}
.dest-left{text-align:left}
.dest-word{font-size:38px;font-weight:900;color:#1A3B6E;line-height:1;letter-spacing:-1px}
.dest-sub{font-size:9px;color:#9a8c78;font-weight:600;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase}
.dest-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
.dest-line-wrap{display:flex;align-items:center;gap:0;width:100%}
.dest-dash{flex:1;border-top:1.5px dashed #1A3B6E}
.dest-diamond{
  width:16px;height:16px;
  background:#E87722;
  transform:rotate(45deg);
  flex-shrink:0;
  margin:0 6px;
}
.dest-tag{font-size:8px;color:#9a8c78;letter-spacing:2px;text-transform:uppercase;text-align:center}
.dest-right{text-align:right}

/* Pass meta */
.meta-row{display:flex;gap:20px}
.meta-item .ml{font-size:7.5px;color:#9a8c78;letter-spacing:1.5px;font-weight:700;text-transform:uppercase}
.meta-item .mv{font-size:12px;font-weight:700;color:#1A3B6E;font-family:'Courier New',monospace;margin-top:2px}

/* QR */
.right{width:176px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-left:20px}
.qb{background:#fff;padding:7px;border-radius:7px;border:2px solid #1A3B6E}
.qb img{width:130px;height:130px;display:block}
.ql{font-size:7.5px;color:#9a8c78;letter-spacing:1.5px;margin-top:6px;font-weight:600;text-align:center}
.pi{font-family:'Courier New',monospace;font-size:12px;font-weight:700;color:#1A3B6E;letter-spacing:2px;margin-top:3px;text-align:center}

/* Footer */
.ft{background:#1A3B6E;padding:8px 28px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.bc{display:flex;gap:2px;align-items:flex-end;height:28px}
.fid{font-family:'Courier New',monospace;font-size:12px;font-weight:700;color:#F5A623;letter-spacing:3px}
.fv{font-size:7.5px;color:rgba(255,255,255,.4);letter-spacing:2px;margin-top:2px}
.fr{text-align:right}
.fst{font-size:9px;color:#F5A623;letter-spacing:1px;font-weight:700}
.fsl{font-size:7.5px;color:rgba(255,255,255,.35);margin-top:2px}
</style></head><body>
<div class="pass">

  <div class="hd">
    <div><div class="ht">GMR AEROCITY</div><div class="hs">NEW DELHI &nbsp;·&nbsp; EXCLUSIVE BOARDING PASS</div></div>
    <div class="hb">UP TO 20% OFF</div>
  </div>

  <div class="main">
    <div class="left">

      <!-- Guest info -->
      <div>
        <div class="guest-lbl">Guest Name</div>
        <div class="guest-name">${name}</div>
        <div class="guest-contact">${email} &nbsp;·&nbsp; ${phone}</div>
      </div>

      <!-- Creative Aerocity destination -->
      <div class="dest-row">
        <div class="dest-left">
          <div class="dest-word">SHOP</div>
          <div class="dest-word">DINE</div>
          <div class="dest-sub">Your journey</div>
        </div>
        <div class="dest-mid"></div>
        <div class="dest-right">
          <div class="dest-word" style="text-align:right">GMR</div>
          <div class="dest-word" style="text-align:right">AEROCITY</div>
          <div class="dest-sub" style="text-align:right">New Delhi</div>
        </div>
      </div>

      <!-- Pass meta -->
      <div class="meta-row" style="justify-content: space-between;">
        <div class="meta-item"><div class="ml">Pass ID</div><div class="mv">${passId}</div></div>
        <div class="meta-item"><div class="ml">Date</div><div class="mv">${todayStr()}</div></div>
      </div>

    </div>

    <!-- QR -->
    <div class="right">
      <div class="qb"><img src="${qrSrc}" /></div>
      <div class="ql">SCAN AT STORE</div>
      <div class="pi">${passId}</div>
    </div>
  </div>

  <div class="ft">
    <div class="bc">${bars}</div>
    <div>
      <div class="fid">${passId}</div>
      <div class="fv">VALID ONLY TODAY</div>
    </div>
    <div class="fr">
      <div class="fst">Partner Stores</div>
      <div class="fsl">Roseate · Blue Tokai · Burma Burma · Costa Coffee · Citrus Cafe · and more</div>
    </div>
  </div>

</div>
</body></html>`;
}

// ── Generate pass PNG ──────────────────────────────────────────────────────
async function generatePassImage(passData) {
  const qrData = `GMR-PASS|${passData.passId}|${passData.name}|${passData.email}`;
  const qrSrc  = await QRCode.toDataURL(qrData, {
    width: 260, margin: 1,
    color: { dark: '#1A3B6E', light: '#FFFFFF' }
  });

  const html    = buildPassHTML({ ...passData, qrSrc });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 840, height: 360, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 300));
    const filePath = path.join(passesDir, `${passData.passId}.png`);
    await page.screenshot({ path: filePath, type: 'png', clip: { x: 0, y: 0, width: 840, height: 360 } });
    return filePath;
  } finally {
    await browser.close();
  }
}

// ── Email HTML ─────────────────────────────────────────────────────────────
function buildEmailHTML({ name, passId, email, phone }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{margin:0;padding:0;background:#F4F5F7;font-family:Arial,sans-serif}
.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.hd{background:#1A3B6E;padding:22px 32px}
.hd h1{color:#F5A623;font-size:20px;letter-spacing:3px;margin:0}
.hd p{color:rgba(255,255,255,.4);font-size:10px;letter-spacing:2px;margin:4px 0 0}
.body{padding:28px 32px}
.greeting{font-size:16px;color:#111827;margin-bottom:6px}
.sub{font-size:13px;color:#6B7280;line-height:1.65;margin-bottom:22px}
.pass-img{width:100%;border-radius:8px;display:block;margin-bottom:22px;border:1px solid #E5E7EB}
.card{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:22px}
.card-head{background:#1A3B6E;color:rgba(255,255,255,.6);font-size:9px;letter-spacing:2px;padding:8px 16px;font-weight:700;text-transform:uppercase}
.row{padding:9px 16px;font-size:13px;border-bottom:1px solid #E5E7EB;overflow:hidden}
.row:last-child{border-bottom:none}
.rk{color:#6B7280;float:left}
.rv{font-weight:700;color:#111827;font-family:'Courier New',monospace;float:right;max-width:70%;text-align:right}
.tip{background:#FFF8F0;border:1px solid #F5A623;border-radius:8px;padding:14px 16px;margin-bottom:22px}
.tip p{font-size:13px;color:#92400E;margin:0;line-height:1.6}
.stores p{font-size:10px;color:#6B7280;letter-spacing:1px;text-transform:uppercase;margin:0 0 10px;font-weight:700}
.ptable{width:100%;margin-bottom:22px;table-layout:fixed;border-collapse:separate;border-spacing:8px;}
.ptable td{border:1px solid #E5E7EB;border-radius:6px;padding:12px;text-align:center;background:#fff;vertical-align:middle;}
.ptable img{max-width:100%;max-height:48px;display:block;margin:0 auto;}
.pt-more{font-size:12px;font-weight:600;color:#1A3B6E;}
.footer{background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 32px;text-align:center}
.footer p{font-size:11px;color:#9CA3AF;margin:0;line-height:1.8}
</style></head>
<body>
<div class="wrap">
  <table class="hd" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="middle">
        <h1>GMR AEROCITY</h1>
        <p>NEW DELHI &nbsp;&middot;&nbsp; EXCLUSIVE BOARDING PASS</p>
      </td>
      <td align="right" valign="middle">
        <img src="https://gmr-4a30.onrender.com/gmr-logo.png" alt="GMR" style="height:32px; background:#fff; padding:4px 8px; border-radius:6px; display:block;" />
      </td>
    </tr>
  </table>
  <div class="body">
    <div class="greeting">Hi ${name},</div>
    <div class="sub">Your GMR Aerocity boarding pass is ready show the pass (or scan the QR code) at the billing counter of any partner store to avail your discount</div>

    <img src="cid:boardingpass" alt="GMR Aerocity Pass" class="pass-img" />

    <div class="card">
      <div class="card-head">Pass Details</div>
      <div class="row"><span class="rk">Pass ID</span><span class="rv">${passId}</span></div>
      <div class="row"><span class="rk">Guest</span><span class="rv">${name.toUpperCase()}</span></div>
      <div class="row"><span class="rk">Email</span><span class="rv">${email}</span></div>
      <div class="row"><span class="rk">Phone</span><span class="rv">${phone}</span></div>
      <div class="row"><span class="rk">Valid</span><span class="rv">Only today</span></div>
    </div>

    <div class="tip">
      <p><strong>How to use:</strong> Open this email on your phone or take a screenshot Show the QR code at the billing counter at any GMR Aerocity partner store for your discount</p>
    </div>

    <div class="stores">
      <p>Valid at partner stores</p>
      <table class="ptable" cellpadding="0" cellspacing="0">
        <tr>
          <td><img src="https://gmr-4a30.onrender.com/partners/Roseate%20Del.png" alt="Roseate"/></td>
          <td><img src="https://gmr-4a30.onrender.com/partners/bluetokai.png" alt="Blue Tokai"/></td>
          <td><img src="https://gmr-4a30.onrender.com/partners/burma-logo.webp" alt="Burma Burma"/></td>
        </tr>
        <tr>
          <td><img src="https://gmr-4a30.onrender.com/partners/costa.png" alt="Costa Coffee" style="max-height:56px;"/></td>
          <td><img src="https://gmr-4a30.onrender.com/partners/lemon-tree-citrus-cafe.webp" alt="Citrus Cafe"/></td>
          <td><div class="pt-more">and<br>more</div></td>
        </tr>
      </table>
    </div>
  </div>
  <div class="footer">
    <p>GMR Aerocity New Delhi &nbsp;&middot;&nbsp; Valid only today &nbsp;&middot;&nbsp; Non-transferable<br>
    This is an automated message Please do not reply</p>
  </div>
</div>
</body></html>`;
}

// ── Send email ─────────────────────────────────────────────────────────────
async function sendPassEmail({ toEmail, name, passId, phone, imagePath }) {
  await transporter.sendMail({
    from:    `"GMR Aerocity" <${process.env.GMAIL_USER}>`,
    to:      toEmail,
    subject: `Your GMR Aerocity Boarding Pass — ${passId}`,
    html:    buildEmailHTML({ name, passId, email: toEmail, phone }),
    attachments: [{
      filename: `GMR-Pass-${passId}.png`,
      path:     imagePath,
      cid:      'boardingpass'
    }]
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/send-pass', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name)  return res.status(400).json({ error: 'Name is required.' });
    if (!email) return res.status(400).json({ error: 'Email address is required.' });
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    const passId = generatePassId();
    const cleanPhone = phone.replace(/\s/g, '');
    const displayPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91 ${cleanPhone}`;

    console.log(`Generating pass for ${name} (${passId}) → ${email}`);

    const imagePath = await generatePassImage({
      passId,
      name:  name.toUpperCase(),
      email,
      phone: displayPhone
    });

    console.log(`Sending email to ${email}...`);
    await sendPassEmail({ toEmail: email, name, passId, phone: displayPhone, imagePath });

    console.log(`Done — ${passId}`);
    res.json({ success: true, passId, email });

  } catch (err) {
    console.error('Error:', err.message);
    let msg = 'Failed to send email. Please try again.';
    if (err.message?.includes('Invalid login') || err.message?.includes('Username and Password')) {
      msg = 'Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env';
    }
    res.status(500).json({ error: msg, detail: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nGMR Aerocity Pass Server → http://localhost:${PORT}`);
  if (!process.env.GMAIL_USER) console.warn('WARNING: GMAIL_USER missing in .env');
  else console.log(`Gmail: ${process.env.GMAIL_USER}\n`);
});
