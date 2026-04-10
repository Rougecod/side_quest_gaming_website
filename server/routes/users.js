const express = require('express');
const {
  insertUser,
  getUserById,
  getUserByUsn,
  checkUsnAvailable,
  updateUserLastLogin,
  getWalletTransactionsByUser,
  creditWallet,
} = require('../db');
const { createRazorpayOrder, verifyRazorpaySignature } = require('../lib/paymentGateway');

const router = express.Router();

/**
 * POST /api/users/signup
 * Register a new user with USN
 */
router.post('/signup', (req, res) => {
  const { name, usn, phone, email } = req.body;

  // Validate required fields
  if (!name || !usn || !phone) {
    return res.status(400).json({ success: false, message: 'Name, USN, and phone are required.' });
  }

  // Validate USN: exactly 10 alphanumeric characters
  const cleanUsn = usn.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(cleanUsn)) {
    return res.status(400).json({ success: false, message: 'USN must be exactly 10 alphanumeric characters.' });
  }

  // Validate phone: 10 digits
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ success: false, message: 'Phone number must be 10 digits.' });
  }

  // Check if USN already exists
  const existing = checkUsnAvailable.get(cleanUsn);
  if (existing && existing.count > 0) {
    return res.status(409).json({ success: false, message: 'This USN is already registered. Sign in instead.' });
  }

  try {
    const result = insertUser.run({
      name: name.trim(),
      usn: cleanUsn,
      phone: cleanPhone,
      email: email ? email.trim() : null,
      wallet_balance: 0,
    });

    const user = getUserByUsn.get(cleanUsn);
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        usn: user.usn,
        phone: user.phone,
        email: user.email,
        wallet_balance: Number(user.wallet_balance || 0),
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('User signup error:', err.message);
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, message: 'This USN is already registered. Sign in instead.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to create account. Please try again.' });
  }
});

/**
 * POST /api/users/signin
 * Sign in with USN and last 4 digits of phone
 */
router.post('/signin', (req, res) => {
  const { usn, phone_last4 } = req.body;

  if (!usn || !phone_last4) {
    return res.status(400).json({ success: false, message: 'USN and phone last 4 digits are required.' });
  }

  const cleanUsn = usn.trim().toUpperCase();
  const user = getUserByUsn.get(cleanUsn);

  if (!user) {
    return res.status(404).json({ success: false, message: 'USN not found or phone doesn\'t match.' });
  }

  // Verify last 4 digits of phone
  const userPhoneLast4 = user.phone.slice(-4);
  if (userPhoneLast4 !== phone_last4.trim()) {
    return res.status(401).json({ success: false, message: 'USN not found or phone doesn\'t match.' });
  }

  // Update last login
  updateUserLastLogin.run(user.id);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      usn: user.usn,
      phone: user.phone,
      email: user.email,
      wallet_balance: Number(user.wallet_balance || 0),
      created_at: user.created_at,
    },
  });
});

router.get('/wallet/:usn', (req, res) => {
  const cleanUsn = String(req.params.usn || '').trim().toUpperCase();
  const user = getUserByUsn.get(cleanUsn);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const transactions = getWalletTransactionsByUser.all(user.id).map((tx) => ({
    ...tx,
    amount: Number(tx.amount || 0),
    balance_after: Number(tx.balance_after || 0),
  }));

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      usn: user.usn,
      phone: user.phone,
      email: user.email,
      wallet_balance: Number(user.wallet_balance || 0),
    },
    transactions,
  });
});

router.post('/wallet/recharge-order', async (req, res) => {
  const cleanUsn = String(req.body.usn || '').trim().toUpperCase();
  const amount = Math.max(0, parseInt(req.body.amount || '0', 10));
  const paymentMethod = req.body.payment_method === 'upi' ? 'upi' : 'card';

  if (!cleanUsn) {
    return res.status(400).json({ success: false, message: 'USN is required.' });
  }
  if (amount <= 0) {
    return res.status(400).json({ success: false, message: 'Recharge amount must be greater than zero.' });
  }

  const user = getUserByUsn.get(cleanUsn);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  try {
    const order = await createRazorpayOrder({
      receipt: `wallet-${user.usn}-${Date.now()}`,
      amountPaise: amount * 100,
      notes: {
        wallet_recharge: 'true',
        usn: user.usn,
        user_id: String(user.id),
        preferred_method: paymentMethod,
      },
    });

    if (order.not_configured) {
      return res.status(503).json({
        success: false,
        not_configured: true,
        message: 'Online payment gateway not configured yet.',
      });
    }

    return res.json({
      success: true,
      key_id: order.key_id,
      order: order.order,
      amount,
      amount_paise: amount * 100,
      user: {
        id: user.id,
        name: user.name,
        usn: user.usn,
        wallet_balance: Number(user.wallet_balance || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Unable to create wallet recharge order.' });
  }
});

router.post('/wallet/recharge-verify', (req, res) => {
  const cleanUsn = String(req.body.usn || '').trim().toUpperCase();
  const amount = Math.max(0, parseInt(req.body.amount || '0', 10));
  const paymentMethod = req.body.payment_method === 'upi' ? 'upi' : 'card';
  const orderId = req.body.razorpay_order_id;
  const paymentId = req.body.razorpay_payment_id;
  const signature = req.body.razorpay_signature;

  if (!cleanUsn || amount <= 0 || !orderId || !paymentId || !signature) {
    return res.status(400).json({ success: false, message: 'Missing wallet recharge verification fields.' });
  }

  const user = getUserByUsn.get(cleanUsn);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (!verifyRazorpaySignature({ orderId, paymentId, signature })) {
    return res.status(400).json({ success: false, message: 'Payment verification failed.' });
  }

  const result = creditWallet({
    user_id: user.id,
    amount,
    source_method: paymentMethod,
    external_reference: paymentId,
    note: 'Wallet recharge',
  });

  return res.json({
    success: true,
    wallet_balance: result.balance_after,
    user: {
      id: result.user.id,
      name: result.user.name,
      usn: result.user.usn,
      wallet_balance: Number(result.user.wallet_balance || 0),
    },
  });
});

/**
 * GET /api/users/check-usn?usn=XXXXXXXXXX
 * Check if USN is available for registration
 */
router.get('/check-usn', (req, res) => {
  const { usn } = req.query;
  if (!usn) return res.status(400).json({ available: false });

  const cleanUsn = usn.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(cleanUsn)) {
    return res.json({ available: false, message: 'Invalid USN format' });
  }

  const result = checkUsnAvailable.get(cleanUsn);
  return res.json({ available: result.count === 0 });
});

module.exports = router;
