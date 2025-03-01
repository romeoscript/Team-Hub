// models/index.js
const mongoose = require('mongoose');
require('dotenv').config();

// Connection string
const MONGODB_URI = process.env.MONGO_URI;

// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// User Schema with authentication fields
const userSchema = new mongoose.Schema({
  uid: { 
    type: String, 
    required: true,
    unique: true 
  },
  email: { 
    type: String, 
    required: true,
    unique: true 
  },
  username: { 
    type: String, 
    required: true,
    unique: true 
  },
  password: {
    type: String,
    required: true
  },
  profilePhoto: { 
    type: String 
  },
  role: { 
    type: String,
    enum: ['admin', 'editor', 'user'],
    default: 'user'
  },
  teamId: { 
    type: String 
  },
  emailVerified: { 
    type: Boolean,
    default: false 
  },
  subscribedToUpdates: { 
    type: Boolean,
    default: true 
  },
  verificationToken: {
    type: String
  },
  verificationTokenExpiry: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpiry: {
    type: Date
  }
}, {
  timestamps: true
});

// Team Schema with invite code
const teamSchema = new mongoose.Schema({
  teamId: { 
    type: String, 
    required: true,
    unique: true 
  },
  adminId: { 
    type: String,
    required: true 
  },
  editors: { 
    type: [String] 
  },
  inviteCode: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Create models
const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);

module.exports = {
  User,
  Team
};