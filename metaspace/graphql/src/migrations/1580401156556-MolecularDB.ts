import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDB1580401156556 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."job" RENAME COLUMN "db_id" TO "moldb_id"`);
        await queryRunner.query(`CREATE TABLE "public"."molecular_db" ("id" SERIAL NOT NULL, "name" text NOT NULL, "version" text NOT NULL, CONSTRAINT "PK_1841660e7287891634f1e73d7f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "public"."molecule" ("id" SERIAL NOT NULL, "mol_id" text NOT NULL, "mol_name" text NOT NULL, "formula" text NOT NULL, "inchi" text, "moldb_id" integer NOT NULL, CONSTRAINT "PK_d9e3f72bdba412e5cbeea2a1915" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_01280507c3bd02500e2861fb27" ON "public"."molecule" ("moldb_id") `);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" SET DEFAULT null`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT (now() at time zone 'utc')`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT (now() at time zone 'utc')`);
        await queryRunner.query(`ALTER TABLE "public"."molecule" ADD CONSTRAINT "FK_01280507c3bd02500e2861fb279" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "public"."job" ADD CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."job" DROP CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93"`);
        await queryRunner.query(`ALTER TABLE "public"."molecule" DROP CONSTRAINT "FK_01280507c3bd02500e2861fb279"`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "finish" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ALTER COLUMN "start" SET DEFAULT timezone('utc'`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "review_token_created_dt" DROP DEFAULT`);
        // await queryRunner.query(`ALTER TABLE "graphql"."project" ALTER COLUMN "created_dt" SET DEFAULT timezone('utc'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01280507c3bd02500e2861fb27"`);
        await queryRunner.query(`DROP TABLE "public"."molecule"`);
        await queryRunner.query(`DROP TABLE "public"."molecular_db"`);
        await queryRunner.query(`ALTER TABLE "public"."job" RENAME COLUMN "moldb_id" TO "db_id"`);
    }

}
