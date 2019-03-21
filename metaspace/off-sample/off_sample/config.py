import configparser

config = configparser.ConfigParser()
config.read(['config/default.ini', 'config/config.ini'])
