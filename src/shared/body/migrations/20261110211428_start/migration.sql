CREATE TABLE `body_days` (
	`date` text PRIMARY KEY,
	`comment` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`goal` real DEFAULT 0 NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_readings` (
	`metric_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	CONSTRAINT `body_readings_pk` PRIMARY KEY(`metric_id`, `date`),
	CONSTRAINT `fk_body_readings_metric_id_body_metrics_id_fk` FOREIGN KEY (`metric_id`) REFERENCES `body_metrics`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `body_readings_by_date` ON `body_readings` (`date`);