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
	id	        text,
	name				text,
	input_path  text,
	upload_dt		timestamp,
	metadata		json,
	config      json,
	status			text,
	CONSTRAINT dataset_id_pk PRIMARY KEY(id)
);
CREATE INDEX ind_dataset_name ON dataset (name);

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

DROP TABLE IF EXISTS target_decoy_add CASCADE;
CREATE TABLE target_decoy_add (
    job_id	    int,
	db_id       int,
    sf_id       int,
	target_add  text,
	decoy_add   text,
	CONSTRAINT target_decoy_add_id_pk PRIMARY KEY(job_id, db_id, sf_id, target_add, decoy_add),
	CONSTRAINT target_decoy_add_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);

DROP TABLE IF EXISTS iso_image_metrics;
CREATE TABLE iso_image_metrics (
	job_id	    int,
	db_id		    int,
	sf_id		    int,
	adduct 	    text,
	msm         real,
	fdr         real,
	stats 	    json,
  iso_image_ids  text[],
	CONSTRAINT iso_image_metrics_id_pk PRIMARY KEY(job_id, db_id, sf_id, adduct),
	CONSTRAINT iso_image_metrics_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE,
	CONSTRAINT iso_image_metrics_sum_formula_id_fk FOREIGN KEY (sf_id)
      REFERENCES sum_formula(id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);


DROP TABLE IF EXISTS theor_peaks;
CREATE TABLE theor_peaks (
  sf          text,
	adduct		  text,
	sigma       real,
	charge      int,
	pts_per_mz  int,
	centr_mzs		double precision[],
	centr_ints	double precision[],
	CONSTRAINT theor_peaks_sf_id_adduct_pk PRIMARY KEY(sf, adduct, sigma, charge, pts_per_mz)
)
WITH (
  autovacuum_enabled=true,
  autovacuum_vacuum_threshold=5000,
  autovacuum_analyze_threshold=5000
);