import {MigrationInterface, QueryRunner} from "typeorm";

export class ImageViewerSnapshot1606328021269 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "graphql"."image_viewer_snapshot" ("id" text NOT NULL, "dataset_id" text NOT NULL, "snapshot" text NOT NULL, "annotation_ids" json NOT NULL, "version" integer NOT NULL, "user_id" uuid, "created_dt" TIMESTAMP NOT NULL, CONSTRAINT "PK_afd32494a70db23e295d94436d7" PRIMARY KEY ("id", "dataset_id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`DROP TABLE "graphql"."image_viewer_snapshot"`);
    }

}
