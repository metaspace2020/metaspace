import {MigrationInterface, QueryRunner} from "typeorm";

export class News1765504978606 implements MigrationInterface {
    name = 'News1765504978606'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create News table
        await queryRunner.query(`
            CREATE TABLE "public"."news" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v1mc(),
                "title" text NOT NULL,
                "content" text NOT NULL,
                "type" text NOT NULL DEFAULT 'news',
                "visibility" text NOT NULL DEFAULT 'logged_users',
                "show_on_home_page" BOOLEAN DEFAULT FALSE,
                "is_visible" BOOLEAN DEFAULT TRUE,
                "created_by" uuid REFERENCES "graphql"."user"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
                "created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                "updated_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                "deleted_at" TIMESTAMP WITHOUT TIME ZONE
            )
        `);

        // Create index on created_at for sorting
        await queryRunner.query(`
            CREATE INDEX "idx_news_created_at" ON "public"."news" ("created_at" DESC)
        `);

        // Create index on title for sorting and searching
        await queryRunner.query(`
            CREATE INDEX "idx_news_title" ON "public"."news" ("title")
        `);

        // Create index on type for filtering
        await queryRunner.query(`
            CREATE INDEX "idx_news_type" ON "public"."news" ("type")
        `);

        // Create index on visibility for filtering
        await queryRunner.query(`
            CREATE INDEX "idx_news_visibility" ON "public"."news" ("visibility")
        `);

        // Create composite index for home page queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_show_on_home_visible" ON "public"."news" ("show_on_home_page", "is_visible", "created_at" DESC)
            WHERE "deleted_at" IS NULL
        `);

        // Create index for active news (not deleted)
        await queryRunner.query(`
            CREATE INDEX "idx_news_active" ON "public"."news" ("is_visible")
            WHERE "deleted_at" IS NULL
        `);

        // Create NewsEvent table to track user interactions
        await queryRunner.query(`
            CREATE TABLE "public"."news_event" (
                "id" SERIAL PRIMARY KEY,
                "news_id" uuid NOT NULL REFERENCES "public"."news"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "user_id" uuid REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "hashed_ip" text,
                "event_type" text NOT NULL,
                "link_url" text,
                "created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
        `);

        // Create index on news_id for quick lookups
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_news_id" ON "public"."news_event" ("news_id")
        `);

        // Create index on user_id for user-specific queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_user_id" ON "public"."news_event" ("user_id")
        `);

        // Create index on hashed_ip for anonymous user queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_hashed_ip" ON "public"."news_event" ("hashed_ip")
        `);

        // Create composite index for checking user events per news
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_user_news" ON "public"."news_event" ("user_id", "news_id", "event_type")
        `);

        // Create composite index for checking anonymous user events per news
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_ip_news" ON "public"."news_event" ("hashed_ip", "news_id", "event_type")
        `);

        // Create index on event_type for analytics
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_type" ON "public"."news_event" ("event_type")
        `);

        // Create index on created_at for time-based queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_event_created_at" ON "public"."news_event" ("created_at")
        `);

        // Create NewsTargetUser table for specific user targeting
        await queryRunner.query(`
            CREATE TABLE "public"."news_target_user" (
                "id" SERIAL PRIMARY KEY,
                "news_id" uuid NOT NULL REFERENCES "public"."news"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "user_id" uuid NOT NULL REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE ("news_id", "user_id")
            )
        `);

        // Create index on news_id for quick lookups
        await queryRunner.query(`
            CREATE INDEX "idx_news_target_user_news_id" ON "public"."news_target_user" ("news_id")
        `);

        // Create index on user_id for user-specific queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_target_user_user_id" ON "public"."news_target_user" ("user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_target_user_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_target_user_news_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_ip_news"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_user_news"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_hashed_ip"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_event_news_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_show_on_home_visible"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_visibility"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_title"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_created_at"`);

        // Drop tables
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."news_target_user"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."news_event"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."news"`);
    }

}
