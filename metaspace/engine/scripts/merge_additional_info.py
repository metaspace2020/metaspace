from sm.engine.db import DB
from sm.engine.util import SMConfig
import json

SMConfig.set_path('../conf/config.json')
conf = SMConfig.get_conf()
db = DB(conf['db'])

SEL_METADATA = 'SELECT id, metadata FROM dataset'
UPDATE_METADATA = 'UPDATE dataset SET metadata = %s WHERE id = %s'
selectDatasetsMetadata = db.select(SEL_METADATA, params=None)
entriesToRemove = ['Publication_DOI' ,'Sample_Description_Freetext', 'Sample_Preparation_Freetext', 'Additional_Information_Freetext' ,'Expected_Molecules_Freetext' ]

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
# print(logs)
print('Problem dataset IDs , please check manually\n', list(set(notValidDatasets)))