import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd

def rarefaction_curve(df, granularity=20, n_reps=2, plot_args={}):
    x = np.linspace(0, df.shape[0], granularity, dtype=int)
    n_mean = []
    n_std = []
    for n in x:
        tmp = []
        for ii in range(n_reps):
            tmp.append(np.sum(df.sample(n=n, replace=False).sum(axis=0).values > 0))
        n_mean.append(np.mean(tmp))
        n_std.append(np.std(tmp))
    plt.figure()
    plt.fill_between(x, np.asarray(n_mean) - np.asarray(n_std), np.asarray(n_mean) + np.asarray(n_std))
    plt.plot(x, n_mean, **plot_args)
    plt.xlabel('Number of datasets')
    plt.ylabel('Number of unique formula annotations')
    plt.title('Rarefaction Curve')
    plt.show()

def bar_attributes(an, me, columns, fdr):
    me['n_annotations'] = an.apply(np.sum, axis=1)
    me = me[columns + ['n_annotations',]]
    pt = pd.pivot_table(me, index=columns[0], columns=columns[1:], values = 'n_annotations', aggfunc='mean')
    pt.plot.bar(
            yerr=pd.pivot_table(me, index=columns[0], columns=columns[1:], values = 'n_annotations', aggfunc='std'),
        )\
        .legend(bbox_to_anchor=(1., 0.5))
    plt.title('Annotations per dataset at fdr {} '.format(fdr))
    return pt

def bar_and_pie(classannotations_df, class_names, sort=False, min_pct=None):
    if isinstance(classannotations_df, pd.DataFrame):
        plot_df = classannotations_df[class_names].sum()
    else:
        plot_df = classannotations_df
    if min_pct:
        other = plot_df.loc[plot_df/plot_df.max()<(min_pct/100.)].sum()
        plot_df = plot_df.loc[plot_df/plot_df.max()>(min_pct/100.)]
        plot_df['other'] = other
    if sort:
        plot_df.sort_values(inplace=True)
    g = sns.barplot(plot_df.index, plot_df.values,palette="Blues_d")
    plt.xticks(0.25+np.arange(len(plot_df.index)), plot_df.index, rotation=60, ha='right')
    plt.show()

    cmap = sns.color_palette('Blues_d', n_colors = len(plot_df))
    plt.get_cmap("Blues_r")
    f = plt.figure()
    plt.pie(plot_df.values, labels=plot_df.index, colors=cmap)
    plt.axis('equal')
    plt.show()
    return g, f


def bar_by_class(classannotations_df, metadata_df, class_names, meta_to_group, fdr, q_clip=False, palette="Paired", labels=None):
    plot_df = classannotations_df[class_names]
    if q_clip:
        plot_df = plot_df[plot_df.columns[plot_df.sum(axis=0)/(plot_df.sum(axis=0).max())>q_clip]]
    m = pd.melt(pd.concat([plot_df, metadata_df], axis=1), id_vars=metadata_df.columns.values)
    f = plt.figure()
    ax = plt.axes()
    sns.set_palette(palette, n_colors=plot_df.shape[1])
    g = sns.barplot(y=meta_to_group, x='value', hue='variable', data=m,  ax=ax)
    plt.xlabel('Total Annotations per Class')
    plt.title('Class Summary at FDR {}'.format(fdr))
    if labels:
        plt.xticks(labels)
    plt.show()
    return g, f


def bar_by_ds(classannotations_df, metadata_df, class_names, meta_to_group, fdr, palette="Paired", labels=None):
    plot_df = classannotations_df[class_names]
    m = pd.melt(pd.concat([plot_df, metadata_df], axis=1), id_vars=metadata_df.columns.values)
    f = plt.figure(figsize=(20, 20))
    ax = plt.axes()
    g = sns.barplot(x=meta_to_group, y='value', hue='variable', data=m, palette=palette, ax=ax, saturation=0.8)
    plt.xlabel('Total Annotations per Class')
    plt.title('Class Summary at FDR {}'.format(fdr))
    plt.show()
    return g, f

# Credit: https://github.com/ksahlin/pyinfor/blob/master/venn.py
import pylab
from matplotlib.patches import Circle, Ellipse, Rectangle, Polygon
from itertools import chain
from collections import Iterable
from matplotlib_venn import venn3

#--------------------------------------------------------------------
alignment = {'horizontalalignment':'center', 'verticalalignment':'center'}

#--------------------------------------------------------------------
def venn(data, names=None, fill="number", show_names=True, show_plot=True, **kwds):
    """
    data: a list
    names: names of groups in data
    fill = ["number"|"logic"|"both"], fill with number, logic label, or both
    show_names = [True|False]
    show_plot = [True|False]
    """

    if data is None:
        raise Exception("No data!")
    if len(data) == 2:
        fig, ax = venn2(data, names, fill, show_names, show_plot, **kwds)
    elif len(data) == 3:

        if 'colors' in kwds:
            set_colors = kwds['colors']
        else:
            set_colors = ['r', 'g', 'b']

        venn3(data, names, set_colors=set_colors, alpha=0.85
              )
        fig, ax = None, None
    elif len(data) == 4:
        #fig, ax = venn4(data, names, fill, show_names, show_plot, **kwds)
        fig, ax = venn4_square(data, names, fill, show_names, show_plot, **kwds)
    else:
        raise Exception("currently only 2-4 sets venn diagrams are supported")
    return fig, ax
#--------------------------------------------------------------------
def get_labels(data, fill="number"):
    """
    to get a dict of labels for groups in data
    input
      data: data to get label for
      fill = ["number"|"logic"|"both"], fill with number, logic label, or both
    return
      labels: a dict of labels for different sets
    example:
    In [12]: get_labels([range(10), range(5,15), range(3,8)], fill="both")
    Out[12]:
    {'001': '001: 0',
     '010': '010: 5',
     '011': '011: 0',
     '100': '100: 3',
     '101': '101: 2',
     '110': '110: 2',
     '111': '111: 3'}
    """

    N = len(data)

    sets_data = [set(data[i]) for i in range(N)]  # sets for separate groups
    s_all = set(chain(*data))                             # union of all sets

    # bin(3) --> '0b11', so bin(3).split('0b')[-1] will remove "0b"
    set_collections = {}
    for n in range(1, 2**N):
        key = bin(n).split('0b')[-1].zfill(N)
        value = s_all
        sets_for_intersection = [sets_data[i] for i in range(N) if  key[i] == '1']
        sets_for_difference = [sets_data[i] for i in range(N) if  key[i] == '0']
        for s in sets_for_intersection:
            value = value & s
        for s in sets_for_difference:
            value = value - s
        set_collections[key] = value

    if fill == "number":
        labels = {k: len(set_collections[k]) for k in set_collections}
    elif fill == "logic":
        labels = {k: k for k in set_collections}
    elif fill == "both":
        labels = {k: ("%s: %d" % (k, len(set_collections[k]))) for k in set_collections}
    else:  # invalid value
        raise Exception("invalid value for fill")

    return labels

#--------------------------------------------------------------------
def venn2(data=None, names=None, fill="number", show_names=True, show_plot=False, **kwds):

    if (data is None) or len(data) != 2:
        raise Exception("length of data should be 2!")
    if (names is None) or (len(names) != 2):
        names = ("set 1", "set 2")

    labels = get_labels(data, fill=fill)

    # set figure size
    if 'figsize' in kwds and len(kwds['figsize']) == 2:
        # if 'figsize' is in kwds, and it is a list or tuple with length of 2
        figsize = kwds['figsize']
    else: # default figure size
        figsize = (8, 8)

    fig = pylab.figure(figsize=figsize)
    ax = fig.gca(); ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([]);
    ax.set_xlim(0, 8); ax.set_ylim(0, 8)

    # r: radius of the circles
    # (x1, y1), (x2, y2): center of circles
    r, x1, y1, x2, y2 = 2.0, 3.0, 4.0, 5.0, 4.0

    # set colors for different Circles or ellipses
    if 'colors' in kwds and isinstance(kwds['colors'], Iterable) and len(kwds['colors']) >= 2:
        colors = kwds['colors']
    else:
        colors = ['red', 'green']

    c1 = Circle((x1,y1), radius=r, alpha=0.5, color=colors[0])
    c2 = Circle((x2,y2), radius=r, alpha=0.5, color=colors[1])

    ax.add_patch(c1)
    ax.add_patch(c2)

    ## draw text
    #1
    pylab.text(x1-r/2, y1, labels['10'], **alignment)
    pylab.text(x2+r/2, y2, labels['01'], **alignment)
    # 2
    pylab.text((x1+x2)/2, y1, labels['11'], **alignment)
    # names of different groups
    if show_names:
        pylab.text(x1, y1-1.2*r, names[0], fontsize=16, **alignment)
        pylab.text(x2, y2-1.2*r, names[1], fontsize=16, **alignment)

    leg = ax.legend(names, loc='best', fancybox=True)
    leg.get_frame().set_alpha(0.5)

    if show_plot:
        pylab.show()
    return fig, ax

#--------------------------------------------------------------------

def venn3_fixed(data=None, names=None, fill="number", show_names=True, show_plot=True, **kwds):

    if (data is None) or len(data) != 3:
        raise Exception("length of data should be 3!")
    if (names is None) or (len(names) != 3):
        names = ("set 1", "set 2", "set 3")

    labels = get_labels(data, fill=fill)

    # set figure size
    if 'figsize' in kwds and len(kwds['figsize']) == 2:
        # if 'figsize' is in kwds, and it is a list or tuple with length of 2
        figsize = kwds['figsize']
    else: # default figure size
        figsize = (10, 10)

    fig = pylab.figure(figsize=figsize)   # set figure size
    ax = fig.gca()
    ax.set_aspect("equal")                # set aspect ratio to 1
    ax.set_xticks([]); ax.set_yticks([]);
    ax.set_xlim(0, 8); ax.set_ylim(0, 8)

    # r: radius of the circles
    # (x1, y1), (x2, y2), (x3, y3): center of circles
    r, x1, y1, x2, y2 = 2.0, 3.0, 3.0, 5.0, 3.0
    x3, y3 = (x1+x2)/2.0, y1 + 3**0.5/2*r

    # set colors for different Circles or ellipses
    if 'colors' in kwds and isinstance(kwds['colors'], Iterable) and len(kwds['colors']) >= 3:
        colors = kwds['colors']
    else:
        colors = ['red', 'green', 'blue']

    c1 = Circle((x1,y1), radius=r, alpha=0.5, color=colors[0])
    c2 = Circle((x2,y2), radius=r, alpha=0.5, color=colors[1])
    c3 = Circle((x3,y3), radius=r, alpha=0.5, color=colors[2])
    for c in (c1, c2, c3):
        ax.add_patch(c)

    ## draw text
    # 1
    pylab.text(x1-r/2, y1-r/2, labels['100'], **alignment)
    pylab.text(x2+r/2, y2-r/2, labels['010'], **alignment)
    pylab.text((x1+x2)/2, y3+r/2, labels['001'], **alignment)
    # 2
    pylab.text((x1+x2)/2, y1-r/2, labels['110'], **alignment)
    pylab.text(x1, y1+2*r/3, labels['101'], **alignment)
    pylab.text(x2, y2+2*r/3, labels['011'], **alignment)
    # 3
    pylab.text((x1+x2)/2, y1+r/3, labels['111'], **alignment)
    # names of different groups
    if show_names:
        pylab.text(x1-r, y1-r, names[0], fontsize=16, **alignment)
        pylab.text(x2+r, y2-r, names[1], fontsize=16, **alignment)
        pylab.text(x3, y3+1.2*r, names[2], fontsize=16, **alignment)

    leg = ax.legend(names, loc='best', fancybox=True)
    leg.get_frame().set_alpha(0.5)

    if show_plot:
        pylab.show()
    return fig, ax

#--------------------------------------------------------------------
def venn4_ellipse(data=None, names=None, fill="number", show_names=True, show_plot=False, **kwds):

    if (data is None) or len(data) != 4:
        raise Exception("length of data should be 4!")
    if (names is None) or (len(names) != 4):
        names = ("set 1", "set 2", "set 3", "set 4")

    labels = get_labels(data, fill=fill)

    # set figure size
    if 'figsize' in kwds and len(kwds['figsize']) == 2:
        # if 'figsize' is in kwds, and it is a list or tuple with length of 2
        figsize = kwds['figsize']
    else: # default figure size
        figsize = (10, 10)

    # set colors for different Circles or ellipses
    if 'colors' in kwds and isinstance(kwds['colors'], Iterable) and len(kwds['colors']) >= 4:
        colors = kwds['colors']
    else:
        colors = ['r', 'g', 'b', 'c']

    # draw ellipse, the coordinates are hard coded in the rest of the function
    fig = pylab.figure(figsize=figsize)   # set figure size
    ax = fig.gca()
    patches = []
    width, height = 170, 110  # width and height of the ellipses
    patches.append(Ellipse((170, 170), width, height, -45, color=colors[0], alpha=0.5))
    patches.append(Ellipse((200, 200), width, height, -45, color=colors[1], alpha=0.5))
    patches.append(Ellipse((200, 200), width, height, -135, color=colors[2], alpha=0.5))
    patches.append(Ellipse((230, 170), width, height, -135, color=colors[3], alpha=0.5))
    for e in patches:
        ax.add_patch(e)
    ax.set_xlim(80, 320); ax.set_ylim(80, 320)
    ax.set_xticks([]); ax.set_yticks([]);
    ax.set_aspect("equal")

    ### draw text
    # 1
    pylab.text(120, 200, labels['1000'], **alignment)
    pylab.text(280, 200, labels['0100'], **alignment)
    pylab.text(155, 250, labels['0010'], **alignment)
    pylab.text(245, 250, labels['0001'], **alignment)
    # 2
    pylab.text(200, 115, labels['1100'], **alignment)
    pylab.text(140, 225, labels['1010'], **alignment)
    pylab.text(145, 155, labels['1001'], **alignment)
    pylab.text(255, 155, labels['0110'], **alignment)
    pylab.text(260, 225, labels['0101'], **alignment)
    pylab.text(200, 240, labels['0011'], **alignment)
    # 3
    pylab.text(235, 205, labels['0111'], **alignment)
    pylab.text(165, 205, labels['1011'], **alignment)
    pylab.text(225, 135, labels['1101'], **alignment)
    pylab.text(175, 135, labels['1110'], **alignment)
    # 4
    pylab.text(200, 175, labels['1111'], **alignment)
    # names of different groups
    if show_names:
        pylab.text(110, 110, names[0], fontsize=16, **alignment)
        pylab.text(290, 110, names[1], fontsize=16, **alignment)
        pylab.text(130, 275, names[2], fontsize=16, **alignment)
        pylab.text(270, 275, names[3], fontsize=16, **alignment)

    leg = ax.legend(names, loc='best', fancybox=True)
    leg.get_frame().set_alpha(0.5)

    if show_plot:
        pylab.show()
    return fig, ax

def venn4_square(data=None, names=None, fill="number", show_names=True, show_plot=False, **kwds):
    if (data is None) or len(data) != 4:
        raise Exception("length of data should be 4!")
    if (names is None) or (len(names) != 4):
        names = ("set 1", "set 2", "set 3", "set 4")

    labels = get_labels(data, fill=fill)

    # set figure size
    if 'figsize' in kwds and len(kwds['figsize']) == 2:
        # if 'figsize' is in kwds, and it is a list or tuple with length of 2
        figsize = kwds['figsize']
    else:  # default figure size
        figsize = (10, 10)

    # set colors for different Circles or ellipses
    if 'colors' in kwds and isinstance(kwds['colors'], Iterable) and len(kwds['colors']) >= 4:
        colors = kwds['colors']
    else:
        #colors = ['r', 'g', 'b', 'c']
        colors = [(0.8745098039215686, 0.7607843137254902, 0.49019607843137253),
                  (0.8745098039215686, 0.7607843137254902, 0.49019607843137253),
                  (0.8745098039215686, 0.7607843137254902, 0.49019607843137253),
                  (0.8745098039215686, 0.7607843137254902, 0.49019607843137253)]

    # draw Rectangle, the coordinates are hard coded in the rest of the function
    fig = pylab.figure(figsize=figsize)  # set figure size
    ax = fig.gca()
    patches = []
    width = 90
    height = 2*width  # width and height of the Rectangle
    patches.append(Rectangle((100, 100), width, height, 0, color=colors[0], alpha=0.4, linewidth=0))
    patches.append(Rectangle((100+width/2, 100), width, height, 0, color=colors[1], alpha=0.4, linewidth=0))
    patches.append(Rectangle((100+height, 100+width/2), width, height, 90, color=colors[3], alpha=0.4, linewidth=0))
    patches.append(Rectangle((100 + height, 100), width, height, 90, color=colors[2], alpha=0.4, linewidth=0))

    #points = [[2, 1], [8, 1], [8, 4]]
    #polygon = plt.Polygon(points)
    patches.append(Polygon([[100, 100+height], [100+width/2, 100+height+width/4.], [100+width, 100+height]], color=colors[0], alpha=0.4, linewidth=0))
    patches.append(Polygon([[100+width/2., 100+height], [100+width, 100+height+width/4.], [100+3*width/2., 100+height]], color=colors[1], alpha=0.4, linewidth=0))
    patches.append(Polygon([[100+height, 100+3*width/2], [100+height+width/4., 100+width], [100+height, 100+width/2]], color=colors[2], alpha=0.4, linewidth=0))
    patches.append(Polygon([[100+height, 100+width], [100+height+width/4., 100+width/2], [100+height, 100]], color=colors[3], alpha=0.4, linewidth=0))

    ## Draw Ellipses
    mult = width / (2.1 * np.max(labels.values()))
    def area_to_width(total, max_width):
        return np.sqrt(total/np.pi())
    # 1
    patches.append(
        Ellipse((100 + width / 4, 100 + 7 * width / 4), width=labels['1000'] * mult, height=labels['1000'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 5 * width / 4, 100 + 7 * width / 4), width=labels['0100'] * mult, height=labels['0100'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 7 * width / 4, 100 + 5 * width / 4), width=labels['0010'] * mult, height=labels['0010'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 7 * width / 4, 100 + width / 4), width=labels['0001'] * mult, height=labels['0001'] * mult,
                color='r', alpha=0.5))
    # 2
    patches.append(
        Ellipse((100 + 3 * width / 4, 100 + 7 * width / 4), width=labels['1100'] * mult, height=labels['1100'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + width / 4, 100 + 5 * width / 4), width=labels['1010'] * mult, height=labels['1010'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + width / 4, 100 + width / 4), width=labels['1001'] * mult, height=labels['1001'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 5 * width / 4, 100 + 5 * width / 4), width=labels['0110'] * mult, height=labels['0110'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 5 * width / 4, 100 + width / 4), width=labels['0101'] * mult, height=labels['0101'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 7 * width / 4, 100 + 3 * width / 4), width=labels['0011'] * mult, height=labels['0011'] * mult,
                color='r', alpha=0.5))
    # 3
    patches.append(
        Ellipse((100 + 5 * width / 4, 100 + 3 * width / 4), width=labels['0111'] * mult, height=labels['0111'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + width / 4, 100 + 3 * width / 4), width=labels['1011'] * mult, height=labels['1011'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 3 * width / 4, 100 + width / 4), width=labels['1101'] * mult, height=labels['1101'] * mult,
                color='r', alpha=0.5))
    patches.append(
        Ellipse((100 + 3 * width / 4, 100 + 5 * width / 4), width=labels['1110'] * mult, height=labels['1110'] * mult,
                color='r', alpha=0.5))
    # 4
    patches.append(
        Ellipse((100 + 3 * width / 4, 100 + 3 * width / 4), width=labels['1111'] * mult, height=labels['1111'] * mult,
                color='r', alpha=0.5))
    ### draw text
    if show_names:
        # 1
        pylab.text(100+width/4,   100+7*width/4, labels['1000'], **alignment)
        pylab.text(100+5*width/4, 100+7*width/4, labels['0100'], **alignment)
        pylab.text(100+7*width/4,   100+5*width/4, labels['0010'], **alignment)
        pylab.text(100+7*width/4,   100+width/4, labels['0001'], **alignment)
        # 2
        pylab.text(100+3*width/4, 100+7*width/4, labels['1100'], **alignment)
        pylab.text(100+width/4, 100+5*width/4, labels['1010'], **alignment)
        pylab.text(100+width/4, 100+width/4, labels['1001'], **alignment)
        pylab.text(100+5*width/4, 100+5*width/4, labels['0110'], **alignment)
        pylab.text(100+5*width/4, 100+width/4, labels['0101'], **alignment)
        pylab.text(100+7*width/4, 100+3*width/4, labels['0011'], **alignment)
        # 3
        pylab.text(100+5*width/4, 100+3*width/4, labels['0111'], **alignment)
        pylab.text(100+width/4, 100+3*width/4, labels['1011'], **alignment)
        pylab.text(100+3*width/4, 100+width/4, labels['1101'], **alignment)
        pylab.text(100+3*width/4, 100+5*width/4, labels['1110'], **alignment)
        # 4
        pylab.text(100+3*width/4, 100+3*width/4, labels['1111'], **alignment)

    patches.append(
        Ellipse((100 + height, 100 + height), width=mult*np.max(labels.values()), height=mult*np.max(labels.values()),
                color='r', alpha=0.5))

    for e in patches:
        ax.add_patch(e)
    ax.set_xlim(80, 320)
    ax.set_ylim(80, 320)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_aspect("equal")

    pylab.text(100 + height, 100 + height, "{}".format(np.max(labels.values())), fontsize=16, **alignment)

    # names of different groups
    pylab.text(90, 90 + height, names[0], fontsize=16, rotation=27, ha='left', va='bottom')
    pylab.text(90+width/2., 90+height, names[1], fontsize=16, rotation=27, ha='left', va='bottom')
    pylab.text(100+height, 95+3./2.*width, names[2], fontsize=16, rotation=-63, ha='left', va='top')
    pylab.text(100+height, 95+width, names[3], fontsize=16,rotation=-63, ha='left', va='top')




    # leg = ax.legend(names, loc=1, fancybox=True)
    # leg.get_frame().set_alpha(0.5)
    if show_plot:
        pylab.show()
    return fig, ax