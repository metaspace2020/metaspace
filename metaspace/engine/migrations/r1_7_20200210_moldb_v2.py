from sm.engine.db import DB
from sm.engine.util import GlobalInit


if __name__ == '__main__':
    with GlobalInit() as sm_config:
        db = DB()

        PUBLIC_MOLDB_UPD = 'UPDATE molecular_db SET "public" = true WHERE name IN %s'
        PUBLIC_DATABASE_NAMES = (
            'BraChemDB-2018-01',
            'ChEBI-2018-01',
            'ECMDB-2018-12',
            'HMDB-v4',
            'HMDB-v4-cotton',
            'HMDB-v4-endogenous',
            'LipidMaps-2017-12-12',
            'PAMDB-v1.0',
            'SwissLipids-2018-02-02',
            'HMDB',
            'ChEBI',
            'LIPID_MAPS',
            'SwissLipids',
            'COTTON_HMDB',
            'HMDB-v2.5',
            'HMDB-v2.5-cotton',
        )
        db.alter(PUBLIC_MOLDB_UPD, params=(PUBLIC_DATABASE_NAMES,))

        ARCHIVED_MOLDB_UPD = 'UPDATE molecular_db SET archived = true WHERE name IN %s'
        ARCHIVED_DATABASE_NAMES = (
            'HMDB',
            'ChEBI',
            'LIPID_MAPS',
            'SwissLipids',
            'COTTON_HMDB',
            'HMDB-v2.5',
            'HMDB-v2.5-cotton',
        )
        db.alter(ARCHIVED_MOLDB_UPD, params=(ARCHIVED_DATABASE_NAMES,))
