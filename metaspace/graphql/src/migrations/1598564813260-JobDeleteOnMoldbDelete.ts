import {MigrationInterface, QueryRunner} from "typeorm";

export class JobDeleteOnMoldbDelete1598564813260 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."job" DROP CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93"`);
        await queryRunner.query(`ALTER TABLE "public"."job" ADD CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" DROP CONSTRAINT "FK_b0adf5ffef6529f187f48231e38"`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ADD CONSTRAINT "FK_b0adf5ffef6529f187f48231e38" FOREIGN KEY ("moldb_id") REFERENCES "public"."molecular_db"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "public"."job" DROP CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93"`);
        await queryRunner.query(`ALTER TABLE "public"."job" ADD CONSTRAINT "FK_07f17ed55cabe0ef556bc0e0c93" FOREIGN KEY ("moldb_id") REFERENCES "graphql"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" DROP CONSTRAINT "FK_b0adf5ffef6529f187f48231e38"`);
        await queryRunner.query(`ALTER TABLE "graphql"."coloc_job" ADD CONSTRAINT "FK_b0adf5ffef6529f187f48231e38" FOREIGN KEY ("moldb_id") REFERENCES "graphql"."molecular_db"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
