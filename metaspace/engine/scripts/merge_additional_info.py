from sm.engine.db import DB
from sm.engine.util import SMConfig
import json
import argparse

SEL_METADATA = 'SELECT id, metadata FROM dataset'
UPDATE_METADATA = 'UPDATE dataset SET metadata = %s WHERE id = %s'

def mergeFields(db, enabledLogs):
    entriesToRemove = ['Publication_DOI', 'Sample_Description_Freetext', 'Sample_Preparation_Freetext',
                       'Additional_Information_Freetext', 'Expected_Molecules_Freetext']
    selectDatasetsMetadata = db.select(SEL_METADATA, params=None)

    logs = ''
    notValidDatasets = []

    for dataset in selectDatasetsMetadata:
        datasetID = dataset[0]
        metadata = dataset[1]
        allVals = ''

        if (sorted(metadata['Additional_Information'].keys()) == sorted(entriesToRemove)):
            for k in entriesToRemove:
                if (metadata['Additional_Information'][k] != ''):
                    allVals = allVals + metadata['Additional_Information'][k] + ' '
                metadata['Additional_Information'].pop(k, None)
            metadata['Additional_Information']['Supplementary'] = allVals
            db.alter(UPDATE_METADATA, params=(json.dumps(metadata), datasetID,))
        else:
            for k in entriesToRemove:
                if k in metadata['Additional_Information']:
                    logs = logs + ('True | PROPERTY {} DOES EXISTS ON Additional_Information | ID={}\n'.format(k, datasetID))
                else:
                    logs = logs + ('False | {} PROPERTY DOESN\'T EXIST ON Additional_Information | ID={}\n'.format(k, datasetID))
                    notValidDatasets.append(datasetID)

    if (enabledLogs == True):
        print(logs)

    print('Problem occurred with the following datasets IDs, please check the logs\n', list(set(notValidDatasets)))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migration script: merging all fields in additional information of"
                                                 " metadata into one 'Supplementary'")
    parser.add_argument('--config', dest='sm_config_path', default='conf/config.json', type=str, help='SM config path')
    parser.add_argument('--logs', dest='logs', default='False', type=bool, help='Enable logs to track merging')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    sm_config = SMConfig.get_conf()
    db = DB(sm_config['db'])

    if args.logs:
        enabledLogs = True
    else:
        enabledLogs = False

    mergeFields(db, enabledLogs)
