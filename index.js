// index.js

// 1. Import necessary packages
require('dotenv').config();
const express = require('express');
const path = require('path'); // Fix: do not overwrite path
const bcrypt = require('bcryptjs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
// NEW: Session management packages
const session = require('express-session');
const FileStore = require('session-file-store')(session);

// 2. Set up the database
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [] }).write();

// 3. Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 4. Set up middleware
const staticPath = path.join(__dirname, 'public'); // Use a new variable for static path
app.use(express.static(staticPath));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NEW: Session middleware setup
app.use(session({
  store: new FileStore({ path: './sessions' }), // Stores sessions in a ./sessions directory
  secret: process.env.SESSION_SECRET || 'a very secret key', // Key to sign the session ID cookie
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: 'You are not authorized.' });
  }
};


// 5. Define API Routes

// --- REGISTRATION ROUTES (from previous phase, no changes needed) ---
app.post('/api/register', (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !email || !password) return res.status(400).json({ message: 'Please fill out all required fields.' });
    if (db.get('users').find({ email }).value()) return res.status(409).json({ message: 'User with this email already exists.' });
    
    const secret = speakeasy.generateSecret({ name: `SecureApp (${email})` }); // Use backticks
    const hashedPassword = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    
    const newUser = { id: Date.now().toString(), firstName, lastName, email, password: hashedPassword, tempTwoFaSecret: secret.base32, twoFaEnabled: false };
    db.get('users').push(newUser).write();

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) throw new Error('Could not generate QR code.');
      res.status(200).json({ userId: newUser.id, qrCodeUrl: data_url });
    });
  } catch (error) { res.status(500).json({ message: 'An error occurred.' }); }
});

app.post('/api/verify-2fa', (req, res) => {
  try {
    const { userId, token } = req.body;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const verified = speakeasy.totp.verify({ secret: user.tempTwoFaSecret, encoding: 'base32', token });
    if (verified) {
      db.get('users').find({ id: userId }).assign({ twoFaSecret: user.tempTwoFaSecret, tempTwoFaSecret: undefined, twoFaEnabled: true }).write();
      res.status(200).json({ message: '2FA has been successfully enabled!' });
    } else {
      res.status(400).json({ message: 'Invalid 2FA code.' });
    }
  } catch (error) { res.status(500).json({ message: 'An error occurred.' }); }
});


// --- NEW: LOGIN ROUTES ---

// STEP 1: Password Verification
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.get('users').find({ email }).value();

    if (!user || !user.twoFaEnabled) {
      return res.status(401).json({ message: 'Invalid credentials or 2FA not enabled.' });
    }

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // If password is correct, store user ID in session temporarily for the next step
    req.session.loginChallenge = { userId: user.id };
    res.status(200).json({ message: 'Password correct. Please provide 2FA token.' });

  } catch (error) {
    res.status(500).json({ message: 'An error occurred.' });
  }
});

// STEP 2: 2FA Token Verification
app.post('/api/login/verify', (req, res) => {
  try {
    const { token } = req.body;
    
    // Check if user passed the password check first
    if (!req.session.loginChallenge || !req.session.loginChallenge.userId) {
      return res.status(401).json({ message: 'Please enter your password first.' });
    }

    const userId = req.session.loginChallenge.userId;
    const user = db.get('users').find({ id: userId }).value();
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const verified = speakeasy.totp.verify({ secret: user.twoFaSecret, encoding: 'base32', token });

    if (verified) {
      // 2FA is correct. Finalize login by creating the real session.
      req.session.userId = user.id; // This is what keeps the user logged in
      req.session.loginChallenge = undefined; // Clean up temporary challenge
      res.status(200).json({ message: 'Login successful!' });
    } else {
      res.status(401).json({ message: 'Invalid 2FA code.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'An error occurred.' });
  }
});

// --- NEW: PROTECTED DASHBOARD ROUTE ---
app.get('/api/dashboard', isAuthenticated, (req, res) => {
  const user = db.get('users').find({ id: req.session.userId }).value();
  res.json({ message: `Welcome to your dashboard, ${user.firstName}!` }); // Use backticks
});

// --- NEW: LOGOUT ROUTE ---
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again.' });
    }
    res.clearCookie('connect.sid'); // Clears the session cookie
    res.status(200).json({ message: 'Logout successful.' });
  });
});


// 6. Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`); // Use backticks
});