import {MigrationInterface, QueryRunner} from "typeorm";

export class CreatePublicSchema1567598882740 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        if (!await queryRunner.hasTable('public.dataset')) {
            await queryRunner.query(`CREATE TABLE "public"."dataset" ("id" text NOT NULL, "name" text, "input_path" text, "metadata" json, "config" json, "upload_dt" TIMESTAMP, "status" text, "optical_image" text, "transform" double precision array, "is_public" boolean NOT NULL DEFAULT true, "acq_geometry" json, "ion_img_storage_type" text NOT NULL DEFAULT 'fs', "thumbnail" text, "ion_thumbnail" text, CONSTRAINT "PK_1368c0f3639e45c45be6288a232" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "ind_dataset_name" ON "public"."dataset"("name") `);
            await queryRunner.query(`CREATE TABLE "public"."optical_image" ("id" text NOT NULL, "ds_id" text NOT NULL, "type" text NOT NULL, "zoom" real NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "transform" real array, CONSTRAINT "PK_4793baa152f99f1ad74856aa7b1" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "public"."job" ("id" SERIAL NOT NULL, "db_id" integer, "ds_id" text, "status" text, "start" TIMESTAMP, "finish" TIMESTAMP, CONSTRAINT "PK_456bc75d32d741774ab85e6606a" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "public"."annotation" ("id" SERIAL NOT NULL, "job_id" integer NOT NULL, "formula" text NOT NULL, "chem_mod" text NOT NULL, "neutral_loss" text NOT NULL, "adduct" text NOT NULL, "msm" real NOT NULL, "fdr" real NOT NULL, "stats" json NOT NULL, "iso_image_ids" text array NOT NULL, "off_sample" json, CONSTRAINT "annotation_annotation_uindex" UNIQUE ("job_id", "formula", "chem_mod", "neutral_loss", "adduct"), CONSTRAINT "PK_08d866de448fc977523c0e856e5" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "annotation_job_id_index" ON "public"."annotation"("job_id") `);
            await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
            await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
            await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
            await queryRunner.query(`ALTER TABLE "public"."optical_image" ADD CONSTRAINT "FK_124906daa616c8e1b88645baef0" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE`);
            await queryRunner.query(`ALTER TABLE "public"."job" ADD CONSTRAINT "FK_f6baae98b3a2436b6f98318d5d0" FOREIGN KEY ("ds_id") REFERENCES "public"."dataset"("id") ON DELETE CASCADE`);
            await queryRunner.query(`ALTER TABLE "public"."annotation" ADD CONSTRAINT "FK_bfed30991918671d59fc1f5d5e4" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE CASCADE`);
        } else {
            // Bring foreign key names in line with TypeORM's expectations
            await queryRunner.query(`ALTER TABLE "public"."optical_image" RENAME CONSTRAINT "opt_img_ds_id_fk" TO "FK_124906daa616c8e1b88645baef0"`);
            await queryRunner.query(`ALTER TABLE "public"."job" RENAME CONSTRAINT "job_ds_id_fk" TO "FK_f6baae98b3a2436b6f98318d5d0"`);
            await queryRunner.query(`ALTER TABLE "public"."annotation" RENAME CONSTRAINT "annotation_job_id_fk" TO "FK_bfed30991918671d59fc1f5d5e4"`);
            // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
            // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
            // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."optical_image" RENAME CONSTRAINT "FK_124906daa616c8e1b88645baef0" TO "opt_img_ds_id_fk"`);
        await queryRunner.query(`ALTER TABLE "public"."job" RENAME CONSTRAINT "FK_f6baae98b3a2436b6f98318d5d0" TO "job_ds_id_fk"`);
        await queryRunner.query(`ALTER TABLE "public"."annotation" RENAME CONSTRAINT "FK_bfed30991918671d59fc1f5d5e4" TO "annotation_job_id_fk"`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);

    }

}
