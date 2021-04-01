import {MigrationInterface, QueryRunner} from "typeorm";

export class DatasetDescription1616611900466 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."dataset" ADD "description" text`);
        await queryRunner.query(`
        UPDATE  graphql.dataset SET description=jsonb_set(
                '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": ""}]}]}'::jsonb,
                '{content, 0, content, 0, text}',
                to_jsonb(public.dataset.metadata->'Additional_Information'->'Supplementary')
            )::json FROM public.dataset where graphql.dataset.id=public.dataset.id  and
            public.dataset.metadata->'Additional_Information'->'Supplementary' is not null and
            public.dataset.metadata->'Additional_Information'->'Supplementary' #>> '{}' != '';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "graphql"."dataset" DROP COLUMN "description"`);
    }

}
