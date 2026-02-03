import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDiffRoi1770128239267 implements MigrationInterface {
    name = 'AddDiffRoi1770128239267'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."diff_roi" ("id" SERIAL NOT NULL, "annotation_id" integer NOT NULL, "roi_name" text NOT NULL, "lfc" real NOT NULL, "auc" real NOT NULL, CONSTRAINT "diff_roi_annotation_uindex" UNIQUE ("annotation_id", "roi_name"), CONSTRAINT "PK_1e8cd6ce84c7af082c10a179d6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "roi_annot_id_index" ON "public"."diff_roi" ("annotation_id") `);
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" ADD CONSTRAINT "FK_00cab624e3493055836af1f50be" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."diff_roi" DROP CONSTRAINT "FK_00cab624e3493055836af1f50be"`);
        await queryRunner.query(`DROP INDEX "public"."roi_annot_id_index"`);
        await queryRunner.query(`DROP TABLE "public"."diff_roi"`);
    }

}
