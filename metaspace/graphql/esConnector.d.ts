import {ContextUser} from './src/context';

type DocType = 'dataset' | 'annotation';

export interface ESDataset {
  _source: ESDatasetSource;
}

export interface ESDatasetSource {
  ds_id: string;
  ds_name: string;
  ds_upload_dt: string;
  ds_config: any;
  ds_meta: any;
  ds_status: string;
  ds_input_path: string;
  ds_is_public: boolean;
  ds_mol_dbs: string[];
  ds_adducts: string[];
  ds_acq_geometry: any;
  ds_submitter_id: string;
  ds_submitter_name: string;
  ds_submitter_email: string;
  ds_group_id: string | null;
  ds_group_name: string | null;
  ds_group_short_name: string | null;
  ds_group_approved: boolean;
  ds_project_ids?: string[];
  annotation_counts: any[];
}

export function esSearchResults(args: any, docType: DocType, user: ContextUser | null): Promise<any[]>;
export function esCountResults(args: any, docType: DocType, user: ContextUser | null): Promise<number>;
export function esCountGroupedResults(args: any, docType: DocType, user: ContextUser | null): Promise<any>;
export function esFilterValueCountResults(args: any, user: ContextUser | null): Promise<any>;
export function esAnnotationByID(id: string, user: ContextUser | null): Promise<object | null>;
export function esDatasetByID(id: string, user: ContextUser | null): Promise<ESDataset | null>;
