-- Create the projects table to track team projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX idx_projects_team_id ON projects(team_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_updated_at ON projects(updated_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function on each update
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create a table for project members (for future use)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Add index for faster lookup of project members
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

-- Create a table for project tasks (for future use)
CREATE TABLE project_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for project tasks
CREATE INDEX idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_assigned_to ON project_tasks(assigned_to);
CREATE INDEX idx_project_tasks_status ON project_tasks(status);
CREATE INDEX idx_project_tasks_due_date ON project_tasks(due_date);

-- Create trigger for updating updated_at on tasks
CREATE TRIGGER update_project_tasks_updated_at
BEFORE UPDATE ON project_tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies to restrict access to projects
-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see projects in their team
CREATE POLICY view_team_projects ON projects
  FOR SELECT
  USING (team_id IN (SELECT team_id FROM users WHERE id = auth.uid()));

-- Create policy to allow only admins and project creators to update their projects
CREATE POLICY update_own_projects ON projects
  FOR UPDATE
  USING (
    (created_by = auth.uid()) OR
    (team_id IN (SELECT team_id FROM users WHERE id = auth.uid() AND role = 'admin'))
  );

-- Create policy to allow only admins and project creators to delete their projects
CREATE POLICY delete_own_projects ON projects
  FOR DELETE
  USING (
    (created_by = auth.uid()) OR
    (team_id IN (SELECT team_id FROM users WHERE id = auth.uid() AND role = 'admin'))
  );

-- Create policy to allow team members to insert projects
CREATE POLICY insert_team_projects ON projects
  FOR INSERT
  WITH CHECK (team_id IN (SELECT team_id FROM users WHERE id = auth.uid()));

