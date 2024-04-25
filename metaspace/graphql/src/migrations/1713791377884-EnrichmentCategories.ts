import {MigrationInterface, QueryRunner} from "typeorm";

export class EnrichmentCategories1713791377884 implements MigrationInterface {
    name = 'EnrichmentCategories1713791377884'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" ADD "mol_type" text DEFAULT null`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" ADD "category" text DEFAULT null`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" ADD "sub_category" text DEFAULT null`);

        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" DROP CONSTRAINT "enrichment_db_name_key"`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" ADD CONSTRAINT "enrichment_db_name_type_key" UNIQUE ("name", "mol_type")`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" DROP CONSTRAINT "enrichment_db_name_type_key"`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" ADD CONSTRAINT "enrichment_db_name_key" UNIQUE ("name")`);

        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" DROP COLUMN "mol_type"`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" DROP COLUMN "category"`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db" DROP COLUMN "sub_category"`);
    }

}
