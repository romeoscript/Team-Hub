-- Create the team_invitations table to track email invites
CREATE TABLE team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id),
  email TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by UUID REFERENCES users(id)
);

-- Add index for faster queries on invitation status
CREATE INDEX idx_team_invitations_status ON team_invitations(status);

-- Add index to easily find invitations for a specific email
CREATE INDEX idx_team_invitations_email ON team_invitations(email);