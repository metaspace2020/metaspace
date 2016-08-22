"""
Script for exporting search results into csv file
"""
import argparse
from os import path

from sm.engine.db import DB
from sm.engine.util import SMConfig, logger, proj_root

DS_CONFIG_SEL = "SELECT config FROM dataset WHERE name = %s"

EXPORT_SEL = ("SELECT sf_db.name, ds.name, sf, m.adduct, "
              "(m.stats->'chaos')::text::real AS chaos, "
              "(m.stats->'spatial')::text::real AS img_corr, "
              "(m.stats->'spectral')::text::real AS pattern_match, "
              "sigma, charge, pts_per_mz, tp.centr_mzs[1] "
              "FROM iso_image_metrics m "
              "JOIN formula_db sf_db ON sf_db.id = m.db_id "
              "JOIN agg_formula f ON f.id = m.sf_id AND sf_db.id = f.db_id "
              "JOIN job j ON j.id = m.job_id "
              "JOIN dataset ds ON ds.id = j.ds_id "
              "JOIN theor_peaks tp ON tp.sf = f.sf AND tp.adduct = m.adduct "
              "WHERE sf_db.name = %s AND ds.name = %s "
              "AND ROUND(sigma::numeric, 6) = %s AND charge = %s AND pts_per_mz = %s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Exporting search results into a csv file')
    parser.add_argument('ds_id', type=str, help='Dataset name')
    parser.add_argument('csv_path', type=str, help='Path for the csv file')
    parser.add_argument('--config', dest='sm_config_path', type=str, help='SM config path')
    parser.set_defaults(sm_config_path=path.join(proj_root(), 'conf/config.json'))
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    db = DB(SMConfig.get_conf()['db'])

    ds_config = db.select_one(DS_CONFIG_SEL, args.ds_name)[0]
    isotope_gen_config = ds_config['isotope_generation']
    charge = '{}{}'.format(isotope_gen_config['charge']['polarity'], isotope_gen_config['charge']['n_charges'])
    export_rs = db.select(EXPORT_SEL, ds_config['database']['name'], args.ds_name,
                          isotope_gen_config['isocalc_sigma'], charge, isotope_gen_config['isocalc_pts_per_mz'])

    header = ','.join(['formula_db', 'ds_id', 'sf', 'adduct', 'chaos', 'img_corr', 'pat_match',
                       'isocalc_sigma', 'isocalc_charge', 'isocalc_pts_per_mz', 'first_peak_mz']) + '\n'
    with open(args.csv_path, 'w') as f:
        f.write(header)
        f.writelines([','.join(map(str, row)) + '\n' for row in export_rs])
    logger.info('Exported all search results for "%s" dataset into "%s" file', args.ds_name, args.csv_path)