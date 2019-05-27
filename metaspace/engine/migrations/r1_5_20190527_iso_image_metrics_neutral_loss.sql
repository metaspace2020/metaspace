-- The names of constraints, column order, etc. are inconsistent across environments & the creation script.
-- This script recreates the table instead of altering it to fix the inconsistencies.

-- Effective changes:
-- Added `chem_mod` and `neutral_loss` columns, and added them to the unique constraint
-- Removed db_id column (It is redundant - job.db_id should be used instead)
-- Removed sf_id column (It was only on production)
-- Made sf, msm, fdr, stats, and iso_image_ids non-nullable, as they're never null
-- Made constraint names consistent across environments

BEGIN TRANSACTION;

ALTER TABLE iso_image_metrics
    DROP CONSTRAINT IF EXISTS iso_image_metrics_annotation_uindex,
    DROP CONSTRAINT IF EXISTS iso_image_metrics_id_pk,
    DROP CONSTRAINT IF EXISTS iso_image_metrics_job_id_fk,
    DROP CONSTRAINT IF EXISTS iso_image_metrics_pk,
    DROP CONSTRAINT IF EXISTS iso_image_metrics_job_id_db_id_sf_adduct_pk;

DROP INDEX IF EXISTS iso_image_metrics_job_id_index;

CREATE TABLE iso_image_metrics_new (
    id              serial NOT NULL,
	job_id	        int NOT NULL,
	sf		    	text NOT NULL,
	chem_mod        text,
	neutral_loss    text,
	adduct 	        text NOT NULL,
	msm             real NOT NULL,
	fdr             real NOT NULL,
	stats 	        json NOT NULL,
    iso_image_ids   text[] NOT NULL,
    off_sample      json,
    CONSTRAINT iso_image_metrics_id_pk PRIMARY KEY(id),
    CONSTRAINT iso_image_metrics_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT iso_image_metrics_annotation_uindex
        UNIQUE (job_id, sf, chem_mod, neutral_loss, adduct)
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);

CREATE INDEX iso_image_metrics_job_id_index
    ON iso_image_metrics_new (job_id);

INSERT INTO iso_image_metrics_new (id, job_id, sf, adduct, msm, fdr, stats, iso_image_ids, off_sample)
SELECT id, job_id, sf, adduct, msm, fdr, stats, iso_image_ids, off_sample FROM iso_image_metrics;

SELECT SETVAL('iso_image_metrics_new_id_seq', NEXTVAL('iso_image_metrics_id_seq'));

ALTER TABLE iso_image_metrics RENAME TO iso_image_metrics_old;

ALTER TABLE iso_image_metrics_new RENAME TO iso_image_metrics;

DROP TABLE iso_image_metrics_old;

ALTER SEQUENCE iso_image_metrics_new_id_seq RENAME TO iso_image_metrics_id_seq;

COMMIT TRANSACTION;