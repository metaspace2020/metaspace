import {MigrationInterface, QueryRunner} from "typeorm";

export class ImageViewerSnapshotAddIonFormulas1623776762715 implements MigrationInterface {
    name = 'ImageViewerSnapshotAddIonFormulas1623776762715'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "graphql"."image_viewer_snapshot" ADD "ion_formulas" json`);
        await queryRunner.query(`ALTER TABLE "graphql"."image_viewer_snapshot" ADD "db_ids" json`);
        await queryRunner.query(`
        UPDATE graphql.image_viewer_snapshot AS ivs 
        SET ion_formulas = temp_table.ion_forms, db_ids = temp_table.ion_dbs
        FROM (SELECT 
            *, array_to_json(string_to_array(ions, ',')) as ion_forms,
             array_to_json(string_to_array(dbs, ',')) as ion_dbs
        FROM 
            graphql.image_viewer_snapshot
        LEFT JOIN
            (
            SELECT
            snap_id, string_agg(graphql.ion.ion, ',') as ions, string_agg((CAST(public.job.moldb_id AS TEXT)), ',') as dbs
        FROM (SELECT unnest(string_to_array(REPLACE(array_to_string(ARRAY(SELECT json_array_elements_text(annotation_ids)), ','), concat(dataset_id,'_'), '' ), ','))
         AS annot_id, id as snap_id
            FROM graphql.image_viewer_snapshot 
            ) ions
        INNER JOIN
                 public.annotation ON CAST (id AS TEXT)=ions.annot_id
        INNER JOIN graphql.ion
            ON graphql.ion.id = public.annotation.ion_id  
        INNER JOIN public.job
            ON public.job.id = public.annotation.job_id  
        GROUP BY snap_id
            ) final_ions
        ON graphql.image_viewer_snapshot.id = final_ions.snap_id) AS temp_table
        WHERE ivs.id = temp_table.snap_id;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "graphql"."image_viewer_snapshot" DROP COLUMN "ion_formulas"`);
        await queryRunner.query(`ALTER TABLE "graphql"."image_viewer_snapshot" DROP COLUMN "db_ids"`);
    }

}
