import {MigrationInterface, QueryRunner} from "typeorm";

export class ImageViewerLink1605737067612 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "graphql"."image_viewer_link" ("id" text NOT NULL, "dataset_id" text NOT NULL, "state" text NOT NULL, "annotation_ids" json NOT NULL, "user_id" uuid, "created_dt" TIMESTAMP NOT NULL, CONSTRAINT "PK_82b03df11df2671c2018755220a" PRIMARY KEY ("id", "dataset_id"))`);
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "is_public" SET DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "is_public" SET DEFAULT true`);
        await queryRunner.query(`DROP TABLE "graphql"."image_viewer_link"`);
    }

}
