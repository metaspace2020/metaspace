import {MigrationInterface, QueryRunner} from "typeorm";

export class Initial1566825723058 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        // Handle databases that existed before migrations were enabled
        if (!await queryRunner.hasTable('graphql.user')) {
            await queryRunner.query(`CREATE TABLE "graphql"."credentials" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "hash" text, "google_id" text, "email_verification_token" text, "email_verification_token_expires" TIMESTAMP, "email_verified" boolean NOT NULL DEFAULT false, "reset_password_token" text, "reset_password_token_expires" TIMESTAMP, CONSTRAINT "PK_756d8ef9c32d9efde516fb3fcfd" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."group" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "name" text NOT NULL, "short_name" text NOT NULL, "url_slug" text, "group_description" text NOT NULL DEFAULT '', CONSTRAINT "PK_e1cf69cf0597daf3f445ad6cd71" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."user_group" ("user_id" uuid NOT NULL, "group_id" uuid NOT NULL, "role" text NOT NULL, "primary" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_dfec383f504900f9a67e582bf2e" PRIMARY KEY ("user_id", "group_id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."project" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "name" text NOT NULL, "url_slug" text, "is_public" boolean NOT NULL DEFAULT true, "created_dt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'), "project_description" text NOT NULL DEFAULT '', CONSTRAINT "PK_486ca2f737a2dfd930e46d254aa" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."user_project" ("user_id" uuid NOT NULL, "project_id" uuid NOT NULL, "role" text NOT NULL, CONSTRAINT "PK_43a9ad6dfeb462859c77919609d" PRIMARY KEY ("user_id", "project_id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_d99bb7781b0c98876331d19387" ON "graphql"."user_project"("project_id") `);
            await queryRunner.query(`CREATE TABLE "graphql"."dataset" ("id" text NOT NULL, "user_id" uuid NOT NULL, "group_id" uuid, "group_approved" boolean NOT NULL DEFAULT false, "pi_name" text, "pi_email" text, CONSTRAINT "PK_64fe57c57282f8de5caf4adb72f" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."dataset_project" ("dataset_id" text NOT NULL, "project_id" uuid NOT NULL, "approved" boolean NOT NULL, CONSTRAINT "PK_9511b6cda2f4d4299812106cdd4" PRIMARY KEY ("dataset_id", "project_id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."user" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "name" text, "email" text, "not_verified_email" text, "role" text NOT NULL DEFAULT 'user', "credentials_id" uuid NOT NULL, CONSTRAINT "REL_1b5eb1327a74d679537bdc1fa5" UNIQUE ("credentials_id"), CONSTRAINT "PK_ea80e4e2bf12ab8b8b6fca858d7" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."coloc_job" ("id" uuid NOT NULL DEFAULT uuid_generate_v1mc(), "ds_id" text NOT NULL, "mol_db" text, "fdr" numeric(2,2) NOT NULL, "algorithm" text NOT NULL, "start" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'), "finish" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'), "error" text, "sample_ion_ids" integer array NOT NULL, CONSTRAINT "PK_0d9546a0ec598ef6ca4bd835fbf" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."coloc_annotation" ("coloc_job_id" uuid NOT NULL, "ion_id" integer NOT NULL, "coloc_ion_ids" integer array NOT NULL, "coloc_coeffs" real array NOT NULL, CONSTRAINT "PK_53ff928ca335442ba7b20bcbdbf" PRIMARY KEY ("coloc_job_id", "ion_id"))`);
            await queryRunner.query(`CREATE TABLE "graphql"."ion" ("id" SERIAL NOT NULL, "ion" text NOT NULL, "formula" text NOT NULL, "chem_mod" text NOT NULL DEFAULT '', "neutral_loss" text NOT NULL DEFAULT '', "adduct" text NOT NULL, "charge" smallint NOT NULL, CONSTRAINT "PK_1db9e1ff3fe298cf8a50dad80b5" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_38898b2e9fc8e27fee0d34c164" ON "graphql"."ion"("ion") `);
            await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f538e62b7f815edf1a79aa1ee5" ON "graphql"."ion"("formula", "chem_mod", "neutral_loss", "adduct", "charge") `);
            await queryRunner.query(`ALTER TABLE "graphql"."user_group" ADD CONSTRAINT "FK_24850e25a096ba62e57cf5caf45" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."user_group" ADD CONSTRAINT "FK_3c213a8a5e3ac56e0882320af43" FOREIGN KEY ("group_id") REFERENCES "graphql"."group"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."user_project" ADD CONSTRAINT "FK_c103849dd5047c315a8bf3d0a71" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."user_project" ADD CONSTRAINT "FK_d99bb7781b0c98876331d19387c" FOREIGN KEY ("project_id") REFERENCES "graphql"."project"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."dataset" ADD CONSTRAINT "FK_d890658f7d5c8961e0a0cbdbe41" FOREIGN KEY ("user_id") REFERENCES "graphql"."user"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."dataset" ADD CONSTRAINT "FK_9e18e306ae85131c312e538ca1d" FOREIGN KEY ("group_id") REFERENCES "graphql"."group"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" ADD CONSTRAINT "FK_8bb698a02c945dc2a67a2be2e35" FOREIGN KEY ("dataset_id") REFERENCES "graphql"."dataset"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" ADD CONSTRAINT "FK_e192464449c2ac136fd4f00b439" FOREIGN KEY ("project_id") REFERENCES "graphql"."project"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."user" ADD CONSTRAINT "FK_1b5eb1327a74d679537bdc1fa5b" FOREIGN KEY ("credentials_id") REFERENCES "graphql"."credentials"("id")`);
            await queryRunner.query(`ALTER TABLE "graphql"."coloc_annotation" ADD CONSTRAINT "FK_09673424d3aceab89f931b9f20d" FOREIGN KEY ("coloc_job_id") REFERENCES "graphql"."coloc_job"("id") ON DELETE CASCADE`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        if(!process.env.KILL_MY_DATA) {
            throw new Error("Attempted to revert initial migration. This will render the database unusable. Use 'export KILL_MY_DATA=1' if you want to proceed")
        }
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_annotation" DROP CONSTRAINT "FK_09673424d3aceab89f931b9f20d"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user" DROP CONSTRAINT "FK_1b5eb1327a74d679537bdc1fa5b"`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" DROP CONSTRAINT "FK_e192464449c2ac136fd4f00b439"`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" DROP CONSTRAINT "FK_8bb698a02c945dc2a67a2be2e35"`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset" DROP CONSTRAINT "FK_9e18e306ae85131c312e538ca1d"`);
        await queryRunner.query(`ALTER TABLE "graphql"."dataset" DROP CONSTRAINT "FK_d890658f7d5c8961e0a0cbdbe41"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user_project" DROP CONSTRAINT "FK_d99bb7781b0c98876331d19387c"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user_project" DROP CONSTRAINT "FK_c103849dd5047c315a8bf3d0a71"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user_group" DROP CONSTRAINT "FK_3c213a8a5e3ac56e0882320af43"`);
        await queryRunner.query(`ALTER TABLE "graphql"."user_group" DROP CONSTRAINT "FK_24850e25a096ba62e57cf5caf45"`);
        await queryRunner.query(`DROP INDEX "graphql"."IDX_f538e62b7f815edf1a79aa1ee5"`);
        await queryRunner.query(`DROP INDEX "graphql"."IDX_38898b2e9fc8e27fee0d34c164"`);
        await queryRunner.query(`DROP TABLE "graphql"."ion"`);
        await queryRunner.query(`DROP TABLE "graphql"."coloc_annotation"`);
        await queryRunner.query(`DROP TABLE "graphql"."coloc_job"`);
        await queryRunner.query(`DROP TABLE "graphql"."user"`);
        await queryRunner.query(`DROP TABLE "graphql"."dataset_project"`);
        await queryRunner.query(`DROP TABLE "graphql"."dataset"`);
        await queryRunner.query(`DROP INDEX "graphql"."IDX_d99bb7781b0c98876331d19387"`);
        await queryRunner.query(`DROP TABLE "graphql"."user_project"`);
        await queryRunner.query(`DROP TABLE "graphql"."project"`);
        await queryRunner.query(`DROP TABLE "graphql"."user_group"`);
        await queryRunner.query(`DROP TABLE "graphql"."group"`);
        await queryRunner.query(`DROP TABLE "graphql"."credentials"`);
    }

}
