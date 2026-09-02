CREATE TABLE IF NOT EXISTS "project_files" (
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_project_id_path_pk" PRIMARY KEY("project_id","path"),
	CONSTRAINT "project_files_path_check" CHECK ("project_files"."path" in ('composition.html', 'styles.css', 'timeline.js', 'index.ts'))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_hash" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "saved_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('public.project_versions') IS NOT NULL
		AND to_regclass('public.project_version_files') IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'current_version_id'
		)
	THEN
		INSERT INTO "project_files" ("project_id", "path", "content", "content_hash", "updated_at")
		SELECT p."id", f."path", f."content", f."content_hash", now()
		FROM "projects" p
		INNER JOIN "project_versions" v ON v."id" = p."current_version_id"
		INNER JOIN "project_version_files" f ON f."project_version_id" = v."id"
		ON CONFLICT ("project_id", "path") DO NOTHING;
		UPDATE "projects" p SET "source_hash" = v."source_hash"
		FROM "project_versions" v
		WHERE v."id" = p."current_version_id" AND p."source_hash" = '';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "project_files" DROP CONSTRAINT IF EXISTS "project_files_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "base_source_hash" text;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "output_source_hash" text;
--> statement-breakpoint
UPDATE "generation_jobs" j SET "base_source_hash" = p."source_hash"
FROM "projects" p WHERE p."id" = j."project_id" AND j."base_source_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ALTER COLUMN "base_source_hash" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generation_input_files" (
	"generation_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "generation_input_files_generation_id_path_pk" PRIMARY KEY("generation_id","path"),
	CONSTRAINT "generation_input_files_path_check" CHECK ("generation_input_files"."path" in ('composition.html', 'styles.css', 'timeline.js', 'index.ts'))
);
--> statement-breakpoint
INSERT INTO "generation_input_files" ("generation_id", "path", "content", "content_hash")
SELECT j."id", f."path", f."content", f."content_hash"
FROM "generation_jobs" j INNER JOIN "project_files" f ON f."project_id" = j."project_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "generation_input_files" DROP CONSTRAINT IF EXISTS "generation_input_files_generation_id_generation_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "generation_input_files" ADD CONSTRAINT "generation_input_files_generation_id_generation_jobs_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD COLUMN IF NOT EXISTS "published_revision" integer;
--> statement-breakpoint
ALTER TABLE "generation_jobs" DROP COLUMN IF EXISTS "base_version_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "generation_jobs" DROP COLUMN IF EXISTS "output_version_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "generation_outputs" DROP COLUMN IF EXISTS "published_version_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "current_version_id" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "project_version_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "project_versions" CASCADE;
