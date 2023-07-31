import {MigrationInterface, QueryRunner} from "typeorm";

export class DetectabilityPermission1689063013083 implements MigrationInterface {
    name = 'DetectabilityPermission1689063013083'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "graphql"."group_detectability" ("id" SERIAL NOT NULL PRIMARY KEY,  "group_id" uuid REFERENCES "graphql"."group"("id") ON DELETE CASCADE ON UPDATE NO ACTION, "source" text NOT NULL UNIQUE)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "graphql"."group_detectability"`);
    }


}
