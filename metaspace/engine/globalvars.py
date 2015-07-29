#!/home/snikolenko/anaconda/bin/python
# -*- coding: utf8 -*
"""
.. module:: globalvars
    :synopsis: Global variables, mostly SQL queries.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

adducts = [ "H", "Na", "K" ]

sql_counts = dict(
	formulas="SELECT count(*) FROM formulas",
	formulas_search="SELECT count(*) FROM formulas WHERE lower(name) like '%%%s%%' OR lower(sf) like '%%%s%%' OR id like '%s%%'",
	substancejobs="SELECT count(*) FROM jobs WHERE formula_id='%s'",
	jobs="SELECT count(*) FROM jobs",
	datasets="SELECT count(*) FROM datasets",
	fullimages="SELECT count(*) FROM job_result_stats WHERE job_id=%s",
	demobigtable="SELECT count(distinct formula_id) FROM job_result_stats"
)

sql_queries = dict(
	formulas="SELECT id,name,sf FROM formulas ",
	formulas_search="SELECT id,name,sf FROM formulas WHERE lower(name) like '%%%s%%' OR lower(sf) like '%%%s%%' OR id like '%s%%' ",
	substance='''SELECT
		f.id,f.sf_id,name,sf,peaks,ints,array_agg(s.job_id) as job_ids,
		array_agg(d.dataset_id) as dataset_ids,array_agg(dataset) as datasets,
		array_agg(stats) as stats
		FROM formulas f 
			JOIN mz_peaks p ON f.sf_id=p.sf_id
			LEFT JOIN job_result_stats s ON f.id=s.formula_id
			LEFT JOIN jobs j ON s.job_id=j.id
			LEFT JOIN datasets d ON j.dataset_id=d.dataset_id
			LEFT JOIN agg_formulas f on j.formula_id=f.id
		WHERE f.id='%s' GROUP BY f.id,f.sf_id,name,sf,peaks,ints
	''',
	jobstats="SELECT stats,peaks FROM job_result_stats s JOIN mz_peaks p ON s.formula_id=p.formula_id WHERE job_id=%s",
	substancejobs='''
		SELECT j.dataset_id,dataset,id,description,done,status,tasks_done,tasks_total,start,finish,id
		FROM jobs j
			LEFT JOIN datasets d on j.dataset_id=d.dataset_id
			LEFT JOIN job_types t on j.type=t.type
		WHERE formula_id='%s'
	''',
	jobs='''
		SELECT j.id as id,t.type,t.description,j.dataset_id,dataset,formula_id,f.sf as formula_name,done,status,tasks_done,tasks_total,start,finish,j.id as id
		FROM jobs j LEFT JOIN datasets d on j.dataset_id=d.dataset_id
		LEFT JOIN agg_formulas f on j.formula_id=f.id
		LEFT JOIN job_types t on t.type=j.type
	''',
	datasets='SELECT dataset_id,dataset,nrows,ncols,dataset_id FROM datasets',
	jobdescription='''
		SELECT j.dataset_id as dataset_id,dataset,description,done,status,tasks_done,tasks_total,start,finish
		FROM jobs j
			LEFT JOIN datasets d on j.dataset_id=d.dataset_id
			LEFT JOIN job_types t on j.type=t.type
		WHERE j.id=%s
	''',
	fullimages='''
		SELECT id,name,sf,stats->'entropies' as entropies,stats->'mean_ent' as mean_ent,stats->'corr_images' as corr_images,stats->'corr_int' as corr_int,id
		FROM job_result_stats j LEFT JOIN formulas f ON f.id=j.formula_id
		WHERE (stats->'mean_ent')::text::real > 0.0001 AND job_id=%s
	''',
	demobigtable='''
		SELECT db,ds.dataset,f.sf,f.names,f.subst_ids,
			array_agg(COALESCE( (s.stats->'chaos')::text::real, 0 )) AS mean_ent,
			array_agg((s.stats->'corr_images')::text::real) AS corr_images,
			array_agg((s.stats->'corr_int')::text::real) AS corr_int,
			array_agg(s.adduct) as adducts,
			j.id as job_id,
			array_agg(s.stats->'entropies') AS entropies,
			j.dataset_id,f.id as sf_id
		FROM agg_formulas f
			JOIN formula_dbs db ON f.db_ids[1]=db.db_id
			JOIN job_result_stats s ON f.id=s.formula_id JOIN jobs j ON s.job_id=j.id
			JOIN datasets ds ON j.dataset_id=ds.dataset_id
		WHERE
			(s.stats->'corr_images')::text::real > 0.3 AND
			(s.stats->'corr_int')::text::real > 0.3
		GROUP BY db,ds.dataset,f.sf,f.names,f.subst_ids,j.id,j.dataset_id,sf_id
	''',
	demosubst='''
		SELECT s.job_id,s.formula_id,s.adduct,
			(s.stats->'entropies'->peak)::text::real as entropy,peak,array_agg(spectrum) as sp,array_agg(value) as val
		FROM job_result_stats s 
			JOIN job_result_data d ON s.job_id=d.job_id  and s.adduct=d.adduct 
			JOIN jobs j ON d.job_id=j.id 
		WHERE d.job_id=%d AND s.formula_id=%s AND d.param=%d
		AND (s.stats->'corr_images')::text::real > 0.3 AND
			(s.stats->'corr_int')::text::real > 0.3
		GROUP BY s.job_id,s.formula_id,entropy,s.adduct,peak
	''',
	demosubstpeaks="SELECT peaks,ints FROM mz_peaks WHERE formula_id='%s'",
	democoords="SELECT index,x,y FROM coordinates WHERE dataset_id=%d",
	randomstat="SELECT job_id,dataset_id,s.formula_id,adduct,param,json_array_length(s.stats->'entropies') FROM job_result_stats s JOIN jobs j ON s.job_id=j.id OFFSET random() * (SELECT count(*) FROM job_result_stats) LIMIT 1",
	onedata='''
		SELECT spectrum,value,x,y
		FROM job_result_data d 
			JOIN jobs j ON d.job_id=j.id 
			JOIN coordinates c ON j.dataset_id=c.dataset_id AND d.spectrum=c.index
		WHERE d.job_id=%d AND d.param=%d AND d.adduct=%d AND d.peak=%d
	'''
)

sql_fields = dict(
	formulas=["id", "name", "sf"],
	substancejobs=["dataset_id", "dataset", "id", "description", "done", "status", "tasks_done", "tasks_total", "start", "finish", "id"],
	jobs=["id", "type", "description", "dataset_id", "dataset", "formula_id", "formula_name", "done", "status", "tasks_done", "tasks_total", "start", "finish", "id"],
	datasets=["dataset_id", "dataset", "nrows", "ncols", "dataset_id"],
	fullimages=["id", "name", "sf", "entropies", "mean_ent", "corr_images", "corr_int", "id"],
	demobigtable=["db", "dataset", "sf", "names", "subst_ids", "mean_ent", "corr_images", "corr_int", "adducts", "job_id", "entropies", "dataset_id", "sf_id"]
)

