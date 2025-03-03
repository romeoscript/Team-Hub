// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../utils/supabase');
const { sendVerificationEmail, sendTeamInviteEmail } = require('../utils/emailService');
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
      }
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Check if username is taken
    const { data: usernameExists } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

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

    // Determine role based on invitation code
    let role = 'admin'; // Default role is admin
    let teamId = null;
    
    if (teamInviteCode) {
      // Find team by invite code
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('invite_code', teamInviteCode)
        .maybeSingle();

      if (team) {
        role = 'editor'; // User invited to a team becomes an editor
        teamId = team.id;
      } else {
        return res.status(400).json({ message: 'Invalid team invitation code' });
      }
    }

    // Create new user (without team_id for now if admin)
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{
        id: uid,
        email,
        username,
        password: hashedPassword,
        profile_photo: profilePhoto,
        role,
        team_id: teamId, // This will be null for new admins, updated later
        email_verified: false,
        subscribed_to_updates: subscribedToUpdates,
        verification_token: verificationToken,
        verification_token_expiry: tokenExpiry.toISOString()
      }])
      .select()
      .single();
    
    if (userError || !newUser) {
      console.error('User creation error:', userError);
      return res.status(500).json({ message: 'Error creating user', error: userError?.message });
    }

    // If user is admin and not part of a team, create a new team
    if (role === 'admin' && !teamId) {
      const { data: newTeam, error: teamError } = await supabase
        .from('teams')
        .insert([{
          admin_id: uid, // Now user exists so this is valid
          invite_code: crypto.randomBytes(8).toString('hex')
        }])
        .select()
        .single();
      
      if (teamError || !newTeam) {
        console.error('Team creation error:', teamError);
        return res.status(500).json({ message: 'Error creating team', error: teamError?.message });
      }
      
      teamId = newTeam.id;
      
      // Update user with team_id
      const { error: updateError } = await supabase
        .from('users')
        .update({ team_id: teamId })
        .eq('id', uid);
        
      if (updateError) {
        console.error('Error updating user with team ID:', updateError);
        return res.status(500).json({ message: 'Error updating user with team ID', error: updateError.message });
      }
    }

    // If user was invited to a team, add them to the editors table
    if (teamInviteCode && teamId) {
      const { error: editorError } = await supabase
        .from('team_editors')
        .insert([{
          team_id: teamId,
          user_id: uid
        }]);
      
      if (editorError) {
        console.error('Error adding user as team editor:', editorError);
        // Continue anyway, this is not critical
      }
    }

    // Send response to user immediately before email sending
    res.status(201).json({ 
      message: 'User registered successfully. Please check your email to verify your account.',
      user: {
        uid: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        teamId: teamId, // Use the updated teamId
        profilePhoto: newUser.profile_photo,
        emailVerified: newUser.email_verified,
        subscribedToUpdates: newUser.subscribed_to_updates
      }
    });

    // Send verification email asynchronously after response is sent
    // This prevents the email sending delay from affecting the API response time
    process.nextTick(async () => {
      try {
        await sendVerificationEmail(email, verificationToken);
        console.log(`Verification email sent to ${email}`);
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
        // Consider implementing a retry mechanism or queue here
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
    
    // Find user with matching token and non-expired token
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', token)
      .gt('verification_token_expiry', new Date().toISOString())
      .maybeSingle();

    if (!user) {
      return res.status(400).send(getVerificationFailureHTML('Invalid or expired verification token'));
    }

    // Update user to verified status
    await supabase
      .from('users')
      .update({ 
        email_verified: true,
        verification_token: null,
        verification_token_expiry: null
      })
      .eq('id', user.id);

    // Return success HTML
    return res.send(getVerificationSuccessHTML(user.email));
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).send(getVerificationFailureHTML('Server error during email verification'));
  }
};

// HTML templates - keeping your existing code
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
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.email_verified) {
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
        id: user.id,
        email: user.email,
        role: user.role,
        teamId: user.team_id
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
            uid: user.id,
            email: user.email,
            username: user.username,
            profilePhoto: user.profile_photo,
            role: user.role,
            teamId: user.team_id,
            emailVerified: user.email_verified,
            subscribedToUpdates: user.subscribed_to_updates
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
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Only team admins can generate invite links' });
    }

    // Find team
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', user.team_id)
      .maybeSingle();

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Generate or use existing invite code
    let inviteCode = team.invite_code;
    
    if (!inviteCode) {
      inviteCode = crypto.randomBytes(8).toString('hex');
      
      await supabase
        .from('teams')
        .update({ invite_code: inviteCode })
        .eq('id', team.id);
    }

    const inviteLink = `${process.env.FRONTEND_URL}/signup?teamInvite=${inviteCode}`;

    res.json({ inviteLink });
  } catch (error) {
    console.error('Generate invite error:', error);
    res.status(500).json({ message: 'Server error generating invite link' });
  }
};

// Send team invite via email
const sendInviteEmail = async (req, res) => {
  try {
    const { userId, recipientEmails, customMessage } = req.body;
    
    // Validate recipientEmails is an array
    if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one recipient email' });
    }
    
    // Validate email format for all emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipientEmails.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        message: 'Some email addresses are invalid', 
        invalidEmails 
      });
    }
    
    // Find user and verify they are an admin
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Only team admins can send team invites' });
    }

    // Find team
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', user.team_id)
      .maybeSingle();

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Ensure the team has an invite code
    let inviteCode = team.invite_code;
    if (!inviteCode) {
      inviteCode = crypto.randomBytes(8).toString('hex');
      
      await supabase
        .from('teams')
        .update({ invite_code: inviteCode })
        .eq('id', team.id);
    }

    const inviteLink = `${process.env.FRONTEND_URL}/signup?teamInvite=${inviteCode}`;
    
    // Send invites to all emails
    const results = [];
    for (const email of recipientEmails) {
      try {
        // Record in database
        await supabase.from('team_invitations').insert([{
          team_id: team.id,
          email,
          invite_code: inviteCode,
          invited_by: userId,
          created_at: new Date().toISOString(),
          status: 'pending'
        }]);
        
        // Send email
        await sendTeamInviteEmail({
          recipientEmail: email, 
          senderName: user.username,
          teamName: team.name || 'our team',
          inviteLink,
          customMessage
        });
        
        results.push({ email, status: 'success' });
      } catch (error) {
        results.push({ email, status: 'failed', error: error.message });
      }
    }
    
    res.status(200).json({ 
      message: 'Team invitations processed',
      results,
      successCount: results.filter(r => r.status === 'success').length,
      failureCount: results.filter(r => r.status === 'failed').length
    });
  } catch (error) {
    console.error('Send invite emails error:', error);
    res.status(500).json({ message: 'Server error sending invite emails' });
  }
};

// Resend verification email
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email_verified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 24);

    await supabase
      .from('users')
      .update({ 
        verification_token: verificationToken,
        verification_token_expiry: tokenExpiry.toISOString()
      })
      .eq('id', user.id);

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
  sendInviteEmail,
  resendVerification
};