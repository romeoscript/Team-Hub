-- First create the users table without the team_id foreign key
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  profile_photo TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  email_verified BOOLEAN DEFAULT FALSE,
  subscribed_to_updates BOOLEAN DEFAULT TRUE,
  verification_token TEXT,
  verification_token_expiry TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Then create the teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES users(id),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add team_id to users table as a separate operation
ALTER TABLE users 
ADD COLUMN team_id UUID REFERENCES teams(id);

-- Finally create the junction table
CREATE TABLE team_editors (
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  PRIMARY KEY (team_id, user_id)
);