CREATE TABLE `body_photos` (
	`id` text PRIMARY KEY,
	`date` text NOT NULL,
	`pose` text DEFAULT '' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`picture` text NOT NULL,
	`thumbnail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_photos_by_date` ON `body_photos` (`date`);