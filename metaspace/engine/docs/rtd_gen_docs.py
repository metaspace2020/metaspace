import os
from os.path import abspath, join, dirname
from shutil import copyfile


def main():
    curdir = abspath(dirname(__file__))
    rootdir = dirname(curdir)
    conf_dir = join(rootdir, 'conf')
    apidoc_cmd = 'sphinx-apidoc'
    apidoc_exclusions = ' '.join(
        [join(rootdir, 'pyMS'), join(rootdir, 'pyIMS'), join(rootdir, 'test'), join(rootdir, 'engine', 'test')])
    apidoc_params = '-f -o {} {} {}'.format(curdir, rootdir, apidoc_exclusions)

    copyfile(join(rootdir, 'README.md'), join(curdir, 'README.md'))
    copyfile(join(conf_dir, 'sm_log.cfg.template'), join(conf_dir, 'sm_log.cfg'))
    os.system('{} {}'.format(apidoc_cmd, apidoc_params))

    print(apidoc_params)

    if __name__ == '__main__':
        main()
