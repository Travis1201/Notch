CREATE TABLE `equipment_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`gym_id` text NOT NULL,
	`brand` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `equipment_variants_exercise_gym_idx` ON `equipment_variants` (`exercise_id`,`gym_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text NOT NULL,
	`equipment_type` text NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`rest_seconds` integer,
	`weight_increment` real,
	`rep_floor` integer
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_variant_id` text NOT NULL,
	`target_weight` real NOT NULL,
	`target_reps` integer NOT NULL,
	`created_at` integer NOT NULL,
	`achieved_at` integer,
	FOREIGN KEY (`equipment_variant_id`) REFERENCES `equipment_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gyms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`gym_id` text NOT NULL,
	`template_id` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`current_position` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer,
	FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`equipment_variant_id` text NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`rir` integer NOT NULL,
	`position` integer NOT NULL,
	`logged_at` integer NOT NULL,
	`is_warmup_override` integer,
	`added_weight` real,
	`assistance_weight` real,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_variant_id`) REFERENCES `equipment_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sets_session_idx` ON `sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `sets_equipment_variant_idx` ON `sets` (`equipment_variant_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`unit_preference` text DEFAULT 'lb' NOT NULL,
	`default_rest_seconds` integer DEFAULT 150 NOT NULL,
	`default_weight_increment` real DEFAULT 2.5 NOT NULL,
	`default_rep_floor` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_exercises_template_idx` ON `template_exercises` (`template_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
