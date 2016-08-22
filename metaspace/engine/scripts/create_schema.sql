DROP TABLE IF EXISTS formula_db CASCADE;
CREATE TABLE formula_db (
	id		serial PRIMARY KEY,
	version	date,
	name	text
);
CREATE INDEX ind_formula_db_name ON formula_db (name);

DROP TABLE IF EXISTS formula CASCADE;
CREATE TABLE formula (
    id		serial PRIMARY KEY,
	db_id	int,
	fid 	text,
	name	text,
	sf 		text,
	CONSTRAINT formula_id_sf_id_uniq UNIQUE(db_id, fid),
	CONSTRAINT formula_id_fk FOREIGN KEY (db_id)
        REFERENCES formula_db (id) MATCH SIMPLE
        ON UPDATE NO ACTION ON DELETE CASCADE
);

DROP TABLE IF EXISTS sum_formula CASCADE;
CREATE TABLE sum_formula (
    id 		    int,
    db_id 		int,
	sf 		    text,
	subst_ids 	text[],
	names 		text[],
	CONSTRAINT sum_formula_db_id_id_pk PRIMARY KEY(db_id, id),
	CONSTRAINT sum_formula_db_id_fk FOREIGN KEY (db_id)
      REFERENCES formula_db (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX ind_sum_formulas_1 ON sum_formula (sf);
CREATE INDEX ind_sum_formulas_2 ON sum_formula (id);
CREATE INDEX ind_sum_formulas_3 ON sum_formula (id, sf);
CREATE INDEX ind_sum_formulas_4 ON sum_formula (db_id, id, sf);
CREATE INDEX sum_formula_names_ind ON sum_formula (names);
CREATE INDEX sum_formula_ids_ind ON sum_formula (subst_ids);

DROP TABLE IF EXISTS client CASCADE;
CREATE TABLE client (
    id	        decimal(21),
	name		text,
	email       text,
	CONSTRAINT user_id_pk PRIMARY KEY(id)
);

DROP TABLE IF EXISTS feedback CASCADE;
CREATE TABLE feedback (
    id	        serial,
    client_id   decimal(21),
    job_id      int,
    db_id       int,
    sf_id       int,
    adduct      text,
	rating		smallint,
    comment     text,
    fdr_thr     real,
	CONSTRAINT feedback_id_pk PRIMARY KEY(id)
);

DROP TABLE IF EXISTS dataset CASCADE;
CREATE TABLE dataset (
	id	        text,
	name				text,
	input_path  text,
	metadata		json,
	img_bounds	json,
	config      json,
	CONSTRAINT dataset_id_pk PRIMARY KEY(id)
);
CREATE INDEX ind_dataset_name ON dataset (name);

DROP TABLE IF EXISTS coordinates;
CREATE TABLE coordinates (
	ds_id 	 text,
	xs       int[],
	ys       int[],
	CONSTRAINT coord_ds_id_pk PRIMARY KEY(ds_id),
	CONSTRAINT coord_ds_id_fk FOREIGN KEY (ds_id)
      REFERENCES dataset (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE CASCADE
);
CREATE INDEX ind_coordinates_2 ON coordinates (ds_id);

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

DROP TABLE IF EXISTS adduct;
CREATE TABLE adduct (
    job_id  int,
	adduct 	 text,
	CONSTRAINT adduct_job_id_add_pk PRIMARY KEY(job_id, adduct),
	CONSTRAINT adduct_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
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

DROP TABLE IF EXISTS iso_image;
CREATE TABLE iso_image (
	job_id		int,
	db_id		int,
	sf_id		int,
	adduct 		text,
	peak		int,
	pixel_inds  int[],
	intensities	real[],
	min_int		real,
	max_int		real,
	CONSTRAINT iso_image_id_pk PRIMARY KEY(job_id, db_id, sf_id, adduct, peak),
	CONSTRAINT iso_image_job_id_fk FOREIGN KEY (job_id)
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
	job_id		int,
	db_id		int,
	sf_id		int,
	adduct 		text,
	msm         real,
	fdr         real,
	stats 		json,
	peaks_n		int,
	CONSTRAINT iso_image_metrics_id_pk PRIMARY KEY(job_id, db_id, sf_id, adduct),
	CONSTRAINT iso_image_metrics_job_id_fk FOREIGN KEY (job_id)
      REFERENCES job (id) MATCH SIMPLE
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