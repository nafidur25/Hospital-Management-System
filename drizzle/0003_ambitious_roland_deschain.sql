ALTER TABLE `users` ADD `is_active` enum('yes','no') DEFAULT 'yes' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_active` enum('yes','no') NOT NULL DEFAULT 'yes';--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_uq` UNIQUE(`email`);
