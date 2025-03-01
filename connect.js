const mongoose = require('mongoose');
require('dotenv').config(); // For environment variables


// Connection string - store this in .env file
const MONGODB_URI = process.env.MONGO_URI;



// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
.then(() => console.log('Connected to MongoDB Atlas'))
.catch((err) => console.error('Error connecting to MongoDB:', err));

