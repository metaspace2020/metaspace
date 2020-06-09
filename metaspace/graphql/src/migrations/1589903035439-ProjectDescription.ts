import {MigrationInterface, QueryRunner} from "typeorm";

export class ProjectDescription1589903035439 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`UPDATE graphql.project SET project_description = NULL WHERE project_description = ''`);
        await queryRunner.query(`
            UPDATE graphql.project
            SET project_description = jsonb_set(
                '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": ""}]}]}'::jsonb,
                '{content, 0, content, 0, text}',
                to_jsonb(project_description)
            )::json
            WHERE project_description IS NOT NULL AND project_description NOT LIKE '{%}';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
    }

}
