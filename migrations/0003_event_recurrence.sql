-- Events repeat either every week or once a month on a given week (e.g. 2nd Thursday).
-- `frequency` stays as the human-readable label, worked out by the Worker from these.
ALTER TABLE events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'weekly';   -- 'weekly' | 'monthly'
ALTER TABLE events ADD COLUMN week_of_month INTEGER;                       -- 1-4, or 5 = last; monthly only
