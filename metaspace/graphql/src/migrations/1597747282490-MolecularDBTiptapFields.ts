import {MigrationInterface, QueryRunner} from "typeorm";

export class MolDBTiptapFields1597747282490 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`UPDATE public.molecular_db SET description = NULL WHERE description = ''`);
        await queryRunner.query(`
            UPDATE public.molecular_db
            SET description = jsonb_set(
                '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": ""}]}]}'::jsonb,
                '{content, 0, content, 0, text}',
                to_jsonb(description)
            )::json
            WHERE description IS NOT NULL AND description NOT LIKE '{%}';
        `);

        await queryRunner.query(`UPDATE public.molecular_db SET citation = NULL WHERE citation = ''`);
        await queryRunner.query(`
            UPDATE public.molecular_db
            SET citation = jsonb_set(
                '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": ""}]}]}'::jsonb,
                '{content, 0, content, 0, text}',
                to_jsonb(citation)
            )::json
            WHERE citation IS NOT NULL AND citation NOT LIKE '{%}';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
    }

}
