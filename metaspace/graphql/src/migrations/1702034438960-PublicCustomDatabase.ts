import {MigrationInterface, QueryRunner} from "typeorm";

export class PublicCustomDatabase1702034438960 implements MigrationInterface {
    name = 'PublicCustomDatabase1702034438960'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "is_visible" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "is_visible"`);
    }

}
