import {MigrationInterface, QueryRunner} from "typeorm";

export class ApiUsage1727982165857 implements MigrationInterface {
    name = 'ApiUsage1727982165857'
    public async up(queryRunner: QueryRunner): Promise<void> {
        // ENUM('DOWNLOAD', 'PROCESS', 'REPROCESS', 'DELETE', 'EDIT'), action_type
        // ENUM('PUBLIC', 'PRIVATE') NOT NULL, visibility
        // ENUM('WEBAPP', 'API') NOT NULL, source
        // ENUM('DATASET', 'PROJECT', 'GROUP', 'USER') NOT NULL,
        await queryRunner.query(`
            CREATE TABLE "public"."api_usage" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "user_id" uuid REFERENCES "graphql"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "dataset_id" text REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "project_id" text REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "group_id" text REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                "action_type" text NOT NULL,
                "type" text,
                "visibility" text, 
                "source" text,
                "action_dt" TIMESTAMP
            )
        `);

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

        await queryRunner.query(`
            CREATE TABLE "public"."plan" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "name" text NOT NULL,
                "created_at" TIMESTAMP DEFAULT NOW(),
                "is_active" BOOLEAN DEFAULT TRUE
            )
        `);

        //  ENUM('DOWNLOAD', 'PROCESS', 'REPROCESS', 'DELETE', 'EDIT') NOT NULL,
        // ENUM('HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR') NOT NULL,
        await queryRunner.query(`
            CREATE TABLE "public"."plan_rule" (
                "id" SERIAL NOT NULL PRIMARY KEY,
                "plan_id" INT REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
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

        await queryRunner.query(`
            CREATE INDEX "idx_plan_rule_plan_id" ON "public"."plan_rule" ("plan_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_plan_rule_action_type_period_type" ON "public"."plan_rule" ("action_type", "period_type")
        `);

        await queryRunner.query(`ALTER TABLE "graphql"."user" ADD "plan_id" INT REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_api_usage_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_api_usage_dataset_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_api_usage_action_dt"`);
        await queryRunner.query(`DROP INDEX "public"."idx_api_usage_action_type_dataset_type_source"`);
        await queryRunner.query(`DROP INDEX "public"."idx_plan_rule_plan_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_plan_rule_action_type_period_type"`);

        await queryRunner.query(`ALTER TABLE "graphql"."user" DROP COLUMN "plan_id"`);
        await queryRunner.query(`DROP TABLE "public"."api_usage"`);
        await queryRunner.query(`DROP TABLE "public"."plan_rule"`);
        await queryRunner.query(`DROP TABLE "public"."plan"`);
    }
}
