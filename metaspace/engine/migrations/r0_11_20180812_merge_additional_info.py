from sm.engine.db import DB
from sm.engine.es_export import ESExporter
from sm.engine.util import SMConfig
from sm.engine.dataset import Dataset
import argparse

SEL_IDS = 'SELECT id FROM dataset'

def mergeFields(db, es, enabledLogs):
    ds_ids = db.select(SEL_IDS, params=None)
    notValidDatasets = []

    for i, (id,) in enumerate(ds_ids):
        log_prefix = f'[{i}/{len(ds_ids)}]'
        try:
            dataset = Dataset.load(db, id)
            section = dataset.metadata.get('Additional_Information', {})

            if section.get('Supplementary') == None:
                vals = []

                if section.get('Additional_Information_Freetext', '').strip():
                    vals.append(section['Additional_Information_Freetext'])
                if section.get('Sample_Description_Freetext', '').strip():
                    vals.append('Sample Description: ' + section['Sample_Description_Freetext'])
                if section.get('Sample_Preparation_Freetext', '').strip():
                    vals.append('Sample Preparation: ' + section['Sample_Preparation_Freetext'])
                if section.get('Expected_Molecules_Freetext', '').strip():
                    vals.append('Expected Molecules: ' + section['Expected_Molecules_Freetext'])
                if section.get('Publication_DOI', '').strip():
                    vals.append('Publication DOI: ' + section['Publication_DOI'])

                dataset.metadata['Additional_Information'] = {'Supplementary': '\n'.join(vals)}

                dataset.save(db, es)

                if enabledLogs:
                    print(f'{log_prefix} Processed {id} merged {len(vals)} fields')
            else:
                if enabledLogs:
                    print(f'{log_prefix} Skipped already migrated dataset {id}')

        except Exception as ex:
            notValidDatasets.append(id)
            print(f'{log_prefix} Error processing dataset {id}')
            print(ex)

    if notValidDatasets:
        print('Problem occurred with the following datasets IDs, please check the logs\n', list(set(notValidDatasets)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migration script: merging all fields in additional information of"
                                                 " metadata into one 'Supplementary'")
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')
    parser.add_argument('--logs', dest='logs', default='True', type=bool, help='Enable logs to track merging')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()
    db = DB(sm_config['db'])
    es = ESExporter(db)

    if args.logs:
        enabledLogs = True
    else:
        enabledLogs = False

    mergeFields(db, es, enabledLogs)
