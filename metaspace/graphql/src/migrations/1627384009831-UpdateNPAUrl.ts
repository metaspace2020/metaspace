import {MigrationInterface, QueryRunner} from "typeorm";

export class UpdateNPAUrl1627384009831 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The WHERE clause matches two rows on prod:
        // id,name,version
        // 36,NPA-2019-08,2019-09-30  // EMBL's copy
        // 356,NPA-EMBL,2019-08       // Another group's private copy

        await queryRunner.query(`
            UPDATE public.molecular_db 
            SET molecule_link_template = 'https://www.npatlas.org/explore/compounds/'
            WHERE name LIKE 'NPA-%' 
            AND version LIKE '2019%';
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert to the old template, which no longer works
        await queryRunner.query(`
            UPDATE public.molecular_db 
            SET molecule_link_template = 'https://www.npatlas.org/joomla/index.php/explore/compounds#npaid='
            WHERE name LIKE 'NPA-%' 
            AND version LIKE '2019%';
        `)
    }

}
