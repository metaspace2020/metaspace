import {MigrationInterface, QueryRunner} from "typeorm";

export class DatasetProjectRemovePublicationStatus1586869727234 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" DROP COLUMN "publication_status"`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."dataset_project" ADD "publication_status" text NOT NULL DEFAULT 'UNPUBLISHED'`);
    }

}
