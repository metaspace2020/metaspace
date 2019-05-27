DROP TABLE IF EXISTS sum_formula CASCADE;
CREATE TABLE sum_formula (
	id 			serial NOT NULL,
	db_id 	int,
	sf 		  text,
	CONSTRAINT sum_formula_id_pk PRIMARY KEY(id)
);
CREATE INDEX ind_sum_formulas_1 ON sum_formula (sf);
CREATE INDEX ind_sum_formulas_4 ON sum_formula (db_id);

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

DROP TABLE IF EXISTS iso_image_metrics;
CREATE TABLE iso_image_metrics (
    id              serial NOT NULL,
	job_id	        int NOT NULL,
	sf		    	text NOT NULL,
	adduct 	        text NOT NULL,
	chem_mod        text,
	neutral_loss    text,
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
        UNIQUE (job_id, sf, adduct, chem_mod, neutral_loss)
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);

CREATE INDEX iso_image_metrics_job_id_index
    ON iso_image_metrics (job_id);