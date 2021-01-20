import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDBDefaultFlag1594900099381 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`
            ALTER TABLE "public"."molecular_db" ADD "default" boolean NOT NULL DEFAULT false;
            UPDATE "public"."molecular_db" SET "default" = True WHERE name = 'HMDB' AND version = 'v4';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "default"`);
    }

}
