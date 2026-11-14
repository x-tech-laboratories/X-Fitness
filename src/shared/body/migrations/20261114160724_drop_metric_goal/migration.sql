-- Sync's update trigger names every column, so it goes before the column does; sync makes it afresh once the migrations are done.
DROP TRIGGER IF EXISTS `sync_body_metrics_update`;
--> statement-breakpoint
ALTER TABLE `body_metrics` DROP COLUMN `goal`;
