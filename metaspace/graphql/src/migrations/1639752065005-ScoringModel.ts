import {MigrationInterface, QueryRunner} from "typeorm";

export class ScoringModel1639752065005 implements MigrationInterface {
    name = 'ScoringModel1639752065005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."scoring_model" ("id" SERIAL NOT NULL, "name" text NOT NULL, "type" text NOT NULL, "params" json NOT NULL, CONSTRAINT "PK_f4aafae7cbb3f34533cb9f932a6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_842e010e1dfd01fc0005c8ff8c" ON "public"."scoring_model" ("name") `);

        // await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);
        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT (now() at time zone 'utc')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // await queryRunner.query(`ALTER TABLE "public"."dataset_diagnostic" ALTER COLUMN "updated_dt" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`COMMENT ON COLUMN "public"."dataset_diagnostic"."updated_dt" IS NULL`);

        await queryRunner.query(`DROP INDEX "public"."IDX_842e010e1dfd01fc0005c8ff8c"`);
        await queryRunner.query(`DROP TABLE "public"."scoring_model"`);
    }
}
