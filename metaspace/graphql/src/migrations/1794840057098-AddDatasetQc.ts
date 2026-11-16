import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDatasetQc1794840057098 implements MigrationInterface {
    name = 'AddDatasetQc1794840057098'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."dataset_qc" ("ds_id" text NOT NULL, "gate_version" integer NOT NULL, "mode" text NOT NULL DEFAULT 'shadow', "would_block" boolean NOT NULL DEFAULT false, "created_dt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'), "checks" json NOT NULL, "metrics" json NOT NULL, "timings" json NOT NULL, CONSTRAINT "PK_41f545a1448412ff43344f5d847" PRIMARY KEY ("ds_id"))`);
        await queryRunner.query(`ALTER TABLE "public"."dataset_qc" ADD CONSTRAINT "FK_41f545a1448412ff43344f5d847" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset_qc" DROP CONSTRAINT "FK_41f545a1448412ff43344f5d847"`);
        await queryRunner.query(`DROP TABLE "public"."dataset_qc"`);
    }

}
