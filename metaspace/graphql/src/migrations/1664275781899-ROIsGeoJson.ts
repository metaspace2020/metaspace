import {MigrationInterface, QueryRunner} from "typeorm";

export class ROIsGeoJson1664275781899 implements MigrationInterface {
    name = 'ROIsGeoJson1664275781899'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" ADD "roi" json`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."dataset" DROP COLUMN "roi"`);
    }

}
