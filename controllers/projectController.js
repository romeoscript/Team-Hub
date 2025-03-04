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

    console.log(currentUser, 'another', targetTeamId)
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
      }
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

module.exports = {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  deleteProject
};