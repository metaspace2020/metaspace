import {MigrationInterface, QueryRunner} from "typeorm";

export class MolecularDbNameVersionSplit1594744305589 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      UPDATE molecular_db SET name = 'ChEBI', version = '2016' WHERE name = 'ChEBI';
      UPDATE molecular_db SET name = 'LIPID_MAPS', version = '2016' WHERE name = 'LIPID_MAPS';
      UPDATE molecular_db SET name = 'SwissLipids', version = '2016' WHERE name = 'SwissLipids';
      UPDATE molecular_db SET name = 'HMDB', version = 'v2.5' WHERE name = 'HMDB-v2.5';
      UPDATE molecular_db SET name = 'HMDB-cotton', version = 'v2.5' WHERE name = 'HMDB-v2.5-cotton';
      UPDATE molecular_db SET name = 'BraChemDB', version = '2018-01' WHERE name = 'BraChemDB-2018-01';
      UPDATE molecular_db SET name = 'ChEBI', version = '2018-01' WHERE name = 'ChEBI-2018-01';
      UPDATE molecular_db SET name = 'HMDB', version = 'v4' WHERE name = 'HMDB-v4';
      UPDATE molecular_db SET name = 'HMDB-endogenous', version = 'v4' WHERE name = 'HMDB-v4-endogenous';
      UPDATE molecular_db SET name = 'LipidMaps', version = '2017-12-12' WHERE name = 'LipidMaps-2017-12-12';
      UPDATE molecular_db SET name = 'PAMDB', version = 'v1.0' WHERE name = 'PAMDB-v1.0';
      UPDATE molecular_db SET name = 'SwissLipids', version = '2018-02-02' WHERE name = 'SwissLipids-2018-02-02';
      UPDATE molecular_db SET name = 'HMDB-cotton', version = 'v4' WHERE name = 'HMDB-v4-cotton';
      UPDATE molecular_db SET name = 'ECMDB', version = '2018-12' WHERE name = 'ECMDB-2018-12';
    `);
    // await queryRunner.query(`ALTER TABLE "public"."molecular_db" ALTER COLUMN "created_dt" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      UPDATE molecular_db SET name = 'ChEBI' WHERE name = 'ChEBI' AND version = '2016';
      UPDATE molecular_db SET name = 'LIPID_MAPS' WHERE name = 'LIPID_MAPS' AND version = '2016';
      UPDATE molecular_db SET name = 'SwissLipids' WHERE name = 'SwissLipids' AND version = '2016';
      UPDATE molecular_db SET name = 'HMDB-v2.5' WHERE name = 'HMDB' AND version = 'v2.5';
      UPDATE molecular_db SET name = 'HMDB-v2.5-cotton' WHERE name = 'HMDB-cotton' AND version = 'v2.5';
      UPDATE molecular_db SET name = 'BraChemDB-2018-01' WHERE name = 'BraChemDB' AND version = '2018-01';
      UPDATE molecular_db SET name = 'ChEBI-2018-01' WHERE name = 'ChEBI' AND version = '2018-01';
      UPDATE molecular_db SET name = 'HMDB-v4' WHERE name = 'HMDB' AND version = 'v4';
      UPDATE molecular_db SET name = 'HMDB-v4-endogenous' WHERE name = 'HMDB-endogenous' AND version = 'v4';
      UPDATE molecular_db SET name = 'LipidMaps-2017-12-12' WHERE name = 'LipidMaps' AND version = '2017-12-12';
      UPDATE molecular_db SET name = 'PAMDB-v1.0' WHERE name = 'PAMDB' AND version = 'v1.0';
      UPDATE molecular_db SET name = 'SwissLipids-2018-02-02' WHERE name = 'SwissLipids' AND version = '2018-02-02';
      UPDATE molecular_db SET name = 'HMDB-v4-cotton' WHERE name = 'HMDB-cotton' AND version = 'v4';
      UPDATE molecular_db SET name = 'ECMDB-2018-12' WHERE name = 'ECMDB' AND version = '2018-12';
    `);
    // await queryRunner.query(`ALTER TABLE "public"."molecular_db" ALTER COLUMN "created_dt" DROP NOT NULL`);
  }

}
