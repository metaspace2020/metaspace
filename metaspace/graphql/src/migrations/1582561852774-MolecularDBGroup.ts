import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDBGroup1582561852774 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecule" DROP CONSTRAINT "FK_01280507c3bd02500e2861fb279"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD "group_id" uuid DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" SET DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD CONSTRAINT "molecular_db_uindex" UNIQUE ("group_id", "name", "version")`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" ADD CONSTRAINT "FK_a18f5f7d6cc662006d9c849ea1f" FOREIGN KEY ("group_id") REFERENCES "graphql"."group"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."molecule" ADD CONSTRAINT "FK_01280507c3bd02500e2861fb279" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."molecule" DROP CONSTRAINT "FK_01280507c3bd02500e2861fb279"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP CONSTRAINT "FK_a18f5f7d6cc662006d9c849ea1f"`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP CONSTRAINT "molecular_db_uindex"`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" DROP DEFAULT`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`ALTER TABLE "public"."molecular_db" DROP COLUMN "group_id"`);
        await queryRunner.query(`ALTER TABLE "public"."molecule" ADD CONSTRAINT "FK_01280507c3bd02500e2861fb279" FOREIGN KEY ("moldb_id") REFERENCES "graphql"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
