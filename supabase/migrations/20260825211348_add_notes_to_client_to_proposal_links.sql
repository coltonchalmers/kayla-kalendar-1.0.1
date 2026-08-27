/*
# Add notes_to_client column to proposal_links

1. Changes
- Adds a `notes_to_client` text column (nullable) to the `proposal_links` table.
- This column allows the admin to attach a message to the client when creating a proposal link.
- The application code and TypeScript types already expect this column, but it was never created in the database, causing proposal creation to fail.

2. Security
- No RLS policy changes. The table already has RLS enabled with owner-scoped policies.
- The new column inherits the existing table-level access controls.
*/