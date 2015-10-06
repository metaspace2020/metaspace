# -*- coding: utf8 -*
"""
.. module:: handlers
    :synopsis: Handlers for the webserver.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

import threading
import Queue
import operator
import math
import cStringIO
import cProfile

import numpy as np
import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen
from tornado.ioloop import IOLoop
import png

import matplotlib as mpl
mpl.use('Agg')
from matplotlib import pyplot as plt

from engine.util import *
from webapp.globalvars import *
from webapp.imaging import write_image
from engine.isocalc import get_iso_peaks



# global variable for special case html files
html_pages = {
}


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

        def wrapper(self, query_id, slug, cProfile_res_list):
            my_print("ajax %s starting..." % query_id)
            my_print("%s" % query_id)
            my_print("%s" % slug)
            draw = self.get_argument('draw', 0)
            input_id = ""
            if len(slug) > 0:
                input_id = get_id_from_slug(slug)

            if query_id in ['formulas', 'substancejobs', 'jobs', 'datasets', 'demobigtable']:
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
                else:
                    my_print(q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
                    count = int(self.db.query(q_count)[0]['count'])
                    res = self.db.query(
                        q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
                res_dict = self.make_datatable_dict(draw, count,
                                                    [[row[x] for x in sql_fields[query_id]] for row in res])

            elif query_id == 'imagegame':
                res_dict = {"draw": draw,
                            "im1": self.load_random_image(),
                            "im2": self.load_random_image()
                            }

            else:
                if query_id == 'jobstats':
                    arr = input_id.split('/')
                    if len(arr) > 1:
                        final_query = sql_queries[query_id] % arr[0] + " AND s.formula_id='%s'" % arr[1]
                    else:
                        final_query = sql_queries[query_id] % input_id
                elif query_id == 'demosubst':
                    arr = input_id.split('/')
                    spectrum = get_iso_peaks(arr[2])
                    spec_add = {ad: get_iso_peaks(arr[2] + ad) for ad in adducts}
                    coords_q = self.db.query(sql_queries['democoords'] % int(arr[3]))
                    coords = {row["index"]: [row["x"], row["y"]] for row in coords_q}
                    final_query = sql_queries[query_id] % (int(arr[0]), arr[1], int(arr[1]))
                else:
                    final_query = sql_queries[query_id] % input_id
                my_print(final_query)
                res_list = self.db.query(final_query)
                if query_id == 'fullimages':
                    res_dict = {"data": [[x[field] for field in sql_fields[query_id]] for x in res_list]}
                elif query_id == 'demosubst':
                    adduct_dict = {}

                    for row in res_list:
                        if adducts[row["adduct"]] not in adduct_dict:
                            adduct_dict[adducts[row["adduct"]]] = []
                        adduct_dict[adducts[row["adduct"]]].append(row)
                    res_dict = {"data": {k: sorted(v, key=lambda x: x["peak"]) for k, v in adduct_dict.iteritems()},
                                "spec": spectrum, "spadd": spec_add
                                }
                    for k, v in res_dict["data"].iteritems():
                        for imInd in xrange(len(v)):
                            v[imInd]["val"] = np.array(v[imInd]["val"])
                            im_q = np.percentile(v[imInd]["val"], 99.0)
                            im_rep = v[imInd]["val"] > im_q
                            v[imInd]["val"][im_rep] = im_q
                            v[imInd]["val"] = list(v[imInd]["val"])
                    res_dict.update({"coords": coords})
                else:
                    res_dict = res_list[0]
                # add isotopes for the substance query
                if query_id == "substance":
                    res_dict.update({"all_datasets": self.application.all_datasets})
                    res_dict.update(get_iso_peaks(res_dict["sf"]))
                res_dict.update({"draw": draw})
            cProfile_res_list.append(res_dict)

        res = []
        if args.time_profiling_enabled:
            cProfile.runctx("wrapper(self, query_id, slug, res)", globals(), locals())
        else:
            wrapper(self, query_id, slug, res)
        res_dict = res[0]
        my_print("ajax %s processed, returning..." % query_id)
        t0 = datetime.now()
        self.write(json.dumps(res_dict, cls=DateTimeEncoder))
        self.flush(callback=flushed_callback(t0))

    # @gen.coroutine
    # def post(self, query_id, slug):
    #     my_print("ajax post " + query_id)
    #     if query_id in ['postgameimages']:
    #         my_print("%s" % self.request.body)
    #         self.db.query("INSERT INTO game_results VALUES ('%s', '%s')" % (datetime.now(), json.dumps({
    #             "meta1": {
    #                 "job_id": self.get_argument("m1_job_id"),
    #                 "dataset_id": self.get_argument("m1_dataset_id"),
    #                 "formula_id": self.get_argument("m1_formula_id"),
    #                 "adduct": self.get_argument("m1_adduct"),
    #                 "param": self.get_argument("m1_param"),
    #                 "peak": self.get_argument("m1_peak")
    #             },
    #             "meta2": {
    #                 "job_id": self.get_argument("m2_job_id"),
    #                 "dataset_id": self.get_argument("m2_dataset_id"),
    #                 "formula_id": self.get_argument("m2_formula_id"),
    #                 "adduct": self.get_argument("m2_adduct"),
    #                 "param": self.get_argument("m2_param"),
    #                 "peak": self.get_argument("m2_peak")
    #             },
    #             "ans": self.get_argument("chosen"),
    #         })))


class IndexHandler(tornado.web.RequestHandler):
    """Tornado handler for the index page."""

    @gen.coroutine
    def get(self):
        self.render("html/demo-png.html", sparkactivated=args.spark)


class IndexHandlerBeta(tornado.web.RequestHandler):
    """Tornado handler for the index page."""

    @gen.coroutine
    def get(self):
        self.render("html/index-beta.html")


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


# class IsoImgMetaHandler(IsoImgBaseHandler):
#
#     @gen.coroutine
#     def get(self, *args, **kwargs):
#         key = '_'.join(args)
#         min_int, max_int = self.min_max_ints_cache[key]
#
#         colorbar_img_fp = self.create_colorbar(min_int, max_int)
#
#         self.set_header("Content-Type", "image/png")
#         self.write(colorbar_img_fp.getvalue())
#         return
#
#     def create_colorbar(self, min_int, max_int):
#         # Make a figure and axes with dimensions as desired.
#         fig = plt.figure(figsize=(0.2, 3))
#         ax1 = fig.add_axes([0, 0, 1, 1])
#         ax1.get_xaxis().set_visible(False)
#         # plt.tick_params(axis='both', which='major', labelsize=12)
#
#         cmap = mpl.colors.ListedColormap(map(lambda t: map(lambda x: float(x)/255, t), self.colormap))
#         norm = mpl.colors.Normalize(vmin=min_int, vmax=max_int)
#
#         # ColorbarBase derives from ScalarMappable and puts a colorbar
#         # in a specified axes, so it has everything needed for a
#         # standalone colorbar.  There are many more kwargs, but the
#         # following gives a basic continuous colorbar with ticks
#         # and labels.
#         cb = mpl.colorbar.ColorbarBase(ax1, cmap=cmap, norm=norm, orientation='vertical')
#         # cb.set_label('MZ')
#
#         fp = cStringIO.StringIO()
#         fig.savefig(fp)
#         return fp


class IsoImgBaseHandler(tornado.web.RequestHandler):
    query_id = "demosubst"
    # Viridis
    colormap = np.array([(68, 1, 84), (68, 2, 85), (68, 3, 87), (69, 5, 88), (69, 6, 90), (69, 8, 91), (70, 9, 92), (70, 11, 94), (70, 12, 95), (70, 14, 97), (71, 15, 98), (71, 17, 99), (71, 18, 101), (71, 20, 102), (71, 21, 103), (71, 22, 105), (71, 24, 106), (72, 25, 107), (72, 26, 108), (72, 28, 110), (72, 29, 111), (72, 30, 112), (72, 32, 113), (72, 33, 114), (72, 34, 115), (72, 35, 116), (71, 37, 117), (71, 38, 118), (71, 39, 119), (71, 40, 120), (71, 42, 121), (71, 43, 122), (71, 44, 123), (70, 45, 124), (70, 47, 124), (70, 48, 125), (70, 49, 126), (69, 50, 127), (69, 52, 127), (69, 53, 128), (69, 54, 129), (68, 55, 129), (68, 57, 130), (67, 58, 131), (67, 59, 131), (67, 60, 132), (66, 61, 132), (66, 62, 133), (66, 64, 133), (65, 65, 134), (65, 66, 134), (64, 67, 135), (64, 68, 135), (63, 69, 135), (63, 71, 136), (62, 72, 136), (62, 73, 137), (61, 74, 137), (61, 75, 137), (61, 76, 137), (60, 77, 138), (60, 78, 138), (59, 80, 138), (59, 81, 138), (58, 82, 139), (58, 83, 139), (57, 84, 139), (57, 85, 139), (56, 86, 139), (56, 87, 140), (55, 88, 140), (55, 89, 140), (54, 90, 140), (54, 91, 140), (53, 92, 140), (53, 93, 140), (52, 94, 141), (52, 95, 141), (51, 96, 141), (51, 97, 141), (50, 98, 141), (50, 99, 141), (49, 100, 141), (49, 101, 141), (49, 102, 141), (48, 103, 141), (48, 104, 141), (47, 105, 141), (47, 106, 141), (46, 107, 142), (46, 108, 142), (46, 109, 142), (45, 110, 142), (45, 111, 142), (44, 112, 142), (44, 113, 142), (44, 114, 142), (43, 115, 142), (43, 116, 142), (42, 117, 142), (42, 118, 142), (42, 119, 142), (41, 120, 142), (41, 121, 142), (40, 122, 142), (40, 122, 142), (40, 123, 142), (39, 124, 142), (39, 125, 142), (39, 126, 142), (38, 127, 142), (38, 128, 142), (38, 129, 142), (37, 130, 142), (37, 131, 141), (36, 132, 141), (36, 133, 141), (36, 134, 141), (35, 135, 141), (35, 136, 141), (35, 137, 141), (34, 137, 141), (34, 138, 141), (34, 139, 141), (33, 140, 141), (33, 141, 140), (33, 142, 140), (32, 143, 140), (32, 144, 140), (32, 145, 140), (31, 146, 140), (31, 147, 139), (31, 148, 139), (31, 149, 139), (31, 150, 139), (30, 151, 138), (30, 152, 138), (30, 153, 138), (30, 153, 138), (30, 154, 137), (30, 155, 137), (30, 156, 137), (30, 157, 136), (30, 158, 136), (30, 159, 136), (30, 160, 135), (31, 161, 135), (31, 162, 134), (31, 163, 134), (32, 164, 133), (32, 165, 133), (33, 166, 133), (33, 167, 132), (34, 167, 132), (35, 168, 131), (35, 169, 130), (36, 170, 130), (37, 171, 129), (38, 172, 129), (39, 173, 128), (40, 174, 127), (41, 175, 127), (42, 176, 126), (43, 177, 125), (44, 177, 125), (46, 178, 124), (47, 179, 123), (48, 180, 122), (50, 181, 122), (51, 182, 121), (53, 183, 120), (54, 184, 119), (56, 185, 118), (57, 185, 118), (59, 186, 117), (61, 187, 116), (62, 188, 115), (64, 189, 114), (66, 190, 113), (68, 190, 112), (69, 191, 111), (71, 192, 110), (73, 193, 109), (75, 194, 108), (77, 194, 107), (79, 195, 105), (81, 196, 104), (83, 197, 103), (85, 198, 102), (87, 198, 101), (89, 199, 100), (91, 200, 98), (94, 201, 97), (96, 201, 96), (98, 202, 95), (100, 203, 93), (103, 204, 92), (105, 204, 91), (107, 205, 89), (109, 206, 88), (112, 206, 86), (114, 207, 85), (116, 208, 84), (119, 208, 82), (121, 209, 81), (124, 210, 79), (126, 210, 78), (129, 211, 76), (131, 211, 75), (134, 212, 73), (136, 213, 71), (139, 213, 70), (141, 214, 68), (144, 214, 67), (146, 215, 65), (149, 215, 63), (151, 216, 62), (154, 216, 60), (157, 217, 58), (159, 217, 56), (162, 218, 55), (165, 218, 53), (167, 219, 51), (170, 219, 50), (173, 220, 48), (175, 220, 46), (178, 221, 44), (181, 221, 43), (183, 221, 41), (186, 222, 39), (189, 222, 38), (191, 223, 36), (194, 223, 34), (197, 223, 33), (199, 224, 31), (202, 224, 30), (205, 224, 29), (207, 225, 28), (210, 225, 27), (212, 225, 26), (215, 226, 25), (218, 226, 24), (220, 226, 24), (223, 227, 24), (225, 227, 24), (228, 227, 24), (231, 228, 25), (233, 228, 25), (236, 228, 26), (238, 229, 27), (241, 229, 28), (243, 229, 30), (246, 230, 31), (248, 230, 33), (250, 230, 34), (253, 231, 36)])

    @property
    def db(self):
        return self.application.db

    def send_img_response(self, img_fp):
        self.set_header("Content-Type", "image/png")
        self.write(img_fp.getvalue())

    def res_dict(self, query_id, dataset_id, job_id, sf_id, sf):
        coords_q = self.db.query(sql_queries['democoords'] % int(dataset_id))
        coords = [r.values() for r in coords_q]

        dimensions = self.db.query("SELECT nrows, ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % (job_id))[0]
        rows, cols = dimensions.values()
        final_query = sql_queries[query_id] % (job_id, sf_id, sf_id)
        res_list = self.db.query(final_query)
        intens_list = np.array([np.array(r.values()[3]) for r in res_list])

        # smoothing extreme values
        for intens in intens_list:
            non_zero_intens = intens > 0
            if any(non_zero_intens) > 0:
                perc99_val = np.percentile(intens[non_zero_intens], 99.0)
                intens[intens > perc99_val] = perc99_val

        return intens_list, coords, rows, cols


class IsoImgPngHandler(IsoImgBaseHandler):

    @gen.coroutine
    def get(self, *args):
        dataset_id, job_id, sf_id, sf, adduct, peak_id = args
        ints_list, coords, rows, cols = self.res_dict(self.query_id, int(dataset_id), int(job_id), int(sf_id), sf)

        # peak_mzs = self.db.query("SELECT nrows, ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % (job_id))[0]

        img_ints = ints_list[peak_id]

        img_fp = self.create_iso_img(img_ints.reshape(rows, cols), 1233.233, 0.234)
        self.send_img_response(img_fp)

    def create_iso_img(self, img_data, peak_mz, spatial_presence):
        # Make a figure and axes with dimensions as desired.
        fig, ax = plt.subplots(figsize=(5, 5))
        cmap = mpl.colors.ListedColormap(self.colormap.astype(float) / 255)
        ax.get_xaxis().set_visible(False)
        ax.get_yaxis().set_visible(False)
        plt.imshow(img_data, interpolation='nearest', cmap=cmap, vmin=img_data.min(), vmax=img_data.max())
        plt.figtext(0.4, 0.92, '%.3f' % peak_mz, size=14)

        fp = cStringIO.StringIO()
        fig.savefig(fp, format='png')
        return fp


class AggIsoImgPngHandler(IsoImgBaseHandler):

    @gen.coroutine
    def get(self, *args):
        # request_as_tuple = (dataset_id, job_id, sf_id, sf)
        # request_as_tuple_long = (dataset_id, job_id, sf_id, sf, adduct, peak_id)
        # key = '_'.join(args)
        # min_int, max_int = self.min_max_ints_cache[key]

        dataset_id, job_id, sf_id, sf = args
        ints_list, coords, rows, cols = self.res_dict(self.query_id, int(dataset_id), int(job_id), int(sf_id), sf)

        img_ints = ints_list.sum(axis=0)
        img_fp = self.create_iso_img(img_ints.reshape(rows, cols))
        self.send_img_response(img_fp)

    def create_iso_img(self, img_data):
        fig, ax = plt.subplots(figsize=(7, 5))
        cmap = mpl.colors.ListedColormap(self.colormap.astype(float) / 255)
        ax.get_xaxis().set_visible(False)
        ax.get_yaxis().set_visible(False)
        img = plt.imshow(img_data, interpolation='nearest', cmap=cmap, vmin=img_data.min(), vmax=img_data.max())
        cbar = plt.colorbar(img, ticks=[img_data.min(), (img_data.max() - img_data.min())/2, img_data.max()])
        cbar.ax.tick_params(labelsize=12)

        fp = cStringIO.StringIO()
        fig.savefig(fp, format='png')
        return fp
