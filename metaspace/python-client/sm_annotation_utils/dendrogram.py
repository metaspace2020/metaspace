# The MIT License (MIT)

# Copyright (c) 2016 Plotly, Inc
# Copyright (c) 2016 Alexandrov Team (added 'method' and 'metric' arguments)

# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from plotly.graph_objs import graph_objs
from plotly.tools import FigureFactory as FF

import numpy as np
import scipy as scp
import scipy.cluster.hierarchy as sch
from collections import OrderedDict

class Dendrogram(FF):
    def __init__(self, X, orientation='bottom', labels=None, colorscale=None,
                 width="100%", height="100%", xaxis='xaxis', yaxis='yaxis',
                 method='complete', metric='euclidean'):
        self.orientation = orientation
        self.labels = labels
        self.xaxis = xaxis
        self.yaxis = yaxis
        self.method = method
        self.metric = metric
        self.data = []
        self.leaves = []
        self.layout = {self.xaxis: {}, self.yaxis: {}}

        self.sign = {}
        self.sign[self.xaxis] = 1 if self.orientation in ['left', 'bottom'] else -1
        self.sign[self.yaxis] = 1 if self.orientation in ['right', 'bottom'] else -1

        (dd_traces, xvals, yvals,
            ordered_labels, leaves) = self.get_dendrogram_traces(X, colorscale)

        self.labels = ordered_labels
        self.leaves = leaves

        self.zero_vals = np.unique(xvals[yvals == 0.0])

        self.layout = self.set_figure_layout(width, height)
        self.data = graph_objs.Data(dd_traces)

    def get_color_dict(self, colorscale):
        d = {'r': 'red', 'g': 'green', 'b': 'blue', 'c': 'cyan',
             'm': 'magenta', 'y': 'yellow', 'k': 'black', 'w': 'white'}
        default_colors = OrderedDict(sorted(d.items(), key=lambda t: t[0]))

        if colorscale is None:
            colorscale = [
                'rgb(0,116,217)', 'rgb(35,205,205)', 'rgb(61,153,112)', 'rgb(40,35,35)',
                'rgb(133,20,75)', 'rgb(255,65,54)', 'rgb(255,255,255)', 'rgb(255,220,0)']

        for key, color in zip(default_colors.keys(), colorscale):
            default_colors[key] = color

        return default_colors

    def set_axis_layout(self, axis_key):
        axis_defaults = {
            'type': 'linear',
            'ticks': 'outside',
            'mirror': 'allticks',
            'rangemode': 'tozero',
            'showticklabels': True,
            'zeroline': False,
            'showgrid': False,
            'showline': True,
        }

        if len(self.labels) != 0:
            axis_key_labels = self.xaxis
            if self.orientation in ['left', 'right']:
                axis_key_labels = self.yaxis
            if axis_key_labels not in self.layout:
                self.layout[axis_key_labels] = {}
            self.layout[axis_key_labels]['tickvals'] = \
                list(self.zero_vals * self.sign[axis_key])

            self.layout[axis_key_labels]['ticktext'] = self.labels
            self.layout[axis_key_labels]['tickmode'] = 'array'

        self.layout[axis_key].update(axis_defaults)

        return self.layout[axis_key]

    def set_figure_layout(self, width, height):
        self.layout.update({
            'showlegend': False,
            'autosize': False,
            'hovermode': 'closest',
            'width': width,
            'height': height
        })

        self.set_axis_layout(self.xaxis)
        self.set_axis_layout(self.yaxis)

        return self.layout

    def get_dendrogram_traces(self, X, colorscale):
        from plotly.graph_objs import graph_objs
        Z = sch.linkage(X, method=self.method, metric=self.metric)
        P = sch.dendrogram(Z, orientation=self.orientation,
                           labels=self.labels, no_plot=True)

        icoord = scp.array(P['icoord'])
        dcoord = scp.array(P['dcoord'])
        ordered_labels = scp.array(P['ivl'])
        color_list = scp.array(P['color_list'])
        colors = self.get_color_dict(colorscale)

        trace_list = []

        def trace_axis(axis):
            try:
                return axis[0] + str(int(axis[-1]))
            except:
                return axis[0]

        for xs, ys, color_key in zip(icoord, dcoord, color_list):
            if self.orientation not in ['top', 'bottom']:
                xs, ys = ys, xs

            trace = graph_objs.Scatter(
                x=xs * self.sign[self.xaxis],
                y=ys * self.sign[self.yaxis],
                mode='lines',
                xaxis=trace_axis(self.xaxis),
                yaxis=trace_axis(self.yaxis),
                marker=graph_objs.Marker(color=colors[color_key])
            )

            trace_list.append(trace)

        return trace_list, icoord, dcoord, ordered_labels, P['leaves']

def create_dendrogram(X, orientation='bottom', labels=None,
                      method='complete', metric='euclidean', colorscale=None):
    d = Dendrogram(X, orientation, labels, colorscale, method=method, metric=metric)
    return {'layout': d.layout, 'data': d.data}
