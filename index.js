// index.js

// 1. Import necessary packages
require('dotenv').config(); // Loads environment variables from a .env file into process.env
const express = require('express');
const path = require('path');

// 2. Initialize the Express app
const app = express();

// 3. Set up the server port
// Use the port from the .env file, or default to 3000
const PORT = process.env.PORT || 3000;

// 4. Set up middleware
// This tells Express to serve static files (like your HTML, CSS, and client-side JS)
// from the 'public' directory.
app.use(express.static(path.join(__dirname, 'public')));

// 5. Define a basic route
// This sends the index.html file when someone visits the root URL (e.g., http://localhost:3000)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. Start the server
app.listen(PORT, () => {
  console.log(Server is running on http://localhost:${PORT});
});