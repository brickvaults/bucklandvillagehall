-- SAMPLE DATA FOR LOCAL TESTING ONLY. These are made-up events, not real Buckland groups.
-- Load with: npm run db:seed:local   (never run against --remote)
DELETE FROM events;
INSERT INTO events (title, category, day_of_week, recurrence, week_of_month, frequency, start_time, end_time, venue, description, cost, contact_name, contact_info, is_published) VALUES
 ('Sample: Morning yoga', 'Fitness', 1, 'weekly', NULL, 'Every week', '09:30', '10:30', 'Main hall', 'Gentle stretching for all abilities. Bring a mat.', '£6 per class', 'Sample organiser', 'yoga@example.com', 1),
 ('Sample: Toddler group', 'Children & families', 2, 'weekly', NULL, 'Every week', '10:00', '11:30', 'Small hall', 'Play, songs and a cuppa for grown-ups.', '£2 per family', '', '', 1),
 ('Sample: Coffee morning', 'Social', 3, 'weekly', NULL, 'Every week', '10:30', '12:00', 'Small hall', 'Drop in for coffee, cake and a chat.', 'Free', '', '', 1),
 ('Sample: Parish council meeting', 'Meetings', 4, 'monthly', 2, '2nd Thursday of the month', '19:30', '21:00', 'Main hall', 'Open to all residents.', '', '', '', 1),
 ('Sample: Short mat bowls', 'Clubs', 4, 'weekly', NULL, 'Every week', '14:00', '16:00', 'Main hall', 'New players always welcome.', '£3', 'Sample captain', '01234 567890', 1),
 ('Sample: Craft circle', 'Arts & crafts', 5, 'monthly', 5, 'Last Friday of the month', '14:00', '16:00', 'Small hall', 'Knitting, sewing and anything crafty.', '£2', '', '', 1),
 ('Sample: Quiz night', 'Social', 6, 'monthly', 1, '1st Saturday of the month', '19:30', '22:00', 'Main hall', 'Teams of up to six. Bring your own drinks and nibbles.', '£5 per person', '', '', 0),
 ('Sample: Garden open day', 'Community', NULL, 'weekly', NULL, 'Dates vary', NULL, NULL, 'Garden', 'Dates announced on the noticeboard.', '', '', '', 1);
