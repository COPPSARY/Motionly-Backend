CREATE TABLE "generation_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input_summary" jsonb NOT NULL,
	"output_summary" jsonb,
	"error_code" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_tool_calls_sequence_check" CHECK ("generation_tool_calls"."sequence" >= 1),
	CONSTRAINT "generation_tool_calls_status_check" CHECK ("generation_tool_calls"."status" in ('SUCCEEDED', 'FAILED')),
	CONSTRAINT "generation_tool_calls_duration_check" CHECK ("generation_tool_calls"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_tool_calls" ADD CONSTRAINT "generation_tool_calls_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tool_calls" ADD CONSTRAINT "generation_tool_calls_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_tool_calls_attempt_sequence_unique" ON "generation_tool_calls" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE INDEX "generation_tool_calls_generation_created_idx" ON "generation_tool_calls" USING btree ("generation_id","created_at");