-- NOTE: This script should only take a couple seconds to run. If update-daemon is running, it may
-- hang waiting for update-daemon to release locks on the table.
ALTER TABLE dataset ADD ion_thumbnail text;