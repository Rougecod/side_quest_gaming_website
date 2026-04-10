const express = require('express');
const { insertFeedback, getBookingByRef } = require('../db');
const { sendContactNotification } = require('../email');
const router = express.Router();

/**
 * POST /api/feedback
 * Save a customer feedback rating
 */
router.post('/', (req, res) => {
  const { booking_ref, phone, overall, quality, staff, value, comment } = req.body;

  if (!overall || !quality || !staff || !value) {
    return res.status(400).json({ success: false, message: 'All rating fields are required (overall, quality, staff, value).' });
  }

  for (const [name, val] of Object.entries({ overall, quality, staff, value })) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1 || n > 5) {
      return res.status(400).json({ success: false, message: `${name} must be between 1 and 5.` });
    }
  }

  try {
    insertFeedback.run({
      booking_ref: booking_ref || null,
      phone: phone || null,
      overall: parseInt(overall),
      quality: parseInt(quality),
      staff: parseInt(staff),
      value: parseInt(value),
      comment: comment ? comment.trim() : null,
    });
  } catch (err) {
    console.error('Feedback save error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save feedback.' });
  }

  return res.json({ success: true, message: 'Thank you for your feedback!' });
});

module.exports = router;
