import {MigrationInterface, QueryRunner} from "typeorm";

export class PlanDescription1736820481622 implements MigrationInterface {
    name = 'PlanDescription1736820481622'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."plan"
            ADD "price" INT DEFAULT 0 NOT NULL,
            ADD "order" INT DEFAULT 0 NOT NULL,
            ADD "description" TEXT;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "public"."plan"
            DROP COLUMN "price",
            DROP COLUMN "order",
            DROP COLUMN "description";
        `);
    }

}
