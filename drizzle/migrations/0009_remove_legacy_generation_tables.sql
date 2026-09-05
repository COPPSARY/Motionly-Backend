ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "generation_id";
--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "attempt_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_tool_calls" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_input_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_output_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_outputs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_attempts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_messages" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_jobs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "generation_threads" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "project_files" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "generation_event_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "generation_message_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "generation_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "generation_intent";
