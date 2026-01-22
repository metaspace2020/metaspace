import {MigrationInterface, QueryRunner} from "typeorm";

export class NewsEnhancements1765505200000 implements MigrationInterface {
    name = 'NewsEnhancements1765505200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add show_from and show_until columns to news table for date-based visibility
        await queryRunner.query(`
            ALTER TABLE "public"."news" 
            ADD COLUMN "show_from" TIMESTAMP WITHOUT TIME ZONE,
            ADD COLUMN "show_until" TIMESTAMP WITHOUT TIME ZONE
        `);

        // Create NewsBlacklistUser table for blacklisting specific users
        await queryRunner.query(`
            CREATE TABLE "public"."news_blacklist_user" (
                "id" SERIAL PRIMARY KEY,
                "news_id" uuid NOT NULL REFERENCES "public"."news"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "user_id" uuid NOT NULL REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "created_at" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE ("news_id", "user_id")
            )
        `);

        // Create indexes for news date fields
        await queryRunner.query(`
            CREATE INDEX "idx_news_show_from" ON "public"."news" ("show_from")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_news_show_until" ON "public"."news" ("show_until")
        `);

        // Create composite index for date range queries
        await queryRunner.query(`
            CREATE INDEX "idx_news_show_dates" ON "public"."news" ("show_from", "show_until")
            WHERE "deleted_at" IS NULL
        `);

        // Create indexes for news blacklist user table
        await queryRunner.query(`
            CREATE INDEX "idx_news_blacklist_user_news_id" ON "public"."news_blacklist_user" ("news_id")
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_news_blacklist_user_user_id" ON "public"."news_blacklist_user" ("user_id")
        `);

        // Note: New visibility options (pro_users, non_pro_users, visibility_except) 
        // are handled at the application level and don't require database schema changes
        // as the visibility column already accepts text values
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes for blacklist user table
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_blacklist_user_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_blacklist_user_news_id"`);

        // Drop indexes for date fields
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_show_dates"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_show_until"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_news_show_from"`);

        // Drop blacklist user table
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."news_blacklist_user"`);

        // Drop date columns from news table
        await queryRunner.query(`
            ALTER TABLE "public"."news" 
            DROP COLUMN IF EXISTS "show_until",
            DROP COLUMN IF EXISTS "show_from"
        `);
    }
}