// controllers/projectController.js
const supabase = require('../utils/supabase');
const jwt = require('jsonwebtoken');

// Get all projects for a team
const getProjects = async (req, res) => {
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

    // Get all projects for the team
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        status,
        created_at,
        updated_at,
        created_by,
        users (username, profile_photo)
      `)
      .eq('team_id', targetTeamId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return res.status(500).json({ message: 'Error fetching projects', error: error.message });
    }

    res.status(200).json({
      projects: projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
        creatorName: project.users?.username || 'Unknown',
        creatorPhoto: project.users?.profile_photo || null
      }))
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Server error fetching projects', error: error.message });
  }
};

// Create a new project
const createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    const authHeader = req.headers.authorization;

    // Validate input
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Project name is required' });
    }

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

    const userId = decodedToken.user.id;
    const teamId = decodedToken.user.teamId;

    // Create new project
    const { data: project, error } = await supabase
      .from('projects')
      .insert([{
        name,
        description: description || '',
        team_id: teamId,
        created_by: userId,
        status: 'active'
      }])
      .select()
      .single();

    if (error) {
      console.error('Create project error:', error);
      return res.status(500).json({ message: 'Error creating project', error: error.message });
    }

    // Get creator details
    const { data: creator } = await supabase
      .from('users')
      .select('username, profile_photo')
      .eq('id', userId)
      .maybeSingle();

    // Automatically add the creator as a project member
    await supabase
      .from('project_members')
      .insert([{
        project_id: project.id,
        user_id: userId,
        role: 'owner' // Special role for creator
      }]);

    res.status(201).json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
        creatorName: creator?.username || 'Unknown',
        creatorPhoto: creator?.profile_photo || null
      }
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Server error creating project', error: error.message });
  }
};

// Get a single project by ID
const getProjectById = async (req, res) => {
  try {
    const { projectId } = req.params;
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

    // Get the project
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        status,
        team_id,
        created_at,
        updated_at,
        created_by,
        users!created_by (username, profile_photo)
      `)
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      console.error('Get project error:', error);
      return res.status(500).json({ message: 'Error fetching project', error: error.message });
    }

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user belongs to the project's team
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser || currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Get project members
    const { data: projectMembers, error: membersError } = await supabase
      .from('project_members')
      .select(`
        user_id,
        role,
        users (
          id,
          username,
          email,
          profile_photo,
          role
        )
      `)
      .eq('project_id', projectId);

    if (membersError) {
      console.error('Error fetching project members:', membersError);
      // Continue anyway, we'll just return empty members list
    }

    res.status(200).json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        teamId: project.team_id,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        createdBy: project.created_by,
        creatorName: project.users?.username || 'Unknown',
        creatorPhoto: project.users?.profile_photo || null
      },
      members: (projectMembers || []).map(member => ({
        id: member.users.id,
        username: member.users.username,
        email: member.users.email,
        profilePhoto: member.users.profile_photo,
        role: member.users.role,
        projectRole: member.role
      }))
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Server error fetching project', error: error.message });
  }
};

// Update a project
const updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, status } = req.body;
    const authHeader = req.headers.authorization;

    // Verify at least one field to update
    if (!name && !description && !status) {
      return res.status(400).json({ message: 'At least one field to update is required' });
    }

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

    // Get the project to check permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('team_id, created_by')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get user info
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to the project's team
    if (currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Only let admins or project creators update the project
    if (currentUser.role !== 'admin' && project.created_by !== decodedToken.user.id) {
      return res.status(403).json({ message: 'Access denied: You do not have permission to update this project' });
    }

    // Prepare update object
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status) updateData.status = status;
    updateData.updated_at = new Date().toISOString();

    // Update the project
    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Update project error:', error);
      return res.status(500).json({ message: 'Error updating project', error: error.message });
    }

    // Get creator details
    const { data: creator } = await supabase
      .from('users')
      .select('username, profile_photo')
      .eq('id', updatedProject.created_by)
      .maybeSingle();

    res.status(200).json({
      project: {
        id: updatedProject.id,
        name: updatedProject.name,
        description: updatedProject.description,
        status: updatedProject.status,
        createdAt: updatedProject.created_at,
        updatedAt: updatedProject.updated_at,
        createdBy: updatedProject.created_by,
        creatorName: creator?.username || 'Unknown',
        creatorPhoto: creator?.profile_photo || null
      }
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: 'Server error updating project', error: error.message });
  }
};

// Delete a project
const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
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

    // Get the project to check permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('team_id, created_by')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get user info
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to the project's team
    if (currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Only let admins or project creators delete the project
    if (currentUser.role !== 'admin' && project.created_by !== decodedToken.user.id) {
      return res.status(403).json({ message: 'Access denied: You do not have permission to delete this project' });
    }

    // Delete the project
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Delete project error:', error);
      return res.status(500).json({ message: 'Error deleting project', error: error.message });
    }

    res.status(200).json({
      message: 'Project deleted successfully',
      projectId
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Server error deleting project', error: error.message });
  }
};

// Add a member to a project (admin only)
const addProjectMember = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, role = 'member' } = req.body;
    const authHeader = req.headers.authorization;

    // Validate input
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

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

    // Get the project to check permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('team_id, created_by')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get current user info
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to the project's team
    if (currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Only let admins or project creators add members
    if (currentUser.role !== 'admin' && project.created_by !== decodedToken.user.id) {
      return res.status(403).json({ message: 'Access denied: Only admins can add members to projects' });
    }

    // Check if the user being added belongs to the same team
    const { data: userToAdd } = await supabase
      .from('users')
      .select('team_id, username, email, profile_photo, role')
      .eq('id', userId)
      .maybeSingle();

    if (!userToAdd) {
      return res.status(404).json({ message: 'User to add not found' });
    }

    if (userToAdd.team_id !== project.team_id) {
      return res.status(400).json({ message: 'Cannot add a user from a different team' });
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMember) {
      return res.status(400).json({ message: 'User is already a member of this project' });
    }

    // Add user to project
    const { data: membership, error } = await supabase
      .from('project_members')
      .insert([{
        project_id: projectId,
        user_id: userId,
        role: role
      }])
      .select()
      .single();

    if (error) {
      console.error('Add project member error:', error);
      return res.status(500).json({ message: 'Error adding member to project', error: error.message });
    }

    res.status(201).json({
      message: 'Member added to project successfully',
      membership: {
        id: membership.id,
        projectId: membership.project_id,
        userId: membership.user_id,
        role: membership.role,
        user: {
          id: userToAdd.id,
          username: userToAdd.username,
          email: userToAdd.email,
          profilePhoto: userToAdd.profile_photo,
          role: userToAdd.role
        }
      }
    });
  } catch (error) {
    console.error('Add project member error:', error);
    res.status(500).json({ message: 'Server error adding member to project', error: error.message });
  }
};

// Remove a member from a project (admin only)
const removeProjectMember = async (req, res) => {
  try {
    const { projectId, userId } = req.params;
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

    // Get the project to check permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('team_id, created_by')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get current user info
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to the project's team
    if (currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Only let admins or project creators remove members
    if (currentUser.role !== 'admin' && project.created_by !== decodedToken.user.id) {
      return res.status(403).json({ message: 'Access denied: Only admins can remove members from projects' });
    }

    // Check if trying to remove the project creator
    if (userId === project.created_by) {
      return res.status(400).json({ message: 'Cannot remove the project creator from the project' });
    }

    // Check if the membership exists
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      return res.status(404).json({ message: 'User is not a member of this project' });
    }

    // Remove the member
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Remove project member error:', error);
      return res.status(500).json({ message: 'Error removing member from project', error: error.message });
    }

    res.status(200).json({
      message: 'Member removed from project successfully',
      projectId,
      userId
    });
  } catch (error) {
    console.error('Remove project member error:', error);
    res.status(500).json({ message: 'Server error removing member from project', error: error.message });
  }
};

// Get available team members that could be added to a project
const getAvailableTeamMembers = async (req, res) => {
  try {
    const { projectId } = req.params;
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

    // Get the project to check permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('team_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError || !project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get current user info
    const { data: currentUser } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', decodedToken.user.id)
      .maybeSingle();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to the project's team
    if (currentUser.team_id !== project.team_id) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this project' });
    }

    // Get existing project members
    const { data: existingMembers } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);

    const existingMemberIds = (existingMembers || []).map(member => member.user_id);

    // Get all team members who are not already in the project
    const { data: availableMembers, error } = await supabase
      .from('users')
      .select('id, username, email, profile_photo, role')
      .eq('team_id', project.team_id)
      .not('id', 'in', `(${existingMemberIds.join(',')})`)
      .order('username');

    if (error) {
      console.error('Get available members error:', error);
      return res.status(500).json({ message: 'Error fetching available team members', error: error.message });
    }

    res.status(200).json({
      availableMembers: availableMembers.map(member => ({
        id: member.id,
        username: member.username,
        email: member.email,
        profilePhoto: member.profile_photo,
        role: member.role
      }))
    });
  } catch (error) {
    console.error('Get available members error:', error);
    res.status(500).json({ message: 'Server error fetching available team members', error: error.message });
  }
};

module.exports = {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  getAvailableTeamMembers
};