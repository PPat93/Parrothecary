CREATE TABLE `travel_kit_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`units` real NOT NULL,
	`packed` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `travel_kit_trip_idx` ON `travel_kit_items` (`trip_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `travel_kit_trip_product_unique` ON `travel_kit_items` (`trip_id`,`product_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `pack_for_travel` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `return_date` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `kind` text DEFAULT 'restock' NOT NULL;