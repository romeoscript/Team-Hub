// controllers/teamController.js
const supabase = require('../utils/supabase');
const jwt = require('jsonwebtoken');

// Get all team members for a given team
const getTeamMembers = async (req, res) => {
  try {
    const { teamId } = req.params;
    const authHeader = req.headers.authorization;

    // Verify authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Check if user is a member of the requested team
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If teamId param is 'current', use the user's current team
    const targetTeamId = teamId === 'current' ? currentUser.team_id : teamId;

    // Check if the user belongs to the requested team
    if (currentUser.team_id !== targetTeamId) {
      return res.status(403).json({ message: 'Access denied: You do not belong to this team' });
    }

    // Get all members in the team
    const { data: members, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        email,
        profile_photo,
        role,
        email_verified,
        created_at
      `)
      .eq('team_id', targetTeamId);

    if (error) {
      console.error('Error fetching team members:', error);
      return res.status(500).json({ message: 'Error fetching team members', error: error.message });
    }

    // Get the team details
    const { data: team, teamError } = await supabase
      .from('teams')
      .select('admin_id, created_at')
      .eq('id', targetTeamId)
      .maybeSingle();

    if (teamError) {
      console.error('Error fetching team details:', teamError);
      return res.status(500).json({ message: 'Error fetching team details', error: teamError.message });
    }

    // Get pending invitations
    const { data: invitations, inviteError } = await supabase
      .from('team_invitations')
      .select(`*`)
      .eq('team_id', targetTeamId);

    if (inviteError) {
      console.error('Error fetching team invitations:', inviteError);
      // Continue anyway, this is not critical
    }

    // Format invitations for response
    const formattedInvitations = (invitations || []).map(invitation => ({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      createdAt: invitation.created_at,
      invitedBy: invitation.invited_by,
    }));

    // Format and return response
    res.status(200).json({
      team: {
        id: targetTeamId,
        name: team.name || 'My Team',
        adminId: team.admin_id,
        createdAt: team.created_at
      },
      members: members.map(member => ({
        id: member.id,
        username: member.username,
        email: member.email,
        profilePhoto: member.profile_photo,
        role: member.role,
        emailVerified: member.email_verified,
        lastActive: member.last_active,
        createdAt: member.created_at,
        isAdmin: member.id === team.admin_id // Convenience property
      })),
      invitations: formattedInvitations
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ message: 'Server error fetching team members', error: error.message });
  }
};

// Update last active timestamp for a user
const updateLastActive = async (req, res) => {
  try {
    const { userId } = req.params;
    const authHeader = req.headers.authorization;

    // Verify authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Only allow users to update their own last_active status
    if (decodedToken.user.id !== userId) {
      return res.status(403).json({ message: 'Forbidden: Cannot update another user\'s status' });
    }

    // Update last_active timestamp
    const { error } = await supabase
      .from('users')
      .update({ last_active: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Update last active error:', error);
      return res.status(500).json({ message: 'Error updating last active status', error: error.message });
    }

    res.status(200).json({ message: 'Last active status updated successfully' });
  } catch (error) {
    console.error('Update last active error:', error);
    res.status(500).json({ message: 'Server error updating last active status', error: error.message });
  }
};

// Cancel an invitation
const cancelInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const authHeader = req.headers.authorization;

    // Verify authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Get the user and their role
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only admins can cancel invitations
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only team admins can cancel invitations' });
    }

    // Get the invitation to verify it belongs to the user's team
    const { data: invitation } = await supabase
      .from('team_invitations')
      .select('team_id')
      .eq('id', invitationId)
      .maybeSingle();

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Verify the invitation belongs to the user's team
    if (invitation.team_id !== currentUser.team_id) {
      return res.status(403).json({ message: 'Access denied: This invitation does not belong to your team' });
    }

    // Delete or update the invitation (depending on how you want to handle it)
    // Option 1: Delete the invitation
    const { error } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId);

    // Option 2: Update status to 'canceled' (uncomment if you want this instead)
    /*
    const { error } = await supabase
      .from('team_invitations')
      .update({ status: 'canceled' })
      .eq('id', invitationId);
    */

    if (error) {
      console.error('Cancel invitation error:', error);
      return res.status(500).json({ message: 'Error canceling invitation', error: error.message });
    }

    res.status(200).json({ message: 'Invitation canceled successfully' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ message: 'Server error canceling invitation', error: error.message });
  }
};

module.exports = {
  getTeamMembers,
  updateLastActive,
  cancelInvitation
};