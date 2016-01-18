# -*- coding: utf8 -*
"""
.. module:: handlers
    :synopsis: Handlers for the webserver.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
import json
import threading
import Queue
import operator
import math
import cStringIO
import cProfile
from datetime import time, datetime

import numpy as np
from scipy.sparse import coo_matrix
from scipy.stats import mode
from scipy import ndimage

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen
from tornado.ioloop import IOLoop

import matplotlib as mpl
mpl.use('Agg')
from matplotlib import pyplot as plt
import matplotlib.cm as cm
from matplotlib.colors import Normalize
from mpl_toolkits.axes_grid1 import make_axes_locatable
from matplotlib.pyplot import gcf

from globalvars import *
from util import my_print, DateTimeEncoder


@gen.coroutine
def async_sleep(seconds):
    """Sleep for a given number of seconds."""
    yield gen.Task(IOLoop.instance().add_timeout, time.time() + seconds)


def call_in_background(f, *args):
    """Call function in background in a separate thread / coroutine"""
    result = Queue.Queue(1)
    t = threading.Thread(target=lambda: result.put(f(*args)))
    t.start()
    return result


class AjaxHandler(tornado.web.RequestHandler):
    """Tornado handler for an ajax request."""

    @property
    def db(self):
        return self.application.db

    def make_datatable_dict(self, draw, count, res):
        return {
            "draw": draw,
            "recordsTotal": count,
            "recordsFiltered": count,
            "data": res
        }

    def load_random_image(self):
        """Load a random m/z image from the database; used in the "choose more structured" game."""
        im1 = self.db.query(sql_queries['randomstat'])[0]
        my_print("%s" % im1)
        peak1 = np.random.randint(im1['json_array_length'])
        im1.update({'peak': peak1})
        my_print("chose peak %d" % peak1)
        my_print(sql_queries['onedata'] % (im1['job_id'], im1['formula_id'], im1['adduct'], peak1))
        data1 = self.db.query(sql_queries['onedata'] % (im1['job_id'], im1['formula_id'], im1['adduct'], peak1))
        return {
            "meta": im1,
            "data": {
                "val": [x['value'] for x in data1],
                "sp": [x['spectrum'] for x in data1]
            },
            "coords": [[x['x'], x['y']] for x in data1],
            "max_x": np.max([x['x'] for x in data1]),
            "max_y": np.max([x['y'] for x in data1])
        }

    @gen.coroutine
    def get(self, query_id, slug):
        def flushed_callback(t0):
            def callback():
                my_print("Finished write in AjaxHandler. Took %s" % (datetime.now() - t0))

            return callback

        def wrapper(self, query_id, slug):
            my_print("ajax %s starting..." % query_id)
            my_print("%s" % query_id)
            my_print("%s" % slug)
            draw = self.get_argument('draw', 0)
            input_id = ""

            if query_id == 'demobigtable':
                orderby = sql_fields[query_id][int(self.get_argument('order[0][column]', 0))]
                orderdir = self.get_argument('order[0][dir]', 0)
                limit = self.get_argument('length', 0)
                limit_string = "LIMIT %s" % limit if limit != '-1' else ""
                offset = self.get_argument('start', 0)
                searchval = self.get_argument('search[value]', "")
                my_print("search for : %s" % searchval)

                # queries
                q_count = sql_counts[query_id] if searchval == "" else (
                    sql_counts[query_id + '_search'] % (searchval, searchval, searchval))
                q_res = sql_queries[query_id] if searchval == "" else (
                    sql_queries[query_id + '_search'] % (searchval, searchval, searchval))
                if query_id in ['substancejobs', 'fullimages']:
                    q_count = q_count % input_id
                    q_res = q_res % input_id
                my_print(q_count)
                if query_id == 'demobigtable':
                    count = int(self.db.query(q_count)[0]['count'])
                    res = self.db.query(q_res)
                    for r in res:
                        r['msm'] = round(r['chaos'] * r['image_corr'] * r['pattern_match'], 6)
                else:
                    my_print(q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
                    count = int(self.db.query(q_count)[0]['count'])
                    res = self.db.query(
                        q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
                return self.make_datatable_dict(draw, count,
                                                    [[row[x] for x in sql_fields[query_id]] for row in res])
            else:
                raise Exception('Wrong query_id = %s' % query_id)

        res_dict = wrapper(self, query_id, slug)
        my_print("ajax %s processed, returning..." % query_id)
        t0 = datetime.now()
        self.write(json.dumps(res_dict, cls=DateTimeEncoder))
        self.flush(callback=flushed_callback(t0))


class IndexHandler(tornado.web.RequestHandler):
    """Tornado handler for the index page."""

    @gen.coroutine
    def get(self):
        self.render("html/index.html")


class SimpleHtmlHandlerWithId(tornado.web.RequestHandler):
    """Tornado handler for an html file with a parameter."""

    @gen.coroutine
    def get(self, id):
        my_print("Request: %s, Id: %s" % (self.request.uri, id))
        self.render(html_pages.get(self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"),
                    sparkactivated=args.spark)


class SimpleHtmlHandler(tornado.web.RequestHandler):
    """Tornado handler for an html file without parameters."""

    @gen.coroutine
    def get(self):
        my_print("Request: %s" % self.request.uri)
        self.render(html_pages.get(self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"),
                    sparkactivated=args.spark)


class IsoImgBaseHandler(tornado.web.RequestHandler):
    INTS_SQL = ('SELECT pixel_inds inds, intensities as ints '
                'FROM iso_image img '
                'JOIN job j ON img.job_id=j.id '
                'WHERE j.id=%s AND img.sf_id=%s AND adduct=%s '
                'ORDER BY peak')
    peaks_n_sql = 'SELECT peaks_n FROM iso_image_metrics WHERE sf_id=%s AND adduct=%s AND job_id=%s AND db_id=%s'
    bounds_sql = ('SELECT img_bounds '
                  'FROM job j '
                  'JOIN dataset d on d.id=j.ds_id '
                  'WHERE j.id=%d')
    coord_sql = 'SELECT xs, ys FROM coordinates WHERE ds_id=%s'

    # colormap = np.array([(68, 1, 84), (68, 2, 85), (68, 3, 87), (69, 5, 88), (69, 6, 90), (69, 8, 91), (70, 9, 92), (70, 11, 94), (70, 12, 95), (70, 14, 97), (71, 15, 98), (71, 17, 99), (71, 18, 101), (71, 20, 102), (71, 21, 103), (71, 22, 105), (71, 24, 106), (72, 25, 107), (72, 26, 108), (72, 28, 110), (72, 29, 111), (72, 30, 112), (72, 32, 113), (72, 33, 114), (72, 34, 115), (72, 35, 116), (71, 37, 117), (71, 38, 118), (71, 39, 119), (71, 40, 120), (71, 42, 121), (71, 43, 122), (71, 44, 123), (70, 45, 124), (70, 47, 124), (70, 48, 125), (70, 49, 126), (69, 50, 127), (69, 52, 127), (69, 53, 128), (69, 54, 129), (68, 55, 129), (68, 57, 130), (67, 58, 131), (67, 59, 131), (67, 60, 132), (66, 61, 132), (66, 62, 133), (66, 64, 133), (65, 65, 134), (65, 66, 134), (64, 67, 135), (64, 68, 135), (63, 69, 135), (63, 71, 136), (62, 72, 136), (62, 73, 137), (61, 74, 137), (61, 75, 137), (61, 76, 137), (60, 77, 138), (60, 78, 138), (59, 80, 138), (59, 81, 138), (58, 82, 139), (58, 83, 139), (57, 84, 139), (57, 85, 139), (56, 86, 139), (56, 87, 140), (55, 88, 140), (55, 89, 140), (54, 90, 140), (54, 91, 140), (53, 92, 140), (53, 93, 140), (52, 94, 141), (52, 95, 141), (51, 96, 141), (51, 97, 141), (50, 98, 141), (50, 99, 141), (49, 100, 141), (49, 101, 141), (49, 102, 141), (48, 103, 141), (48, 104, 141), (47, 105, 141), (47, 106, 141), (46, 107, 142), (46, 108, 142), (46, 109, 142), (45, 110, 142), (45, 111, 142), (44, 112, 142), (44, 113, 142), (44, 114, 142), (43, 115, 142), (43, 116, 142), (42, 117, 142), (42, 118, 142), (42, 119, 142), (41, 120, 142), (41, 121, 142), (40, 122, 142), (40, 122, 142), (40, 123, 142), (39, 124, 142), (39, 125, 142), (39, 126, 142), (38, 127, 142), (38, 128, 142), (38, 129, 142), (37, 130, 142), (37, 131, 141), (36, 132, 141), (36, 133, 141), (36, 134, 141), (35, 135, 141), (35, 136, 141), (35, 137, 141), (34, 137, 141), (34, 138, 141), (34, 139, 141), (33, 140, 141), (33, 141, 140), (33, 142, 140), (32, 143, 140), (32, 144, 140), (32, 145, 140), (31, 146, 140), (31, 147, 139), (31, 148, 139), (31, 149, 139), (31, 150, 139), (30, 151, 138), (30, 152, 138), (30, 153, 138), (30, 153, 138), (30, 154, 137), (30, 155, 137), (30, 156, 137), (30, 157, 136), (30, 158, 136), (30, 159, 136), (30, 160, 135), (31, 161, 135), (31, 162, 134), (31, 163, 134), (32, 164, 133), (32, 165, 133), (33, 166, 133), (33, 167, 132), (34, 167, 132), (35, 168, 131), (35, 169, 130), (36, 170, 130), (37, 171, 129), (38, 172, 129), (39, 173, 128), (40, 174, 127), (41, 175, 127), (42, 176, 126), (43, 177, 125), (44, 177, 125), (46, 178, 124), (47, 179, 123), (48, 180, 122), (50, 181, 122), (51, 182, 121), (53, 183, 120), (54, 184, 119), (56, 185, 118), (57, 185, 118), (59, 186, 117), (61, 187, 116), (62, 188, 115), (64, 189, 114), (66, 190, 113), (68, 190, 112), (69, 191, 111), (71, 192, 110), (73, 193, 109), (75, 194, 108), (77, 194, 107), (79, 195, 105), (81, 196, 104), (83, 197, 103), (85, 198, 102), (87, 198, 101), (89, 199, 100), (91, 200, 98), (94, 201, 97), (96, 201, 96), (98, 202, 95), (100, 203, 93), (103, 204, 92), (105, 204, 91), (107, 205, 89), (109, 206, 88), (112, 206, 86), (114, 207, 85), (116, 208, 84), (119, 208, 82), (121, 209, 81), (124, 210, 79), (126, 210, 78), (129, 211, 76), (131, 211, 75), (134, 212, 73), (136, 213, 71), (139, 213, 70), (141, 214, 68), (144, 214, 67), (146, 215, 65), (149, 215, 63), (151, 216, 62), (154, 216, 60), (157, 217, 58), (159, 217, 56), (162, 218, 55), (165, 218, 53), (167, 219, 51), (170, 219, 50), (173, 220, 48), (175, 220, 46), (178, 221, 44), (181, 221, 43), (183, 221, 41), (186, 222, 39), (189, 222, 38), (191, 223, 36), (194, 223, 34), (197, 223, 33), (199, 224, 31), (202, 224, 30), (205, 224, 29), (207, 225, 28), (210, 225, 27), (212, 225, 26), (215, 226, 25), (218, 226, 24), (220, 226, 24), (223, 227, 24), (225, 227, 24), (228, 227, 24), (231, 228, 25), (233, 228, 25), (236, 228, 26), (238, 229, 27), (241, 229, 28), (243, 229, 30), (246, 230, 31), (248, 230, 33), (250, 230, 34), (253, 231, 36)])

    def initialize(self):
        self.ncols, self.nrows = None, None
        # Viridis
        colors = np.array([(68, 1, 84), (68, 2, 85), (68, 3, 87), (69, 5, 88), (69, 6, 90), (69, 8, 91), (70, 9, 92), (70, 11, 94), (70, 12, 95), (70, 14, 97), (71, 15, 98), (71, 17, 99), (71, 18, 101), (71, 20, 102), (71, 21, 103), (71, 22, 105), (71, 24, 106), (72, 25, 107), (72, 26, 108), (72, 28, 110), (72, 29, 111), (72, 30, 112), (72, 32, 113), (72, 33, 114), (72, 34, 115), (72, 35, 116), (71, 37, 117), (71, 38, 118), (71, 39, 119), (71, 40, 120), (71, 42, 121), (71, 43, 122), (71, 44, 123), (70, 45, 124), (70, 47, 124), (70, 48, 125), (70, 49, 126), (69, 50, 127), (69, 52, 127), (69, 53, 128), (69, 54, 129), (68, 55, 129), (68, 57, 130), (67, 58, 131), (67, 59, 131), (67, 60, 132), (66, 61, 132), (66, 62, 133), (66, 64, 133), (65, 65, 134), (65, 66, 134), (64, 67, 135), (64, 68, 135), (63, 69, 135), (63, 71, 136), (62, 72, 136), (62, 73, 137), (61, 74, 137), (61, 75, 137), (61, 76, 137), (60, 77, 138), (60, 78, 138), (59, 80, 138), (59, 81, 138), (58, 82, 139), (58, 83, 139), (57, 84, 139), (57, 85, 139), (56, 86, 139), (56, 87, 140), (55, 88, 140), (55, 89, 140), (54, 90, 140), (54, 91, 140), (53, 92, 140), (53, 93, 140), (52, 94, 141), (52, 95, 141), (51, 96, 141), (51, 97, 141), (50, 98, 141), (50, 99, 141), (49, 100, 141), (49, 101, 141), (49, 102, 141), (48, 103, 141), (48, 104, 141), (47, 105, 141), (47, 106, 141), (46, 107, 142), (46, 108, 142), (46, 109, 142), (45, 110, 142), (45, 111, 142), (44, 112, 142), (44, 113, 142), (44, 114, 142), (43, 115, 142), (43, 116, 142), (42, 117, 142), (42, 118, 142), (42, 119, 142), (41, 120, 142), (41, 121, 142), (40, 122, 142), (40, 122, 142), (40, 123, 142), (39, 124, 142), (39, 125, 142), (39, 126, 142), (38, 127, 142), (38, 128, 142), (38, 129, 142), (37, 130, 142), (37, 131, 141), (36, 132, 141), (36, 133, 141), (36, 134, 141), (35, 135, 141), (35, 136, 141), (35, 137, 141), (34, 137, 141), (34, 138, 141), (34, 139, 141), (33, 140, 141), (33, 141, 140), (33, 142, 140), (32, 143, 140), (32, 144, 140), (32, 145, 140), (31, 146, 140), (31, 147, 139), (31, 148, 139), (31, 149, 139), (31, 150, 139), (30, 151, 138), (30, 152, 138), (30, 153, 138), (30, 153, 138), (30, 154, 137), (30, 155, 137), (30, 156, 137), (30, 157, 136), (30, 158, 136), (30, 159, 136), (30, 160, 135), (31, 161, 135), (31, 162, 134), (31, 163, 134), (32, 164, 133), (32, 165, 133), (33, 166, 133), (33, 167, 132), (34, 167, 132), (35, 168, 131), (35, 169, 130), (36, 170, 130), (37, 171, 129), (38, 172, 129), (39, 173, 128), (40, 174, 127), (41, 175, 127), (42, 176, 126), (43, 177, 125), (44, 177, 125), (46, 178, 124), (47, 179, 123), (48, 180, 122), (50, 181, 122), (51, 182, 121), (53, 183, 120), (54, 184, 119), (56, 185, 118), (57, 185, 118), (59, 186, 117), (61, 187, 116), (62, 188, 115), (64, 189, 114), (66, 190, 113), (68, 190, 112), (69, 191, 111), (71, 192, 110), (73, 193, 109), (75, 194, 108), (77, 194, 107), (79, 195, 105), (81, 196, 104), (83, 197, 103), (85, 198, 102), (87, 198, 101), (89, 199, 100), (91, 200, 98), (94, 201, 97), (96, 201, 96), (98, 202, 95), (100, 203, 93), (103, 204, 92), (105, 204, 91), (107, 205, 89), (109, 206, 88), (112, 206, 86), (114, 207, 85), (116, 208, 84), (119, 208, 82), (121, 209, 81), (124, 210, 79), (126, 210, 78), (129, 211, 76), (131, 211, 75), (134, 212, 73), (136, 213, 71), (139, 213, 70), (141, 214, 68), (144, 214, 67), (146, 215, 65), (149, 215, 63), (151, 216, 62), (154, 216, 60), (157, 217, 58), (159, 217, 56), (162, 218, 55), (165, 218, 53), (167, 219, 51), (170, 219, 50), (173, 220, 48), (175, 220, 46), (178, 221, 44), (181, 221, 43), (183, 221, 41), (186, 222, 39), (189, 222, 38), (191, 223, 36), (194, 223, 34), (197, 223, 33), (199, 224, 31), (202, 224, 30), (205, 224, 29), (207, 225, 28), (210, 225, 27), (212, 225, 26), (215, 226, 25), (218, 226, 24), (220, 226, 24), (223, 227, 24), (225, 227, 24), (228, 227, 24), (231, 228, 25), (233, 228, 25), (236, 228, 26), (238, 229, 27), (241, 229, 28), (243, 229, 30), (246, 230, 31), (248, 230, 33), (250, 230, 34), (253, 231, 36)], dtype=np.float)
        position = np.linspace(0, 1, len(colors))
        colors /= 256.0
        cdict = {}
        for i, cname in enumerate(['red', 'green', 'blue']):
            cdict[cname] = [(pos, c[i], c[i]) for pos, c in zip(position, colors)]

        cmap = mpl.colors.LinearSegmentedColormap('custom', cdict, 256)
        cm.register_cmap(name='viridis', cmap=cmap)
        self.viridis_cmap = cmap

    @property
    def db(self):
        return self.application.db

    def send_img_response(self, img_fp):
        self.set_header("Content-Type", "image/png")
        self.write(img_fp.getvalue())

    def _get_intens_list(self, job_id, sf_id, adduct, nrows, ncols):
        res_list_rows = self.db.query(self.INTS_SQL, job_id, sf_id, adduct)
        intens_list = []
        for res_row in res_list_rows:
            img_arr = np.zeros(nrows*ncols)
            img_arr[res_row.inds] = res_row.ints

            # smoothing extreme values
            non_zero_intens = img_arr > 0
            if any(non_zero_intens) > 0:
                perc99_val = np.percentile(img_arr[non_zero_intens], 99)
                img_arr[img_arr > perc99_val] = perc99_val

            intens_list.append(img_arr.reshape(nrows, ncols))

        return np.array(intens_list)

    def _get_ds_mask(self, coords, nrows, ncols):
        rows = coords[:, 1]
        cols = coords[:, 0]
        data = np.ones(coords.shape[0])
        return coo_matrix((data, (rows, cols)), shape=(nrows, ncols)).toarray()

    def get_img_ints(self, ints_list):
        pass

    def _get_color_image_data(self, ds_id, job_id, sf_id, adduct):
        coords_row = self.db.query(self.coord_sql % int(ds_id))[0]
        coords = np.array(zip(coords_row.xs, coords_row.ys))
        coords -= coords.min(axis=0)
        self.ncols, self.nrows = coords.max(axis=0) + 1

        visible_pixels = self.get_img_ints(self._get_intens_list(job_id, sf_id, adduct, self.nrows, self.ncols))
        normalizer = Normalize(vmin=np.min(visible_pixels), vmax=np.max(visible_pixels))
        # color_img_data = np.zeros((nrows, ncols, 4))
        color_img_data = self.viridis_cmap(normalizer(visible_pixels))
        mask = self._get_ds_mask(coords, self.nrows, self.ncols)
        color_img_data[:, :, 3] = mask
        return color_img_data

    def img_show(self, *args):
        pass

    def plot_iso_img(self, ds_id, job_id, sf_id, adduct):
        fig = plt.figure()
        ax = plt.Axes(fig, [0., 0., 1., 1.])
        ax.get_xaxis().set_visible(False)
        ax.get_yaxis().set_visible(False)
        ax.set_axis_off()
        fig.add_axes(ax)

        color_img_data = self._get_color_image_data(ds_id, job_id, sf_id, adduct)
        self.img_show(color_img_data)

        fp = cStringIO.StringIO()
        plt.savefig(fp, format='png', bbox_inches='tight')
        plt.close()
        return fp


class IsoImgPngHandler(IsoImgBaseHandler):

    def initialize(self):
        super(IsoImgPngHandler, self).initialize()
        self.peak_id = None

    @gen.coroutine
    def get(self, db_id, ds_id, job_id, sf_id, sf, adduct, peak_id):
        self.peak_id = int(peak_id)
        img_fp = self.plot_iso_img(int(ds_id), int(job_id), int(sf_id), adduct)
        self.send_img_response(img_fp)

    def get_img_ints(self, ints_list):
        if self.peak_id < len(ints_list):
            return ints_list[self.peak_id]
        else:
            return np.zeros(shape=(self.nrows, self.ncols))

    def img_show(self, color_img_data):
        gcf().gca().imshow(color_img_data, interpolation='nearest', cmap=self.viridis_cmap)


class AggIsoImgPngHandler(IsoImgBaseHandler):

    @gen.coroutine
    def get(self, ds_id, job_id, sf_id, sf, adduct):
        ds_id = int(ds_id)
        job_id = int(job_id)
        sf_id = int(sf_id)

        img_fp = self.plot_iso_img(ds_id, job_id, sf_id, adduct)
        self.send_img_response(img_fp)

    def get_img_ints(self, ints_list):
        return ints_list.sum(axis=0)

    def img_show(self, color_img_data):
        img = gcf().gca().imshow(color_img_data, interpolation='nearest', cmap=self.viridis_cmap)

        divider = make_axes_locatable(gcf().gca())
        cax = divider.append_axes("right", size="5%", pad=0.15)
        cbar = plt.colorbar(img, ticks=[], cax=cax)
        cbar.ax.tick_params(labelsize=12)


class SFPeakMZsHandler(tornado.web.RequestHandler):
    peak_profile_sql = '''select centr_mzs
                       from theor_peaks
                       where db_id = %s and sf_id = %s and adduct = %s'''

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        peaks_dict = self.application.db.query(self.peak_profile_sql, int(db_id), int(sf_id), adduct)[0]
        centr_mzs = peaks_dict['centr_mzs']
        self.write(json.dumps(centr_mzs))
class MinMaxIntHandler(tornado.web.RequestHandler):
    min_max_int_sql = '''SELECT min_int, max_int
                         FROM iso_image
                         WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s;'''

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        min_max_row = self.application.db.query(self.min_max_int_sql, int(job_id), int(db_id), int(sf_id), adduct)[0]
        self.write(json.dumps(min_max_row))


class SpectrumLineChartHandler(tornado.web.RequestHandler):
    PEAK_PROFILE_SQL = '''SELECT centr_mzs, centr_ints, prof_mzs, prof_ints
                          FROM theor_peaks
                          WHERE db_id = %s and sf_id = %s and adduct = %s'''
    SAMPLE_INTENS_SQL = '''SELECT intensities
                           FROM iso_image
                           WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s order by peak'''

    @property
    def db(self):
        return self.application.db

    @staticmethod
    def find_closest_inds(mz_grid, mzs):
        return map(lambda mz: (np.abs(mz_grid - mz)).argmin(), mzs)

    @staticmethod
    def to_str(list_of_numbers):
        return map(lambda x: '%.3f' % x, list(list_of_numbers))

    def convert_to_serial(self, centr_mzs, prof_mzs):
        step = mode(np.diff(prof_mzs)).mode[0]
        min_mz = prof_mzs[0] - 0.25
        max_mz = prof_mzs[-1] + 0.25

        points_n = int(np.round((max_mz - min_mz) / step)) + 1
        mz_grid = np.linspace(min_mz, max_mz, points_n)

        centr_inds = self.find_closest_inds(mz_grid, centr_mzs)
        prof_inds = self.find_closest_inds(mz_grid, prof_mzs)

        return min_mz, max_mz, points_n, centr_inds, prof_inds

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        peaks_dict = self.db.query(self.PEAK_PROFILE_SQL, int(db_id), int(sf_id), adduct)[0]
        prof_mzs = np.array(peaks_dict['prof_mzs'])
        prof_ints = np.array(peaks_dict['prof_ints'])
        centr_mzs = np.array(peaks_dict['centr_mzs'])

        min_mz, max_mz, points_n, centr_inds, prof_inds = self.convert_to_serial(centr_mzs, prof_mzs)

        sample_ints_list = self.db.query(self.SAMPLE_INTENS_SQL, int(job_id), int(db_id), int(sf_id), adduct)
        sample_centr_ints = np.array(map(lambda d: sum(d.values()[0]), sample_ints_list))
        sample_centr_ints_norm = sample_centr_ints / sample_centr_ints.max() * 100

        self.write(json.dumps({
            'mz_grid': {
                'min_mz': min_mz,
                'max_mz': max_mz,
                'points_n': points_n,
            },
            'sample': {
                'inds': centr_inds,
                'ints': self.to_str(sample_centr_ints_norm)
            },
            'theor': {
                'inds': prof_inds,
                'ints': self.to_str(prof_ints)
            }
        }))






