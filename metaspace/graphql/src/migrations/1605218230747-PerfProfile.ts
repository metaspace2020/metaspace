import {MigrationInterface, QueryRunner} from "typeorm";

export class PerfProfile1605218230747 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        // The schemas were out of sync with the migrations, and these two changes were missing.
        // Fortunately they're idempotent and hopefully shouldn't cause any issues on computers that already have them
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ALTER COLUMN "created_dt" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "is_public" SET DEFAULT false`);

        await queryRunner.query(`CREATE TABLE "public"."perf_profile" ("id" SERIAL NOT NULL, "task_type" text NOT NULL, "ds_id" text, "start" TIMESTAMP NOT NULL, "finish" TIMESTAMP, "extra_data" json, "logs" text, "error" text, CONSTRAINT "PK_a180e81bc8817e395daf8a5f8ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "public"."perf_profile_entry" ("id" SERIAL NOT NULL, "profile_id" integer NOT NULL, "sequence" integer NOT NULL, "start" TIMESTAMP NOT NULL, "finish" TIMESTAMP NOT NULL, "name" text NOT NULL, "extra_data" json, CONSTRAINT "PK_729ef8c877e7facd61d75e754e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "public"."perf_profile" ADD CONSTRAINT "FK_cea05d4819bacc949a4236b4a8d" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."perf_profile_entry" ADD CONSTRAINT "FK_67cf1a415a181173f111690c70a" FOREIGN KEY ("profile_id") REFERENCES "public"."perf_profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "is_public" SET DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ALTER COLUMN "created_dt" DROP NOT NULL`);

        await queryRunner.query(`ALTER TABLE "public"."perf_profile_entry" DROP CONSTRAINT "FK_67cf1a415a181173f111690c70a"`);
        await queryRunner.query(`ALTER TABLE "public"."perf_profile" DROP CONSTRAINT "FK_cea05d4819bacc949a4236b4a8d"`);
        await queryRunner.query(`DROP TABLE "public"."perf_profile_entry"`);
        await queryRunner.query(`DROP TABLE "public"."perf_profile"`);
    }

}
