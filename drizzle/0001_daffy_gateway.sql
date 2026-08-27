CREATE TABLE `hms_clinical_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patient_id` int NOT NULL,
	`appointment_id` int,
	`author_clinician_id` int NOT NULL,
	`author_user_id` int,
	`subjective` text NOT NULL,
	`assessment` text NOT NULL,
	`plan` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hms_clinical_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hms_laboratory_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_code` varchar(28) NOT NULL,
	`patient_id` int NOT NULL,
	`appointment_id` int,
	`ordering_clinician_id` int NOT NULL,
	`author_user_id` int,
	`test_name` varchar(180) NOT NULL,
	`priority` enum('Routine','Urgent') NOT NULL DEFAULT 'Routine',
	`status` enum('Ordered','Collected','Resulted','Cancelled') NOT NULL DEFAULT 'Ordered',
	`clinical_question` text,
	`ordered_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_laboratory_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_laboratory_orders_code_uq` UNIQUE(`order_code`)
);
--> statement-breakpoint
CREATE TABLE `hms_laboratory_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`laboratory_order_id` int NOT NULL,
	`reported_by_clinician_id` int,
	`result_summary` text NOT NULL,
	`reference_range` varchar(160),
	`result_value` varchar(160),
	`reported_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_laboratory_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_lab_results_order_uq` UNIQUE(`laboratory_order_id`)
);
--> statement-breakpoint
CREATE TABLE `hms_prescription_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescription_id` int NOT NULL,
	`medicine_name` varchar(160) NOT NULL,
	`dosage` varchar(120) NOT NULL,
	`route` varchar(80) NOT NULL DEFAULT 'Oral',
	`frequency` varchar(120) NOT NULL,
	`duration_days` int,
	`instructions` text,
	CONSTRAINT `hms_prescription_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hms_prescriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescription_code` varchar(28) NOT NULL,
	`patient_id` int NOT NULL,
	`appointment_id` int,
	`prescriber_clinician_id` int NOT NULL,
	`author_user_id` int,
	`notes` text,
	`status` enum('Active','Completed','Cancelled') NOT NULL DEFAULT 'Active',
	`prescribed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_prescriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_prescriptions_code_uq` UNIQUE(`prescription_code`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','doctor','receptionist','user') NOT NULL DEFAULT 'receptionist';--> statement-breakpoint
UPDATE `users` SET `role` = 'receptionist' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','doctor','receptionist') NOT NULL DEFAULT 'receptionist';--> statement-breakpoint
ALTER TABLE `hms_clinicians` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `hms_clinicians` ADD CONSTRAINT `hms_clinicians_user_uq` UNIQUE(`user_id`);--> statement-breakpoint
ALTER TABLE `hms_clinical_notes` ADD CONSTRAINT `hms_clinical_notes_patient_id_hms_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `hms_patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_clinical_notes` ADD CONSTRAINT `hms_clinical_notes_appointment_id_hms_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `hms_appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_clinical_notes` ADD CONSTRAINT `hms_clinical_notes_author_clinician_id_hms_clinicians_id_fk` FOREIGN KEY (`author_clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_clinical_notes` ADD CONSTRAINT `hms_clinical_notes_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_orders` ADD CONSTRAINT `hms_laboratory_orders_patient_id_hms_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `hms_patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_orders` ADD CONSTRAINT `hms_laboratory_orders_appointment_id_hms_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `hms_appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_orders` ADD CONSTRAINT `hms_laboratory_orders_ordering_clinician_id_hms_clinicians_id_fk` FOREIGN KEY (`ordering_clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_orders` ADD CONSTRAINT `hms_laboratory_orders_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_results` ADD CONSTRAINT `fk_lab_result_order` FOREIGN KEY (`laboratory_order_id`) REFERENCES `hms_laboratory_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_laboratory_results` ADD CONSTRAINT `fk_lab_result_reporter` FOREIGN KEY (`reported_by_clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_prescription_items` ADD CONSTRAINT `fk_rx_item_prescription` FOREIGN KEY (`prescription_id`) REFERENCES `hms_prescriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_prescriptions` ADD CONSTRAINT `fk_rx_patient` FOREIGN KEY (`patient_id`) REFERENCES `hms_patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_prescriptions` ADD CONSTRAINT `fk_rx_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `hms_appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_prescriptions` ADD CONSTRAINT `fk_rx_prescriber` FOREIGN KEY (`prescriber_clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_prescriptions` ADD CONSTRAINT `fk_rx_author` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hms_clinical_notes_patient_idx` ON `hms_clinical_notes` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `hms_lab_orders_patient_idx` ON `hms_laboratory_orders` (`patient_id`,`ordered_at`);--> statement-breakpoint
CREATE INDEX `hms_prescription_items_rx_idx` ON `hms_prescription_items` (`prescription_id`);--> statement-breakpoint
CREATE INDEX `hms_prescriptions_patient_idx` ON `hms_prescriptions` (`patient_id`,`prescribed_at`);--> statement-breakpoint
ALTER TABLE `hms_clinicians` ADD CONSTRAINT `fk_clinician_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
