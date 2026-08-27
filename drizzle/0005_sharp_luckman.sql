ALTER TABLE `hms_appointments` ADD `archived_at` timestamp;--> statement-breakpoint
ALTER TABLE `hms_appointments` ADD `archived_by_user_id` int;--> statement-breakpoint
ALTER TABLE `hms_patients` ADD `archived_at` timestamp;--> statement-breakpoint
ALTER TABLE `hms_patients` ADD `archived_by_user_id` int;--> statement-breakpoint
ALTER TABLE `hms_appointments` ADD CONSTRAINT `hms_appointments_archived_by_user_id_users_id_fk` FOREIGN KEY (`archived_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_patients` ADD CONSTRAINT `hms_patients_archived_by_user_id_users_id_fk` FOREIGN KEY (`archived_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hms_appointments_archived_idx` ON `hms_appointments` (`archived_at`);--> statement-breakpoint
CREATE INDEX `hms_patients_archived_idx` ON `hms_patients` (`archived_at`);