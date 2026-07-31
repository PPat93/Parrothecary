CREATE TABLE `dose_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer NOT NULL,
	`date` text NOT NULL,
	`occurrence` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`confirmed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `dose_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `dose_events_schedule_date_idx` ON `dose_events` (`schedule_id`,`date`);--> statement-breakpoint
CREATE INDEX `dose_events_batch_idx` ON `dose_events` (`batch_id`);--> statement-breakpoint
CREATE TABLE `dose_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`dose_units` real NOT NULL,
	`times_per_day` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `dose_schedules_member_idx` ON `dose_schedules` (`member_id`);--> statement-breakpoint
CREATE INDEX `dose_schedules_product_idx` ON `dose_schedules` (`product_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `household_members_archived_idx` ON `household_members` (`archived_at`);