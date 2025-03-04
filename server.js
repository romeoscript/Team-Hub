// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const upload = require('./utils/multer');
const { updateLastActive, getTeamMembers } = require('./controllers/teamController');
const { createProject, getProjectById, updateProject, deleteProject, getProjects } = require('./controllers/projectController');

require('dotenv').config();

// Import controllers
const {
  signup,
  verifyEmail,
  login,
  generateInvite,
  resendVerification,
  sendInviteEmail
} = require('./controllers/authController');


const app = express();


const corsOptions = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));



app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Auth Routes
app.post('/api/auth/signup', upload.single('profilePhoto'), signup);
app.get('/api/auth/verify-email/:token', verifyEmail);
app.post('/api/auth/login', login);
app.post('/api/auth/generate-invite', generateInvite);
app.post('/api/auth/resend-verification', resendVerification);
app.post('/api/auth/send-invite', sendInviteEmail)
app.get('/api/members/:teamId', getTeamMembers);
app.post('/api/projects', createProject);
app.get('/api/project/:projectId', getProjectById);
app.put('/api/project/:projectId', updateProject);
app.get('/api/projects/:teamId', getProjects);
app.delete('/api/project/:projectId', deleteProject);
app.put('api/members/:userId/last-active', updateLastActive);


app.get('/api/test-db', async (req, res) => {
  try {
    // Get counts of your collections
    const userCount = await User.countDocuments();
    const teamCount = await Team.countDocuments();

    res.json({
      status: 'Database connection working',
      collections: {
        users: userCount,
        teams: teamCount
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ error: 'Database test failed', message: error.message });
  }
});

// Health check route with CORS info
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    cors: {
      allowedOrigins: ['http://localhost:5173', 'https://www.cribhaven.com.ng']
    }
  });
});

// General error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something broke!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});