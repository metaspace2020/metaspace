import {MigrationInterface, QueryRunner} from "typeorm";

export class DefaultPlan1730826426836 implements MigrationInterface {
    name = 'DefaultPlan1730826426836'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."plan" ADD "is_default" BOOLEAN DEFAULT FALSE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."plan" DROP COLUMN "is_default"`);
    }

}
