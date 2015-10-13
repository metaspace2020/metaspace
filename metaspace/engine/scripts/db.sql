DROP TABLE IF EXISTS formula_db;
CREATE TABLE formula_db (
	id		int,
	version	date,
	db		text,
	CONSTRAINT id_version_ind PRIMARY KEY(id, version)
);
INSERT INTO formula_db VALUES (0, '2015-01-01', 'HMDB'), (1, '2015-01-01', 'apple_db');

DROP TABLE IF EXISTS formulas;
CREATE TABLE formulas (
	db_id	int,
	id		text,
	sf_id 	int,
	name	text,
	sf 		text
);

DROP TABLE IF EXISTS agg_formula;
CREATE TABLE agg_formula (
    db_id 		int,
	id 		    int,
	sf 		    text,
	subst_ids 	text[],
	names 		text[],
	CONSTRAINT db_id_id_ind PRIMARY KEY(db_id, id)
);

INSERT INTO agg_formula (id, sf, db_id, subst_ids, names)
	SELECT sf_id, sf, db_id, array_agg(id) as subst_ids, array_agg(name) as names
	FROM formulas
	GROUP BY sf, sf_id, db_id
;
CREATE INDEX ind_agg_formulas_1 ON agg_formula (sf);
CREATE INDEX ind_agg_formulas_2 ON agg_formula (id);
CREATE INDEX ind_agg_formulas_3 ON agg_formula (id, sf);
CREATE INDEX ind_agg_formulas_4 ON agg_formula (db_id, id, sf);

DROP TABLE IF EXISTS dataset;
CREATE TABLE dataset (
	id	        int,
	name		text,
	file_path   text,
	nrows		int,
	ncols		int,
	CONSTRAINT dataset_id_ind PRIMARY KEY(id)
);

DROP TABLE IF EXISTS coordinates;
CREATE TABLE coordinates (
	ds_id 	    int,
	index 		int,
	x 			int,
	y 			int,
	CONSTRAINT coord_ds_id_ind PRIMARY KEY(ds_id, index)
);

CREATE INDEX ind_coordinates_2 ON coordinates (ds_id);
CREATE INDEX ind_coordinates_3 ON coordinates (index);

DROP TABLE IF EXISTS job;
CREATE TABLE job (
	id 			int,
	db_id       int,
	ds_id	    int,
	status		text,
	tasks_done	int,
	tasks_total	int,
	start       timestamp,
	finish      timestamp,
	CONSTRAINT job_id_ind PRIMARY KEY(id)
);

DROP TABLE IF EXISTS job_result_data;
CREATE TABLE job_result_data (
	job_id		int,
	db_id		int,
	sf_id		int,
	adduct 		text,
	peak		int,
	intensities	real[],
	min_int		real,
	max_int		real,
	CONSTRAINT job_result_data_id_ind PRIMARY KEY(job_id, db_id, sf_id, adduct, peak)
);
--CREATE INDEX ind_job_result_data_1 ON job_result_data (job_id);
--CREATE INDEX ind_job_result_data_2 ON job_result_data (job_id, sf_id);
--CREATE INDEX ind_job_result_data_4 ON job_result_data (job_id, sf_id, adduct);
--CREATE INDEX ind_job_result_data_5 ON job_result_data (job_id, sf_id, peak, adduct);

DROP TABLE IF EXISTS job_result_stat;
CREATE TABLE job_result_stat (
	job_id		int,
	db_id		int,
	sf_id		int,
	adduct 		text,
	peaks_n		int,
	stats 		json,
	CONSTRAINT job_result_stat_id_ind PRIMARY KEY(job_id, db_id, sf_id, adduct)
);
--CREATE INDEX ind_job_result_stats_1 ON job_result_stats (job_id);
--CREATE INDEX ind_job_result_stats_2 ON job_result_stats (job_id, formula_id);

DROP TABLE IF EXISTS theor_peaks;
CREATE TABLE theor_peaks (
    db_id           int,
	sf_id			int,
	adduct			text,
	centr_mzs		double precision[],
	centr_ints		double precision[],
	prof_mzs		double precision[],
	prof_ints		double precision[],
	CONSTRAINT sf_id_adduct PRIMARY KEY(db_id, sf_id, adduct)
);
CREATE INDEX ind_theor_peaks_2 ON theor_peaks(db_id, sf_id);
