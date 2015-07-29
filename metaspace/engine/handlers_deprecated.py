#!/home/snikolenko/anaconda/bin/python
# -*- coding: utf8 -*
"""
.. module:: handlers_deprecated
    :synopsis: Handlers for the webserver that are not currently in use.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

# global variable for special case html files
html_pages = {
}

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado.concurrent import Future
from tornado import gen
from tornado.ioloop import IOLoop
import tornpsql

