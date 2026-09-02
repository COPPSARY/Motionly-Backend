CREATE TABLE "project_files" (
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_project_id_path_pk" PRIMARY KEY("project_id","path"),
	CONSTRAINT "project_files_path_check" CHECK ("project_files"."path" in ('composition.html', 'styles.css', 'timeline.js', 'index.ts'))
);
--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "saved_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
INSERT INTO "project_files" ("project_id", "path", "content", "content_hash", "updated_at")
SELECT "projects"."id", "project_version_files"."path", "project_version_files"."content", "project_version_files"."content_hash", "project_versions"."created_at"
FROM "projects"
INNER JOIN "project_versions" ON "project_versions"."id" = "projects"."current_version_id"
INNER JOIN "project_version_files" ON "project_version_files"."project_version_id" = "project_versions"."id";--> statement-breakpoint
UPDATE "projects"
SET "source_hash" = COALESCE("project_versions"."source_hash", ''),
    "saved_at" = COALESCE("project_versions"."created_at", "projects"."updated_at")
FROM "project_versions"
WHERE "project_versions"."id" = "projects"."current_version_id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "projects"
		LEFT JOIN "project_files" ON "project_files"."project_id" = "projects"."id"
		GROUP BY "projects"."id"
		HAVING count("project_files"."path") <> 4
	) THEN
		RAISE EXCEPTION 'Rolling snapshot migration stopped: one or more projects do not have exactly four source files';
	END IF;
END $$;--> statement-breakpoint
UPDATE "projects" SET "source_hash" = '' WHERE "source_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "source_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_current_version_id_project_versions_id_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "current_version_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_jobs" DROP CONSTRAINT IF EXISTS "generation_jobs_base_version_id_project_versions_id_fk";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_jobs" DROP CONSTRAINT IF EXISTS "generation_jobs_output_version_id_project_versions_id_fk";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_outputs" DROP CONSTRAINT IF EXISTS "generation_outputs_published_version_id_project_versions_id_fk";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_jobs" DROP COLUMN IF EXISTS "base_version_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_jobs" DROP COLUMN IF EXISTS "output_version_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "generation_outputs" DROP COLUMN IF EXISTS "published_version_id";--> statement-breakpoint
DROP TABLE "project_version_files";--> statement-breakpoint
DROP TABLE "project_versions";
