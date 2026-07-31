PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_symptoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_pl` text,
	`name_en` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_symptoms`("id", "name_pl", "name_en", "created_at", "updated_at") SELECT "id", "name_pl", "name_en", "created_at", "updated_at" FROM `symptoms`;--> statement-breakpoint
DROP TABLE `symptoms`;--> statement-breakpoint
ALTER TABLE `__new_symptoms` RENAME TO `symptoms`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `symptoms_name_en_unique` ON `symptoms` (`name_en`);