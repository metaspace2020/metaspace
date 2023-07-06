import {MigrationInterface, QueryRunner} from "typeorm";

export class LIONFdrTypeChange1686651472177 implements MigrationInterface {
    name = 'LIONFdrTypeChange1686651472177'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "fdr" TYPE real USING "fdr"::real`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "fdr" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "fdr" TYPE numeric(2,2) USING ("fdr"::numeric(2,2))`);
        await queryRunner.query(`ALTER TABLE "public"."enrichment_bootstrap" ALTER COLUMN "fdr" SET NOT NULL`);
    }

}
