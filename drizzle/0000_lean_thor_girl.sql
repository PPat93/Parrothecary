CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`quantity_remaining` real NOT NULL,
	`expiry_date` text,
	`expiry_precision` text,
	`lot_number` text,
	`purchase_date` text,
	`purchase_price_minor` integer,
	`purchase_currency` text,
	`fx_rate_to_eur` real,
	`opened_at` text,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`location` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `batches_variant_idx` ON `batches` (`variant_id`);--> statement-breakpoint
CREATE INDEX `batches_status_idx` ON `batches` (`status`);--> statement-breakpoint
CREATE INDEX `batches_expiry_idx` ON `batches` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_alternatives` (
	`product_id` integer NOT NULL,
	`alternative_product_id` integer NOT NULL,
	`relation` text NOT NULL,
	`note` text,
	PRIMARY KEY(`product_id`, `alternative_product_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`alternative_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_substances` (
	`product_id` integer NOT NULL,
	`substance_id` integer NOT NULL,
	`amount_mg` real,
	`amount_text` text,
	PRIMARY KEY(`product_id`, `substance_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`substance_id`) REFERENCES `substances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_symptoms` (
	`product_id` integer NOT NULL,
	`symptom_id` integer NOT NULL,
	PRIMARY KEY(`product_id`, `symptom_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symptom_id`) REFERENCES `symptoms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_alt` text,
	`form` text DEFAULT 'tablet' NOT NULL,
	`strength` text,
	`unit_name` text DEFAULT 'tablet' NOT NULL,
	`manufacturer` text,
	`is_prescription` integer DEFAULT false NOT NULL,
	`has_expiry` integer DEFAULT true NOT NULL,
	`photo_path` text,
	`notes` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_name_alt_idx` ON `products` (`name_alt`);--> statement-breakpoint
CREATE INDEX `products_archived_idx` ON `products` (`archived_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer,
	`variant_id` integer NOT NULL,
	`quantity_packs` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'to_buy' NOT NULL,
	`estimated_price_minor` integer,
	`estimated_currency` text DEFAULT 'PLN',
	`received_batch_id` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`received_batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shopping_items_trip_idx` ON `shopping_items` (`trip_id`);--> statement-breakpoint
CREATE INDEX `shopping_items_status_idx` ON `shopping_items` (`status`);--> statement-breakpoint
CREATE TABLE `substances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_pl` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `substances_name_unique` ON `substances` (`name`);--> statement-breakpoint
CREATE TABLE `symptoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_pl` text NOT NULL,
	`name_en` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `symptoms_name_en_unique` ON `symptoms` (`name_en`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`collection_date` text NOT NULL,
	`order_by_date` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `variant_barcodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'ean13' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variant_barcodes_code_unique` ON `variant_barcodes` (`code`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`pack_size` real NOT NULL,
	`pack_label` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);