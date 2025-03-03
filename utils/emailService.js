// utils/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config();


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS
    }
  });

// Function to send verification email
const sendVerificationEmail = async (email, verificationToken) => {
  // const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email/${verificationToken}`;
  

  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Email Verification',
    html: `
      <h1>Welcome to our platform!</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}" target="_blank">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `
  };

  return transporter.sendMail(mailOptions);
};

const sendTeamInviteEmail = async ({ recipientEmail, senderName, teamName, inviteLink, customMessage }) => {
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: recipientEmail,
    subject: `You've been invited to join ${teamName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 5px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #333;">Team Invitation</h2>
        </div>
        
        <p style="font-size: 16px; line-height: 1.5; color: #333;">
          <strong>${senderName}</strong> has invited you to join <strong>${teamName}</strong> on our platform.
        </p>
        
        ${customMessage ? `
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
          <p style="font-size: 15px; line-height: 1.5; color: #333; font-style: italic;">
            "${customMessage}"
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 10px; text-align: right;">
            - ${senderName}
          </p>
        </div>
        ` : ''}
        
        <p style="font-size: 16px; line-height: 1.5; color: #333;">
          Click the button below to accept this invitation and join the team:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Accept Invitation</a>
        </div>
        
        <p style="font-size: 14px; line-height: 1.5; color: #666;">
          If the button doesn't work, you can copy and paste this link into your browser:
        </p>
        
        <p style="font-size: 14px; word-break: break-all; color: #0066cc;">
          ${inviteLink}
        </p>
        
        <p style="font-size: 14px; line-height: 1.5; color: #666; margin-top: 30px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e1e1e1; text-align: center; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Your App Name. All rights reserved.</p>
        </div>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};


// Function to send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset',
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset. Please click the link below to reset your password:</p>
      <a href="${resetUrl}" target="_blank">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
    `
  };

  return transporter.sendMail(mailOptions);
};

// Function to send team invitation email
// const sendTeamInviteEmail = async (email, inviteLink, teamAdmin) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: 'Team Invitation',
//     html: `
//       <h1>You've Been Invited to Join a Team</h1>
//       <p>${teamAdmin} has invited you to join their team on our platform.</p>
//       <p>Please click the link below to accept the invitation and create your account:</p>
//       <a href="${inviteLink}" target="_blank">Accept Invitation</a>
//       <p>This invitation link will expire in 7 days.</p>
//     `
//   };

//   return transporter.sendMail(mailOptions);
// };

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTeamInviteEmail
};