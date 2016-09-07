from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search, Q
import pandas as pd
import numpy as np


def get_response(host, dataset_name):
    client = Elasticsearch(hosts=host)
    s = (Search(using=client, index="sm").query("match", ds_name=dataset_name))
    response = s.scan()
    return response


def get_annotations_at_fdr(hosts, dataset_names, fdr=0.1):
    if not len(hosts) == len(dataset_names):
        raise ValueError('input lists must have same length')
    annotations = []
    for host, dataset_name in zip(hosts, dataset_names):
        response = get_response(host, dataset_name)
        annotations.append([(r.sf, r.adduct) for r in response if all([r.fdr, r.fdr <= fdr])])
    return annotations



def get_remote_results(host, dataset_name):
    response = get_response(host, dataset_name)
    return pd.DataFrame([(r.sf, r.adduct, r.msm, r.chaos, r.image_corr, r.pattern_match) for r in response],
                       columns=['sf', 'adduct', 'msm', 'moc', 'spat', 'spec']).set_index(['sf', 'adduct'])


def plot_diff(dist_df, ref_df, t="", xlabel='', ylabel=''):
    import plotly.graph_objs as go
    from plotly.offline import iplot
    plot_df = dist_df.join(ref_df, rsuffix='_ref', how='inner').dropna()

    text_tmpl = '{}{}<br>X: moc={:.3f} spat={:.3f} spec={:.3f}<br>Y: moc={:.3f} spat={:.3f} spec={:.3f}'

    plot_df_H = plot_df.xs('+H', level='adduct')
    text_H = plot_df_H.reset_index().apply(lambda r: text_tmpl.format(
            r.sf, '+H', r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec), axis=1)

    plot_df_Na = plot_df.xs('+Na', level='adduct')
    text_Na = plot_df_Na.reset_index().apply(lambda r: text_tmpl.format(
        r.sf, '+Na', r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec), axis=1)

    plot_df_K = plot_df.xs('+K', level='adduct')
    text_K = plot_df_K.reset_index().apply(lambda r: text_tmpl.format(
            r.sf, '+K', r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec), axis=1)

    traceH = go.Scatter(
        x = plot_df_H['msm_ref'],
        y = plot_df_H['msm'],
        text = text_H,
        mode = 'markers',
        name = '+H'
    )
    traceNa = go.Scatter(
        x = plot_df_Na['msm_ref'],
        y = plot_df_Na['msm'],
        text = text_Na,
        mode = 'markers',
        name = '+Na'
    )
    traceK = go.Scatter(
        x = plot_df_K['msm_ref'],
        y = plot_df_K['msm'],
        text = text_K,
        mode = 'markers',
        name = '+K'
    )

    data = go.Data([traceH, traceNa, traceK])
    fig = go.Figure(data=data, layout = go.Layout(
        autosize=False,
        height=500,
        hovermode='closest',
        title=t+' MSM values',
        width=500,
        xaxis=go.XAxis(
            autorange=True,
            range=[-0.05675070028979684, 1.0323925590539844],
            title=xlabel,
            type='linear'
        ),
        yaxis=go.YAxis(
            autorange=True,
            range=[-0.0015978995361995152, 1.0312345837176764],
            title=ylabel,
            type='linear'
        )
    ))
    iplot(fig, filename='ref_dist_msm_scatter')
    tmp_df = plot_df.dropna()
    print np.corrcoef(tmp_df['msm'].values, tmp_df['msm_ref'].values)
    return tmp_df