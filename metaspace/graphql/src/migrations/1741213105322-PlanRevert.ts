import {MigrationInterface, QueryRunner} from "typeorm";

export class PlanRevert1741213105322 implements MigrationInterface {
    name = 'PlanRevert1741213105322'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop api_usage indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_api_usage_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_api_usage_dataset_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_api_usage_action_dt"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_api_usage_action_type_dataset_type_source"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_api_usage_ip_hash"`);
        
        // Drop plan_rule indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_plan_rule_plan_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_plan_rule_action_type_period_type"`);

        // Remove foreign key constraint but keep plan_id column
        // First, get constraint name
        const foreignKeys = await queryRunner.query(
            `SELECT conname FROM pg_constraint 
             WHERE conrelid = 'graphql.user'::regclass 
             AND contype = 'f' 
             AND conname LIKE '%plan_id%'`
        );
        
        if (foreignKeys && foreignKeys.length > 0) {
            for (const fk of foreignKeys) {
                await queryRunner.query(`ALTER TABLE "graphql"."user" DROP CONSTRAINT "${fk.conname}"`);
            }
        }
        
        // Make sure plan_id is nullable
        await queryRunner.query(`ALTER TABLE "graphql"."user" DROP COLUMN IF EXISTS "plan_id"`);


        
        // Drop tables
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."api_usage"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."plan_rule"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "public"."plan"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "graphql"."user" ADD COLUMN "plan_id" INT`);

        // Recreate plan table
        await queryRunner.query(`
            CREATE TABLE "public"."plan" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "name" text NOT NULL,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "is_active" BOOLEAN DEFAULT TRUE,
                "is_default" BOOLEAN DEFAULT FALSE,
                "price" INT DEFAULT 0 NOT NULL,
                "order" INT DEFAULT 0 NOT NULL,
                "description" TEXT
            )
        `);

        // Recreate plan_rule table
        await queryRunner.query(`
            CREATE TABLE "public"."plan_rule" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "plan_id" INT REFERENCES "public"."plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "action_type" text NOT NULL,
                "period" INT NOT NULL,
                "period_type" text NOT NULL, 
                "limit" INT NOT NULL,
                "type" text,
                "visibility" text, 
                "source" text,
                "created_at" TIMESTAMP DEFAULT NOW()
            )
        `);

        // Recreate api_usage table
        await queryRunner.query(`
            CREATE TABLE "public"."api_usage" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "user_id" uuid REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "dataset_id" text REFERENCES "graphql"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "project_id" uuid REFERENCES "graphql"."project"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "group_id" uuid REFERENCES "graphql"."group"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "action_type" text NOT NULL,
                "type" text,
                "visibility" text, 
                "source" text,
                "can_edit" BOOLEAN DEFAULT FALSE,
                "action_dt" TIMESTAMP,
                "ip_hash" TEXT,
                "device_info" json
            )
        `);

        // Create a default plan with ID 1
        await queryRunner.query(`
            INSERT INTO "public"."plan" (id, name, is_active, is_default) 
            VALUES (1, 'Default Plan', TRUE, TRUE)
        `);
        
        // Reset the sequence to start after our manually inserted ID
        await queryRunner.query(`
            SELECT setval('public.plan_id_seq', (SELECT MAX(id) FROM public.plan), true)
        `);

        // Set NULL for any plan_id that doesn't match existing plans
        await queryRunner.query(`
            UPDATE "graphql"."user" SET "plan_id" = NULL
            WHERE "plan_id" IS NOT NULL AND "plan_id" != 1
        `);
        
        // Re-add foreign key to user table
        await queryRunner.query(`ALTER TABLE "graphql"."user" ADD CONSTRAINT "FK_user_plan_id" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        
        // Recreate api_usage indexes
        await queryRunner.query(`
            CREATE INDEX "idx_api_usage_user_id" ON "public"."api_usage" ("user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_api_usage_dataset_id" ON "public"."api_usage" ("dataset_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_api_usage_action_dt" ON "public"."api_usage" ("action_dt")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_api_usage_action_type_dataset_type_source" ON "public"."api_usage" ("action_type", "type", "source", "visibility")
        `);
        await queryRunner.query(`CREATE INDEX "IDX_api_usage_ip_hash" ON "public"."api_usage" ("ip_hash")`);

        // Recreate plan_rule indexes
        await queryRunner.query(`
            CREATE INDEX "idx_plan_rule_plan_id" ON "public"."plan_rule" ("plan_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_plan_rule_action_type_period_type" ON "public"."plan_rule" ("action_type", "period_type")
        `);
    }
}
