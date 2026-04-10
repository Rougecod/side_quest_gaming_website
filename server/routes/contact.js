const express = require('express');
const { insertContact } = require('../db');
const { sendContactNotification } = require('../email');

const router = express.Router();

/**
 * POST /api/contact
 */
router.post('/', (req, res) => {
  const { name, email, subject, message } = req.body;

  // Validate required fields
  const missing = [];
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!message) missing.push('message');

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email address.',
    });
  }

  // Save to database
  try {
    insertContact.run({
      name: name.trim(),
      email: email.trim(),
      subject: subject ? subject.trim() : null,
      message: message.trim(),
    });
  } catch (err) {
    console.error('Database error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save your message. Please try again.',
    });
  }

  // Fire-and-forget email
  sendContactNotification({
    name: name.trim(),
    email: email.trim(),
    subject: subject ? subject.trim() : null,
    message: message.trim(),
  });

  return res.status(200).json({
    success: true,
    message: 'Your message has been received.',
  });
});

module.exports = router;
