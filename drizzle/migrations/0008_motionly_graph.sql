ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "scenes" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "composition_html" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "timeline_js" text;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE "projects" SET "title" = "name" WHERE "title" IS NULL';
    EXECUTE 'ALTER TABLE "projects" ALTER COLUMN "name" DROP NOT NULL';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "projects" p SET
  "composition_html" = '<template><style>' || COALESCE(s."content", '') || '</style>' || COALESCE(c."content", '') || '</template>',
  "timeline_js" = COALESCE(t."content", 'export function buildTimeline() { return []; }')
FROM "project_files" c
LEFT JOIN "project_files" s ON s."project_id" = c."project_id" AND s."path" = 'styles.css'
LEFT JOIN "project_files" t ON t."project_id" = c."project_id" AND t."path" = 'timeline.js'
WHERE c."project_id" = p."id" AND c."path" = 'composition.html';
--> statement-breakpoint
UPDATE "projects" SET
  "composition_html" = COALESCE("composition_html", '<template><style></style></template>'),
  "timeline_js" = COALESCE("timeline_js", 'export function buildTimeline() { return []; }'),
  "title" = COALESCE("title", 'Untitled project');
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "composition_html" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "timeline_js" SET NOT NULL;
--> statement-breakpoint
CREATE TYPE "message_role" AS ENUM ('user', 'assistant');
--> statement-breakpoint
CREATE TYPE "graph_intent" AS ENUM ('CHAT', 'PLAN', 'CREATE', 'EDIT', 'FIX');
--> statement-breakpoint
CREATE TYPE "generation_run_status" AS ENUM ('COMPLETED', 'FAILED');
--> statement-breakpoint
CREATE TABLE "messages" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict, "role" "message_role" NOT NULL, "content" text NOT NULL, "intent" "graph_intent", "created_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "generation_runs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade, "base_revision" integer NOT NULL, "saved_revision" integer, "intent" "graph_intent" NOT NULL, "model" text NOT NULL, "selected_skills" jsonb DEFAULT '[]'::jsonb NOT NULL, "repair_attempts" integer DEFAULT 0 NOT NULL, "status" "generation_run_status" NOT NULL, "input_tokens" integer, "output_tokens" integer, "latency_ms" integer NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE INDEX "messages_project_created_idx" ON "messages" ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX "generation_runs_project_created_idx" ON "generation_runs" ("project_id", "created_at");
