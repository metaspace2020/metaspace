alter table iso_image_metrics add id serial;

alter table iso_image_metrics drop constraint iso_image_metrics_id_pk;

alter table iso_image_metrics
  add constraint iso_image_metrics_pk
	primary key (id);

alter table iso_image_metrics
  add constraint iso_image_metrics_id_pk
	unique (job_id, db_id, sf, adduct);

alter table iso_image_metrics
  add off_sample JSON;