CREATE TABLE `hms_appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointment_code` varchar(28) NOT NULL,
	`patient_id` int NOT NULL,
	`clinician_id` int NOT NULL,
	`starts_at` timestamp NOT NULL,
	`ends_at` timestamp NOT NULL,
	`reason` varchar(240) NOT NULL,
	`status` enum('Scheduled','Checked in','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hms_appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_appointments_code_uq` UNIQUE(`appointment_code`)
);
--> statement-breakpoint
CREATE TABLE `hms_availability_windows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clinician_id` int NOT NULL,
	`weekday` int NOT NULL,
	`start_minute` int NOT NULL,
	`end_minute` int NOT NULL,
	`slot_minutes` int NOT NULL DEFAULT 30,
	CONSTRAINT `hms_availability_windows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hms_bills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bill_code` varchar(28) NOT NULL,
	`patient_id` int NOT NULL,
	`appointment_id` int,
	`total_amount` decimal(10,2) NOT NULL,
	`status` enum('Paid','Partial','Due','Cancelled') NOT NULL DEFAULT 'Due',
	`issued_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_bills_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_bills_code_uq` UNIQUE(`bill_code`)
);
--> statement-breakpoint
CREATE TABLE `hms_clinicians` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(140) NOT NULL,
	`specialty` varchar(120) NOT NULL,
	`department` varchar(120) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#007C83',
	`is_active` enum('yes','no') NOT NULL DEFAULT 'yes',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_clinicians_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hms_patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patient_code` varchar(24) NOT NULL,
	`full_name` varchar(140) NOT NULL,
	`date_of_birth` date,
	`gender` enum('Female','Male','Other','Not specified') NOT NULL DEFAULT 'Not specified',
	`phone` varchar(32) NOT NULL,
	`email` varchar(320),
	`care_context` varchar(240) NOT NULL DEFAULT 'Initial assessment',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hms_patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `hms_patients_code_uq` UNIQUE(`patient_code`),
	CONSTRAINT `hms_patients_phone_uq` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `hms_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bill_id` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`method` enum('Cash','Card','Mobile banking','Insurance') NOT NULL DEFAULT 'Cash',
	`received_at` timestamp NOT NULL DEFAULT (now()),
	`recorded_by_user_id` int,
	CONSTRAINT `hms_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `hms_appointments` ADD CONSTRAINT `hms_appointments_patient_id_hms_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `hms_patients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_appointments` ADD CONSTRAINT `hms_appointments_clinician_id_hms_clinicians_id_fk` FOREIGN KEY (`clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_appointments` ADD CONSTRAINT `hms_appointments_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_availability_windows` ADD CONSTRAINT `hms_availability_windows_clinician_id_hms_clinicians_id_fk` FOREIGN KEY (`clinician_id`) REFERENCES `hms_clinicians`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_bills` ADD CONSTRAINT `hms_bills_patient_id_hms_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `hms_patients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_bills` ADD CONSTRAINT `hms_bills_appointment_id_hms_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `hms_appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_payments` ADD CONSTRAINT `hms_payments_bill_id_hms_bills_id_fk` FOREIGN KEY (`bill_id`) REFERENCES `hms_bills`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hms_payments` ADD CONSTRAINT `hms_payments_recorded_by_user_id_users_id_fk` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hms_appointments_clinician_time_idx` ON `hms_appointments` (`clinician_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `hms_appointments_patient_time_idx` ON `hms_appointments` (`patient_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `hms_availability_clinician_day_idx` ON `hms_availability_windows` (`clinician_id`,`weekday`);