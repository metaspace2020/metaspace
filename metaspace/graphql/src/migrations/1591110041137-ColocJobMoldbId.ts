import {MigrationInterface, QueryRunner} from "typeorm";

export class ColocJobMoldbId1591110041137 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE graphql.coloc_job ADD moldb_id integer`);
        await queryRunner.query(
          `UPDATE graphql.coloc_job SET moldb_id = mdb.id
            FROM (SELECT id, name FROM public.molecular_db) AS mdb
            WHERE graphql.coloc_job.mol_db = mdb.name`
        );
        await queryRunner.query(`ALTER TABLE graphql.coloc_job ALTER COLUMN moldb_id SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE graphql.coloc_job DROP COLUMN mol_db`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ADD CONSTRAINT "FK_b0adf5ffef6529f187f48231e38" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(`ALTER TABLE "public"."job" ALTER COLUMN "moldb_id" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."job" ALTER COLUMN "moldb_id" DROP NOT NULL`);

        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" DROP CONSTRAINT "FK_b0adf5ffef6529f187f48231e38"`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ADD "mol_db" text`);
        await queryRunner.query(
          `UPDATE graphql.coloc_job SET mol_db = mdb.name
            FROM (SELECT id, name FROM public.molecular_db) AS mdb
            WHERE graphql.coloc_job.moldb_id = mdb.id`
        );
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" DROP COLUMN "moldb_id"`);
    }

}
