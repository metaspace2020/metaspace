import numpy as np
from scipy.sparse import coo_matrix
import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen
import matplotlib as mpl
import matplotlib.cm as cm
from matplotlib.colors import Normalize
import cStringIO
import png


INTS_SQL = ('SELECT pixel_inds inds, intensities as ints '
            'FROM iso_image img '
            'JOIN job j ON img.job_id=j.id '
            'WHERE j.id=%s AND img.db_id=%s AND img.sf_id=%s AND adduct=%s '
            'ORDER BY peak')
PEAKS_N_SEL = 'SELECT peaks_n FROM iso_image_metrics WHERE sf_id=%s AND adduct=%s AND job_id=%s AND db_id=%s'
BOUNDS_SEL = ('SELECT img_bounds '
              'FROM job j '
              'JOIN dataset d on d.id=j.ds_id '
              'WHERE j.id=%s')
COORD_SEL = 'SELECT xs, ys FROM coordinates WHERE ds_id=%s'


class IsoImgBaseHandler(tornado.web.RequestHandler):
    # Viridis
    colors = np.array([(68, 1, 84), (68, 2, 85), (68, 3, 87), (69, 5, 88), (69, 6, 90), (69, 8, 91), (70, 9, 92), (70, 11, 94), (70, 12, 95), (70, 14, 97), (71, 15, 98), (71, 17, 99), (71, 18, 101), (71, 20, 102), (71, 21, 103), (71, 22, 105), (71, 24, 106), (72, 25, 107), (72, 26, 108), (72, 28, 110), (72, 29, 111), (72, 30, 112), (72, 32, 113), (72, 33, 114), (72, 34, 115), (72, 35, 116), (71, 37, 117), (71, 38, 118), (71, 39, 119), (71, 40, 120), (71, 42, 121), (71, 43, 122), (71, 44, 123), (70, 45, 124), (70, 47, 124), (70, 48, 125), (70, 49, 126), (69, 50, 127), (69, 52, 127), (69, 53, 128), (69, 54, 129), (68, 55, 129), (68, 57, 130), (67, 58, 131), (67, 59, 131), (67, 60, 132), (66, 61, 132), (66, 62, 133), (66, 64, 133), (65, 65, 134), (65, 66, 134), (64, 67, 135), (64, 68, 135), (63, 69, 135), (63, 71, 136), (62, 72, 136), (62, 73, 137), (61, 74, 137), (61, 75, 137), (61, 76, 137), (60, 77, 138), (60, 78, 138), (59, 80, 138), (59, 81, 138), (58, 82, 139), (58, 83, 139), (57, 84, 139), (57, 85, 139), (56, 86, 139), (56, 87, 140), (55, 88, 140), (55, 89, 140), (54, 90, 140), (54, 91, 140), (53, 92, 140), (53, 93, 140), (52, 94, 141), (52, 95, 141), (51, 96, 141), (51, 97, 141), (50, 98, 141), (50, 99, 141), (49, 100, 141), (49, 101, 141), (49, 102, 141), (48, 103, 141), (48, 104, 141), (47, 105, 141), (47, 106, 141), (46, 107, 142), (46, 108, 142), (46, 109, 142), (45, 110, 142), (45, 111, 142), (44, 112, 142), (44, 113, 142), (44, 114, 142), (43, 115, 142), (43, 116, 142), (42, 117, 142), (42, 118, 142), (42, 119, 142), (41, 120, 142), (41, 121, 142), (40, 122, 142), (40, 122, 142), (40, 123, 142), (39, 124, 142), (39, 125, 142), (39, 126, 142), (38, 127, 142), (38, 128, 142), (38, 129, 142), (37, 130, 142), (37, 131, 141), (36, 132, 141), (36, 133, 141), (36, 134, 141), (35, 135, 141), (35, 136, 141), (35, 137, 141), (34, 137, 141), (34, 138, 141), (34, 139, 141), (33, 140, 141), (33, 141, 140), (33, 142, 140), (32, 143, 140), (32, 144, 140), (32, 145, 140), (31, 146, 140), (31, 147, 139), (31, 148, 139), (31, 149, 139), (31, 150, 139), (30, 151, 138), (30, 152, 138), (30, 153, 138), (30, 153, 138), (30, 154, 137), (30, 155, 137), (30, 156, 137), (30, 157, 136), (30, 158, 136), (30, 159, 136), (30, 160, 135), (31, 161, 135), (31, 162, 134), (31, 163, 134), (32, 164, 133), (32, 165, 133), (33, 166, 133), (33, 167, 132), (34, 167, 132), (35, 168, 131), (35, 169, 130), (36, 170, 130), (37, 171, 129), (38, 172, 129), (39, 173, 128), (40, 174, 127), (41, 175, 127), (42, 176, 126), (43, 177, 125), (44, 177, 125), (46, 178, 124), (47, 179, 123), (48, 180, 122), (50, 181, 122), (51, 182, 121), (53, 183, 120), (54, 184, 119), (56, 185, 118), (57, 185, 118), (59, 186, 117), (61, 187, 116), (62, 188, 115), (64, 189, 114), (66, 190, 113), (68, 190, 112), (69, 191, 111), (71, 192, 110), (73, 193, 109), (75, 194, 108), (77, 194, 107), (79, 195, 105), (81, 196, 104), (83, 197, 103), (85, 198, 102), (87, 198, 101), (89, 199, 100), (91, 200, 98), (94, 201, 97), (96, 201, 96), (98, 202, 95), (100, 203, 93), (103, 204, 92), (105, 204, 91), (107, 205, 89), (109, 206, 88), (112, 206, 86), (114, 207, 85), (116, 208, 84), (119, 208, 82), (121, 209, 81), (124, 210, 79), (126, 210, 78), (129, 211, 76), (131, 211, 75), (134, 212, 73), (136, 213, 71), (139, 213, 70), (141, 214, 68), (144, 214, 67), (146, 215, 65), (149, 215, 63), (151, 216, 62), (154, 216, 60), (157, 217, 58), (159, 217, 56), (162, 218, 55), (165, 218, 53), (167, 219, 51), (170, 219, 50), (173, 220, 48), (175, 220, 46), (178, 221, 44), (181, 221, 43), (183, 221, 41), (186, 222, 39), (189, 222, 38), (191, 223, 36), (194, 223, 34), (197, 223, 33), (199, 224, 31), (202, 224, 30), (205, 224, 29), (207, 225, 28), (210, 225, 27), (212, 225, 26), (215, 226, 25), (218, 226, 24), (220, 226, 24), (223, 227, 24), (225, 227, 24), (228, 227, 24), (231, 228, 25), (233, 228, 25), (236, 228, 26), (238, 229, 27), (241, 229, 28), (243, 229, 30), (246, 230, 31), (248, 230, 33), (250, 230, 34), (253, 231, 36)], dtype=np.float)
    colors /= 256.0
    cdict = {}
    position = np.linspace(0, 1, len(colors))
    for i, cname in enumerate(['red', 'green', 'blue']):
        cdict[cname] = [(pos, c[i], c[i]) for pos, c in zip(position, colors)]
    cmap = mpl.colors.LinearSegmentedColormap('custom', cdict, 256)
    cm.register_cmap(name='viridis', cmap=cmap)
    viridis_cmap = cmap

    def initialize(self):
        self.nrows = None
        self.ncols = None

    @property
    def db(self):
        return self.application.db

    def send_img_response(self, img_fp):
        self.set_header("Content-Type", "image/png")
        self.write(img_fp.getvalue())

    def _get_intens_list(self, job_id, db_id, sf_id, adduct, nrows, ncols):
        res_list_rows = self.db.query(INTS_SQL, job_id, db_id, sf_id, adduct)
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

    @staticmethod
    def _get_ds_mask(coords, nrows, ncols):
        rows = coords[:, 1]
        cols = coords[:, 0]
        data = np.ones(coords.shape[0])
        return coo_matrix((data, (rows, cols)), shape=(nrows, ncols)).toarray() > 0

    def get_img_ints(self, ints_list):
        pass

    # TODO: get rid of matplotlib
    def _get_color_image_data(self, ds_id, job_id, db_id, sf_id, adduct):
        coords_row = self.db.query(COORD_SEL % int(ds_id))[0]
        coords = np.array(zip(coords_row.xs, coords_row.ys))
        coords -= coords.min(axis=0)
        self.ncols, self.nrows = coords.max(axis=0) + 1

        mask = self._get_ds_mask(coords, self.nrows, self.ncols)
        int_list = self._get_intens_list(job_id, db_id, sf_id, adduct, self.nrows, self.ncols)
        if int_list.size > 0:
            visible_pixels = self.get_img_ints(int_list)
            normalizer = Normalize(vmin=np.min(visible_pixels), vmax=np.max(visible_pixels))
            color_img_data = self.viridis_cmap(normalizer(visible_pixels))
        else:
            color_img_data = np.zeros(shape=(self.nrows, self.ncols, 4))
        color_img_data[:, :, 3] = mask
        return color_img_data

    def gen_iso_img(self, ds_id, job_id, sf_id, adduct, color_img_data):
        img_bounds = self.db.query(BOUNDS_SEL, job_id)[0]['img_bounds']
        nrows = img_bounds['y']['max'] - img_bounds['y']['min'] + 1
        ncols = img_bounds['x']['max'] - img_bounds['x']['min'] + 1

        fp = cStringIO.StringIO()
        png_writer = png.Writer(width=ncols, height=nrows, alpha=True)
        png_writer.write(fp, color_img_data.reshape(nrows, -1) * 255)
        return fp


class IsoImgPngHandler(IsoImgBaseHandler):

    def initialize(self):
        super(IsoImgPngHandler, self).initialize()
        self.peak_id = None

    @gen.coroutine
    def get(self, db_id, ds_id, job_id, sf_id, sf, adduct, peak_id):
        self.peak_id = int(peak_id)

        color_img_data = self._get_color_image_data(ds_id, job_id, db_id, sf_id, adduct)
        if color_img_data[:,:,:3].sum() > 0:
            img_fp = self.gen_iso_img(int(ds_id), int(job_id), int(sf_id), adduct, color_img_data)
            self.send_img_response(img_fp)
        else:
            self.redirect('/static/iso_placeholder.png')

    def get_img_ints(self, ints_list):
        if self.peak_id < len(ints_list):
            return ints_list[self.peak_id]
        else:
            return np.zeros(shape=(self.nrows, self.ncols))


class AggIsoImgPngHandler(IsoImgBaseHandler):

    @gen.coroutine
    def get(self, db_id, ds_id, job_id, sf_id, sf, adduct):
        ds_id = int(ds_id)
        job_id = int(job_id)
        sf_id = int(sf_id)

        color_img_data = self._get_color_image_data(ds_id, job_id, db_id, sf_id, adduct)
        if color_img_data[:,:,:3].sum() > 0:
            img_fp = self.gen_iso_img(ds_id, job_id, sf_id, adduct, color_img_data)
            self.send_img_response(img_fp)
        else:
            self.redirect('/static/iso_placeholder.png')

    def get_img_ints(self, ints_list):
        return ints_list.sum(axis=0)
