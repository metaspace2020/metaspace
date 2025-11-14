import {MigrationInterface, QueryRunner} from "typeorm";

export class FixEnrichmentIntegerOverflow1741213105323 implements MigrationInterface {
    name = 'FixEnrichmentIntegerOverflow1741213105323'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the foreign key constraint temporarily
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" DROP CONSTRAINT IF EXISTS "FK_ad0924d2bfb498840a188820a8e"`);
        
        // Change enrichment_db_molecule_mapping.id from SERIAL (integer) to BIGSERIAL (bigint)
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db_molecule_mapping" ALTER COLUMN "id" TYPE bigint`);
        
        // Change enrichment_bootstrap.enrichment_db_molecule_mapping_id from integer to bigint
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "enrichment_db_molecule_mapping_id" TYPE bigint`);
        
        // Update the sequence to use bigint as well
        await queryRunner.query(`ALTER SEQUENCE "public"."enrichment_db_molecule_mapping_id_seq" AS bigint`);
        
        // Recreate the foreign key constraint
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ADD CONSTRAINT "FK_ad0924d2bfb498840a188820a8e" FOREIGN KEY ("enrichment_db_molecule_mapping_id") REFERENCES "public"."enrichment_db_molecule_mapping"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert changes - note: this may fail if there are values > 2^31-1
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" DROP CONSTRAINT IF EXISTS "FK_ad0924d2bfb498840a188820a8e"`);
        await queryRunner.query(`ALTER SEQUENCE "public"."enrichment_db_molecule_mapping_id_seq" AS integer`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "enrichment_db_molecule_mapping_id" TYPE integer`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_db_molecule_mapping" ALTER COLUMN "id" TYPE integer`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ADD CONSTRAINT "FK_ad0924d2bfb498840a188820a8e" FOREIGN KEY ("enrichment_db_molecule_mapping_id") REFERENCES "public"."enrichment_db_molecule_mapping"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
}
