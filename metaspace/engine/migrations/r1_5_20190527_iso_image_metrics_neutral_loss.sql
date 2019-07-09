-- The names of constraints, column order, etc. are inconsistent across environments & the creation script.
-- This script recreates the table instead of altering it to fix the inconsistencies.

-- Effective changes:
-- Rename `iso_image_metrics` table to `annotation`
-- Added `chem_mod` and `neutral_loss` columns, and added them to the unique constraint
-- Removed obsolete sum_formula table
-- Removed db_id column (It is redundant - job.db_id should be used instead)
-- Removed sf_id column (It was only on production)
-- Made sf, msm, fdr, stats, and iso_image_ids non-nullable, as they're never null
-- Made constraint names consistent across environments

BEGIN TRANSACTION;

CREATE TABLE annotation (
    id              serial NOT NULL,
	job_id	        int NOT NULL,
	formula	    	text NOT NULL,
	chem_mod        text NOT NULL,
	neutral_loss    text NOT NULL,
	adduct 	        text NOT NULL,
	msm             real NOT NULL,
	fdr             real NOT NULL,
	stats 	        json NOT NULL,
    iso_image_ids   text[] NOT NULL,
    off_sample      json,
    CONSTRAINT annotation_id_pk PRIMARY KEY(id),
    CONSTRAINT annotation_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE,
    CONSTRAINT annotation_annotation_uindex
        UNIQUE (job_id, formula, chem_mod, neutral_loss, adduct)
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);

CREATE INDEX annotation_job_id_index
    ON annotation (job_id);

ALTER TABLE annotation OWNER TO sm;

INSERT INTO annotation (job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, stats, iso_image_ids, off_sample)
SELECT job_id, sf, '', '', adduct, msm, fdr, stats, iso_image_ids, off_sample FROM iso_image_metrics
ORDER BY job_id, sf, adduct;

DROP TABLE iso_image_metrics;

DROP TABLE IF EXISTS sum_formula;

COMMIT TRANSACTION;