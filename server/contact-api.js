const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors()); // configure origin in production

// simple rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 requests per IP per minute
});
app.use('/api/contact', limiter);

// Read SMTP config from environment variables
const {
  MAIL_HOST,
  MAIL_PORT,
  MAIL_USER,
  MAIL_PASS,
  CONTACT_RECIPIENT
} = process.env;

if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS || !CONTACT_RECIPIENT) {
  console.warn('Warning: Missing mail config. Set MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, CONTACT_RECIPIENT in env.');
}

// create transporter
const transporter = nodemailer.createTransport({
  host: MAIL_HOST || 'mail.example.com',
  port: parseInt(MAIL_PORT, 10) || 465,
  secure: String(MAIL_PORT) === '465', // true for 465, false for other ports (587)
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message, hp_name } = req.body || {};

    // Honeypot: if filled => bot
    if (hp_name) {
      return res.status(200).json({ ok: true }); // silently accept
    }

    // basic server-side validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const mailOptions = {
      from: `"${name}" <${MAIL_USER}>`, // sender address (MAIL_USER)
      to: CONTACT_RECIPIENT,
      subject: `[Website Contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <hr/>
        <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
      `
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ ok: true, message: 'Message sent.' });
  } catch (err) {
    console.error('Contact API error:', err);
    return res.status(500).json({ error: 'Server error while sending message.' });
  }
});

// small helper to escape HTML
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// start server when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Contact API listening on port ${PORT}`);
  });
}

module.exports = app;
