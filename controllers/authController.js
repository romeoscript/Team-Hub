// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Team } = require('../models');
const { sendVerificationEmail } = require('../utils/emailService');
const upload = require('../utils/multer');
const cloudinary = require('../utils/cloudinary');

// User registration
const signup = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      username, 
      subscribedToUpdates = true, 
      teamInviteCode 
    } = req.body;
    
    let profilePhoto = null;

    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'profile_photos',
          transformation: [
            { width: 500, height: 500, crop: 'fill' },
            { quality: 'auto' }
          ]
        });
        profilePhoto = result.secure_url;
      } catch (uploadError) {
        console.error('Profile photo upload failed:', uploadError);
        // Continue with signup even if photo upload fails
      }
    }
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Check if username is taken
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24); // Token valid for 24 hours

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate unique UID
    const uid = crypto.randomBytes(16).toString('hex');

    // Determine role and teamId based on invitation code
    let role = 'admin'; // Default role is admin
    let teamId = null;
    let team = null;

    if (teamInviteCode) {
      console.log(Team,'another')
      // Find team by invite code
      team = await Team.findOne({ inviteCode: teamInviteCode });
      if (team) {
        role = 'editor'; // User invited to a team becomes an editor
        teamId = team.teamId;
      } else {
        return res.status(400).json({ message: 'Invalid team invitation code' });
      }
    } else {
      // Create a new team for this admin user
      const newTeamId = 'team_' + crypto.randomBytes(8).toString('hex');
      team = new Team({
        teamId: newTeamId,
        adminId: uid,
        editors: [],
        inviteCode: crypto.randomBytes(8).toString('hex') // Generate team invite code
      });
      await team.save();
      teamId = newTeamId;
    }

    // Create new user
    const newUser = new User({
      uid,
      email,
      username,
      password: hashedPassword,
      profilePhoto,
      role,
      teamId,
      emailVerified: false,
      subscribedToUpdates,
      verificationToken,
      verificationTokenExpiry: tokenExpiry
    });

    await newUser.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    // If user was invited to a team, add them to the editors array
    if (teamInviteCode && team) {
      team.editors.push(uid);
      await team.save();
    }

    res.status(201).json({ 
      message: 'User registered successfully. Please check your email to verify your account.',
      user: {
        uid: newUser.uid,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        teamId: newUser.teamId,
        profilePhoto: newUser.profilePhoto,
        emailVerified: newUser.emailVerified,
        subscribedToUpdates: newUser.subscribedToUpdates
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};


// Email verification

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({ 
      verificationToken: token,
      verificationTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).send(getVerificationFailureHTML('Invalid or expired verification token'));
    }

    // Update user to verified status
    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    // Return success HTML instead of JSON
    return res.send(getVerificationSuccessHTML(user.email));
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).send(getVerificationFailureHTML('Server error during email verification'));
  }
};


function getVerificationSuccessHTML(email) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Email Verified Successfully</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
            text-align: center; 
            background-color: #f5f5f5;
          }
          .success-container { 
            background-color: white; 
            border-radius: 10px; 
            padding: 40px 30px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
            margin-top: 50px;
          }
          .success-icon { 
            color: #4CAF50; 
            font-size: 70px; 
            margin-bottom: 20px; 
            background-color: #e8f5e9;
            width: 100px;
            height: 100px;
            line-height: 100px;
            border-radius: 50%;
            margin: 0 auto 30px auto;
          }
          h1 { 
            color: #333; 
            margin-bottom: 20px; 
          }
          p { 
            color: #666; 
            line-height: 1.6; 
            margin-bottom: 25px;
          }
          .btn { 
            display: inline-block; 
            background-color: #4CAF50; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: 600;
            transition: all 0.3s ease;
          }
          .btn:hover {
            background-color: #388E3C;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
          }
        </style>
      </head>
      <body>
        <div class="success-container">
          <div class="success-icon">✓</div>
          <h1>Email Verified Successfully!</h1>
          <p>Thank you for verifying your email address: <strong>${email}</strong></p>
          <p>Your account is now active and you can access all features of our platform.</p>
          <a href="${process.env.FRONTEND_URL}/login" class="btn">Go to Login</a>
        </div>
      </body>
    </html>
  `;
}

// HTML template for verification failure
function getVerificationFailureHTML(errorMessage) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Email Verification Failed</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
            text-align: center; 
            background-color: #f5f5f5;
          }
          .error-container { 
            background-color: white; 
            border-radius: 10px; 
            padding: 40px 30px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            margin-top: 50px;
          }
          .error-icon { 
            color: #f44336; 
            font-size: 70px; 
            margin-bottom: 20px; 
            background-color: #ffebee;
            width: 100px;
            height: 100px;
            line-height: 100px;
            border-radius: 50%;
            margin: 0 auto 30px auto;
          }
          h1 { 
            color: #333; 
            margin-bottom: 20px; 
          }
          p { 
            color: #666; 
            line-height: 1.6; 
            margin-bottom: 25px; 
          }
          .btn { 
            display: inline-block; 
            background-color: #2196F3; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: 600;
            transition: all 0.3s ease;
          }
          .btn:hover {
            background-color: #1976D2;
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">✗</div>
          <h1>Email Verification Failed</h1>
          <p>${errorMessage}</p>
          <p>You can request a new verification email from your account.</p>
          <a href="${process.env.FRONTEND_URL}/resend-verification" class="btn">Request New Verification</a>
        </div>
      </body>
    </html>
  `;
}
// User login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const payload = {
      user: {
        id: user.uid,
        email: user.email,
        role: user.role,
        teamId: user.teamId
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ 
          token,
          user: {
            uid: user.uid,
            email: user.email,
            username: user.username,
            profilePhoto: user.profilePhoto,
            role: user.role,
            teamId: user.teamId,
            emailVerified: user.emailVerified,
            subscribedToUpdates: user.subscribedToUpdates
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Generate team invite link
const generateInvite = async (req, res) => {
  try {
    const { userId } = req.body;

    // Find user
    const user = await User.findOne({ uid: userId });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only team admins can generate invite links' });
    }

    // Find team
    const team = await Team.findOne({ teamId: user.teamId });
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Generate or use existing invite code
    if (!team.inviteCode) {
      team.inviteCode = crypto.randomBytes(8).toString('hex');
      await team.save();
    }

    const inviteLink = `${process.env.FRONTEND_URL}/signup?teamInvite=${team.inviteCode}`;

    res.json({ inviteLink });
  } catch (error) {
    console.error('Generate invite error:', error);
    res.status(500).json({ message: 'Server error generating invite link' });
  }
};

// Resend verification email
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);

    user.verificationToken = verificationToken;
    user.verificationTokenExpiry = tokenExpiry;
    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(200).json({ message: 'Verification email resent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error resending verification email' });
  }
};

module.exports = {
  signup,
  verifyEmail,
  login,
  generateInvite,
  resendVerification
};