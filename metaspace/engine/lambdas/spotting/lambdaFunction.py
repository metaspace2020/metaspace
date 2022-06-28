# %%
import json
import urllib.parse
import pyarrow
import pandas as pd
import numpy as np


# pylint: disable=too-many-locals
def load_data(pred_type='embl', load_pathway=False, load_class=False, filters=None):
    """Load spotting related data and apply filters"""

    url_prefix = 'https://sm-spotting-project.s3.eu-west-1.amazonaws.com/data'
    all_pred_file = 'all_predictions_24-06-22.parquet'
    interlab_pred_file = 'interlab_predictions_24-06-22.parquet'
    embl_pred_file = 'embl_predictions_24-06-22.parquet'
    datasets_file = 'datasets_24-06-22.parquet'
    pathways_file = 'pathways_24-06-22.parquet'
    chem_class_file = 'custom_classification_24-06-22.parquet'

    # Load predictions, format neutral loss column
    if pred_type == 'EMBL':
        predictions = pd.read_parquet(f'{url_prefix}/{embl_pred_file}')
    elif pred_type == 'INTERLAB':
        predictions = pd.read_parquet(f'{url_prefix}/{interlab_pred_file}')
    else:
        predictions = pd.read_parquet(f'{url_prefix}/{all_pred_file}')

    predictions.nL.fillna('', inplace=True)

    # Get a subset of most relevant information from Datasets file
    datasets = pd.read_parquet(f'{url_prefix}/{datasets_file}')
    datasets_info = datasets.groupby('Dataset ID').first()

    # Merge with predictions and classification
    spotting_data = pd.merge(
        predictions, datasets_info, left_on='dsId', right_on='Dataset ID', how='left'
    )

    # merge with pathway
    if load_pathway:
        pathways = pd.read_parquet(f'{url_prefix}/{pathways_file}')
        spotting_data = spotting_data.merge(
            pathways, left_on='name', right_on='name_short', how='left'
        )

    # merge with class
    if load_class:
        chem_class = pd.read_parquet(f'{url_prefix}/{chem_class_file}')
        spotting_data = spotting_data.merge(
            chem_class, left_on='name', right_on='name_short', how='left'
        )

    # filter types definitions
    numeric_filters = ['pV']

    # apply filters
    if filters:
        for filter_key in filters.keys():
            if filter_key == 'p':
                values = [2] if filters[filter_key][0] == 'True' else [0, 1]
                spotting_data = spotting_data[spotting_data[filter_key].isin(values)]
            elif filter_key in numeric_filters:
                spotting_data = spotting_data[
                    spotting_data[filter_key] <= float(filters[filter_key][0])
                ]
            else:
                spotting_data = spotting_data[spotting_data[filter_key].isin(filters[filter_key])]

    return spotting_data


def summarise_data(spotting_data, x_axis, y_axis, intensity_col_name, prediction_col_name):
    """
    Summarise spotting data by aggregating it by given x and y axis metrics.
    """

    # aggregator to calculate how many items were predicted (predictino_col_name == 2)
    intensity_aggregation_func = (
        lambda x: 0
        if True not in (x == 2).value_counts().index
        else (x == 2).value_counts().loc[True]
    )

    # merge array items with comma, as it will be used to generate metaspace url
    ds_aggregation_func = lambda x: ','.join(pd.unique(x))

    # initialize class size
    spotting_data['class_size'] = 1

    # dsIds, formulas and matrix columns are needed to generate url to metaspace with filter
    # the columns are duplicated and renamed, in case the x_axis or y_axis also having the same name
    # would throw an error
    spotting_data['dataset_ids'] = spotting_data['dsId']
    spotting_data['formulas'] = spotting_data['f']
    spotting_data['matrixes'] = spotting_data['Matrix long']

    # add log columns to support the pre-calculation log10(intensity), as it is an
    # available option at the dashboard
    spotting_data['log'] = spotting_data[intensity_col_name]

    # compile data info based on select x_axis and y_axis
    # i.e if we have x_axis = dsId and y_axis as class and a table
    # dsId  class   intensity_col_name  prediction_col_name
    # ds1   amine   10                   2
    # ds1   amine   20                   0
    # ds2   amine   39                   2
    # we expect to be summarized as
    # dsId  class   intensity_col_name  log         prediction_col_name class_size dataset_ids formulas matrixes
    # ds1   amine   30                  log10(31)   1                   2          ds1         formulas matrixes
    # ds2   amine   39                  log10(39)   1                   1          ds2         formulas matrixes
    data = spotting_data.pivot_table(
        index=[x_axis],
        columns=y_axis,
        values=[
            intensity_col_name,
            prediction_col_name,
            'class_size',
            'log',
            'dataset_ids',
            'formulas',
            'matrixes',
        ],
        aggfunc={
            'class_size': sum,
            intensity_col_name: lambda x: sum(x),
            'log': lambda x: np.log10(sum(x) + 1),
            prediction_col_name: intensity_aggregation_func,
            'dataset_ids': ds_aggregation_func,
            'formulas': ds_aggregation_func,
            'matrixes': ds_aggregation_func,
        },
        fill_value=0,
    )

    data = data.stack(level=1, dropna=False).reset_index()

    for index, row in data.iterrows():
        aux_axis_df = spotting_data[
            (spotting_data[x_axis] == row[x_axis]) & (spotting_data[y_axis] == row[y_axis])
        ]
        detected = aux_axis_df[aux_axis_df[prediction_col_name] == 2]['name'].unique()
        non_detected = aux_axis_df[aux_axis_df[prediction_col_name] != 2]['name'].unique()
        non_detected = list(set(non_detected) - set(detected))
        total = (
            1 if (len(detected) + len(non_detected) == 0) else (len(detected) + len(non_detected))
        )
        data.loc[index, 'detected'] = len(detected)
        data.loc[index, 'non_detected'] = len(non_detected)
        data.loc[index, 'fraction_detected'] = len(detected) / total

    return data[(data['class_size'] != 0) & (data['p'] != 0) & (data['v'] != 0)]


def parse_event(event):
    """Parsing GET request parameters

    :param str xAxis: Metric to be plotted as X axis
    :param str yAxis: Metric to be plotted as Y axis
    :param str loadPathway:
        If True indicates that pathway file should be merged to compile the information
    :param str loadClass:
        If True indicates that class file should be merged to compile the information
    :param bool predType:
        Indicate use of embl, interlab or all project (file) [EMBL, ITERLAB, ALL]
    :param str filter:
        Metrics to be used as filter. It is a string that can be
        converted to array by splitting ','
    :param str filterValues:
        Values set to be applied to each filter.
        Each filter can have multiple values, so it corresponds to filter by separating
        by ',' and afterwards separates by '#' to get the multiple values of each
    :param queryType:
        If 'filterValues', function returns the possible values of the field 'filter'

    :return:
        If queryType=`filterValues`, the possible values of the filter metric
        If queryType is other, information built based on X,Y axis metrics to build a chart
    """

    # for lambda function
    if event.get('queryStringParameters'):
        parameter = event['queryStringParameters']
    # for testing
    else:
        parameter = event

    print(parameter)

    x_axis = parameter['xAxis']
    y_axis = parameter['yAxis']
    load_pathway = json.loads(parameter['loadPathway'].lower())
    load_class = json.loads(parameter['loadClass'].lower())
    pred_type = parameter['predType']
    query_type = parameter['queryType']
    query_filter_src = parameter['filter']
    if parameter.get('filterValues'):
        query_filter_values = parameter['filterValues']
    else:
        query_filter_values = ''

    return (
        x_axis,
        y_axis,
        query_filter_src,
        query_filter_values,
        load_pathway,
        load_class,
        query_type,
        pred_type,
    )


def filter_processing(query_filter_src, query_filter_values):
    """Build filter options to be applied"""

    print(f'query filter source: {query_filter_src}')
    print(f'query filter values: {query_filter_values}')

    # builds the filter according to the positions passed in filter_values
    # and filter_src. As the filter logic is shared with the frontend, so that will
    # load according to the url. The filter follows this standard:
    # filter_src=src1,src2,src3
    # filter_values=value1_src1#value2_src1,value1_src2,value1_src3
    # * note that the filter positions are split by ',', and that each position
    # can be split by '#', as the filter can have multiple values
    filter_src, filter_values, filter_hash = [], [], {}
    if query_filter_src and query_filter_values:
        filter_src = urllib.parse.unquote(query_filter_src).split(',')
        filter_values = urllib.parse.unquote(query_filter_values).split('|')
        for idx, src in enumerate(filter_src):
            if idx < len(filter_values):
                filter_hash[src] = filter_values[idx].split('#')

    return filter_src, filter_values, filter_hash


def lambda_handler(event, context):
    """Get spotting project compiled information."""

    # load options from query params or lambda test params
    (
        x_axis,
        y_axis,
        query_filter_src,
        query_filter_values,
        load_pathway,
        load_class,
        query_type,
        pred_type,
    ) = parse_event(event)

    # load filters preferences
    filter_src, filter_values, filter_hash = filter_processing(
        query_filter_src, query_filter_values
    )

    # load base data
    base_data = load_data(pred_type, load_pathway, load_class, filter_hash)

    # get filter values
    if query_type == 'filterValues':
        return {
            'statusCode': 200,
            'body': {
                'src': query_filter_src,
                'values': base_data[query_filter_src].unique().tolist(),
            },
        }

    # if y_axis is fine_class, compose aggregation to show coarse_class groups on
    # sub axis
    if y_axis == 'fine_class':
        base_data['class_full'] = base_data['coarse_class'] + ' -agg- ' + base_data['fine_class']
        y_axis = 'class_full'

    # set intensity and prediction identifiers
    intensity_col_name = 'v'
    prediction_col_name = 'p'

    # Summarise data per molecule (intensities of its detected ions are summed)
    data = summarise_data(base_data, x_axis, y_axis, intensity_col_name, prediction_col_name)

    return {
        'statusCode': 200,
        'body': {
            'data': data.to_dict(orient='records'),
            'xAxis': list(data[x_axis].unique()),
            'yAxis': list(data[y_axis].unique()),
            'filterSrc': list(filter_src),
            'filterValues': list(filter_values),
        },
    }


if __name__ == "__main__":
    payload = lambda_handler(
        {
            'predType': 'EMBL',
            'xAxis': 'a',
            'yAxis': 'coarse_class',
            'loadPathway': 'false',
            'loadClass': 'true',
            'queryType': 'data',
            'filter': 'a,dsId',
            'filterValues': '+Cl',
        },
        None,
    )
    print(payload)
# %%
