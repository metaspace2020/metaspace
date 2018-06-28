from sm.engine.util import init_logger, SMConfig
from sm.engine.imzml_txt_converter import ImzmlTxtConverter

init_logger()
SMConfig.set_path('/home/intsco/embl/spatial_metab/sm/conf/config.json')


converter = ImzmlTxtConverter('/tmp/IMAGE120K__Elite_170106182454/IMAGE120K__Elite_170106182454.imzML',
                              '/tmp/IMAGE120K__Elite_170106182454/IMAGE120K__Elite_170106182454.txt')
converter.convert()