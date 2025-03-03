-- Add ON DELETE CASCADE to admin_id in teams table
ALTER TABLE teams
DROP CONSTRAINT teams_admin_id_fkey,
ADD CONSTRAINT teams_admin_id_fkey 
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add ON DELETE SET NULL to team_id in users table
ALTER TABLE users
DROP CONSTRAINT users_team_id_fkey,
ADD CONSTRAINT users_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Add ON DELETE CASCADE to both foreign keys in team_editors table
ALTER TABLE team_editors
DROP CONSTRAINT team_editors_team_id_fkey,
ADD CONSTRAINT team_editors_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE team_editors
DROP CONSTRAINT team_editors_user_id_fkey,
ADD CONSTRAINT team_editors_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;