CREATE TABLE "project_version_files" (
	"project_version_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "project_version_files_project_version_id_path_pk" PRIMARY KEY("project_version_id","path"),
	CONSTRAINT "project_version_files_path_check" CHECK ("project_version_files"."path" in ('composition.html', 'styles.css', 'timeline.js', 'index.ts'))
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_hash" text NOT NULL,
	"message" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_versions_number_check" CHECK ("project_versions"."version_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"fps" integer NOT NULL,
	"duration" double precision NOT NULL,
	"current_version_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_width_check" CHECK ("projects"."width" between 1 and 16384),
	CONSTRAINT "projects_height_check" CHECK ("projects"."height" between 1 and 16384),
	CONSTRAINT "projects_fps_check" CHECK ("projects"."fps" between 1 and 240),
	CONSTRAINT "projects_duration_check" CHECK ("projects"."duration" > 0 and "projects"."duration" <= 86400),
	CONSTRAINT "projects_revision_check" CHECK ("projects"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_version_files" ADD CONSTRAINT "project_version_files_project_version_id_project_versions_id_fk" FOREIGN KEY ("project_version_id") REFERENCES "public"."project_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_version_id_project_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."project_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_versions_project_number_unique" ON "project_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "project_versions_project_created_idx" ON "project_versions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_unique" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "projects_workspace_updated_idx" ON "projects" USING btree ("workspace_id","updated_at");