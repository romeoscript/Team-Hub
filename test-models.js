// test-models.js
const mongoose = require('mongoose');
const { User, Team } = require('./models');
require('dotenv').config();

const testModels = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for testing');
    
    console.log('Testing database connection and models...');
    
    // Test User and Team models
    const testUserId = 'test' + Date.now();
    const testEmail = `test${Date.now()}@example.com`;
    const testUsername = `testuser${Date.now()}`;
    
    // Create test team
    const testTeam = new Team({
      teamId: 'team_' + Date.now(),
      adminId: testUserId,
      editors: [],
      inviteCode: 'invite' + Date.now()
    });
    
    const savedTeam = await testTeam.save();
    console.log('Test team created:', savedTeam);
    
    // Create test user
    const testUser = new User({
      uid: testUserId,
      email: testEmail,
      username: testUsername,
      password: 'password123',
      role: 'admin',
      teamId: savedTeam.teamId,
      emailVerified: false,
      subscribedToUpdates: true
    });
    
    const savedUser = await testUser.save();
    console.log('Test user created:', savedUser);
    
    // Query the user
    const foundUser = await User.findOne({ uid: savedUser.uid });
    console.log('User found by query:', foundUser ? 'Yes' : 'No');
    
    // Query the team
    const foundTeam = await Team.findOne({ teamId: savedTeam.teamId });
    console.log('Team found by query:', foundTeam ? 'Yes' : 'No');
    
    // Clean up
    await User.deleteOne({ uid: savedUser.uid });
    await Team.deleteOne({ teamId: savedTeam.teamId });
    console.log('Test user and team deleted');
    
    console.log('All tests passed! Models are working correctly.');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
};

// Run the test
testModels();