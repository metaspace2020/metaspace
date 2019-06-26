DROP TABLE IF EXISTS dataset CASCADE;
CREATE TABLE dataset (
	id	        	text NOT NULL,
	name			text,
	input_path  	text,
	upload_dt		timestamp,
	metadata		json,
	config      	json,
	status			text,
	optical_image   text,
	transform		float[],
	is_public       boolean not null default(true),
	acq_geometry	json,
	ion_img_storage_type text not null default('fs'),
    thumbnail       text,
    ion_thumbnail   text,
	CONSTRAINT dataset_id_pk PRIMARY KEY(id)
);
CREATE INDEX ind_dataset_name ON dataset (name);

DROP TABLE IF EXISTS optical_image;
CREATE TABLE optical_image (
  id      text PRIMARY KEY,
  ds_id   text NOT NULL,
  type text NOT NULL,
  zoom REAL NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  transform REAL[][],
  CONSTRAINT opt_img_ds_id_fk FOREIGN KEY (ds_id)
      REFERENCES dataset (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
);

DROP TABLE IF EXISTS job CASCADE;
CREATE TABLE job (
	id serial NOT NULL,
	db_id   int,
	ds_id	  text,
	status	text,
	start   timestamp,
	finish  timestamp,
	CONSTRAINT job_id_pk PRIMARY KEY(id),
	CONSTRAINT job_ds_id_fk FOREIGN KEY (ds_id)
      REFERENCES dataset (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
);

DROP TABLE IF EXISTS annotation;
CREATE TABLE annotation (
    id              serial NOT NULL,
	job_id	        int NOT NULL,
	formula	    	text NOT NULL,
	chem_mod        text,
	neutral_loss    text,
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