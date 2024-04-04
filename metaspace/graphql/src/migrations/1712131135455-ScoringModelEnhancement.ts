import {MigrationInterface, QueryRunner} from "typeorm";

export class ScoringModelEnhancement1712131135455 implements MigrationInterface {
    name = 'ScoringModelEnhancement1712131135455'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" ADD "is_archived" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" ADD "is_default" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" ADD "created_dt" TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" ADD "version" text NOT NULL DEFAULT 'v1'`);

        await queryRunner.query(`DROP INDEX "public"."IDX_842e010e1dfd01fc0005c8ff8c"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "scoring_model_uindex" ON "public"."scoring_model" ("name", "version")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."scoring_model_uindex"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_842e010e1dfd01fc0005c8ff8c" ON "public"."scoring_model" ("name") `);

        await queryRunner.query(`ALTER TABLE "public"."scoring_model" DROP COLUMN "is_archived"`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" DROP COLUMN "is_default"`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" DROP COLUMN "created_dt"`);
        await queryRunner.query(`ALTER TABLE "public"."scoring_model" DROP COLUMN "version"`);
    }

}
