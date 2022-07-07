# %%
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qsl
import pandas as pd
import numpy as np


def calculate_detected_intensities(df, threshold=0.8):
    '''
    Make a column with background corrected intensities for detected compounds, and 0s
     for not detected compounds
    Change any negative values to zero
    Also add detectability column, where compounds with prediction value above
     threshold=0.8 are labelled as detected (1)
    '''

    df['detectability'] = df.pV >= threshold
    vals = df.v * df.detectability
    df['effective_intensity'] = np.clip(vals, 0, None)
    return df


# pylint: disable=too-many-locals
def load_data(
    pred_type='EMBL', load_pathway=False, load_class=False, filters=None, x_axis=None, y_axis=None
):
    """Load spotting related data and apply filters"""

    url_prefix = 'https://sm-spotting-project.s3.eu-west-1.amazonaws.com/data_v2'
    all_pred_file = 'all_predictions_05-07-22.parquet'
    interlab_pred_file = 'interlab_predictions_05-07-22.parquet'
    embl_pred_file = 'embl_predictions_05-07-22.parquet'
    datasets_file = 'datasets_05-07-22.parquet'
    pathways_file = 'pathways_05-07-22.parquet'
    chem_class_file = 'custom_classification_05-07-22.parquet'

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
    datasets.rename(columns={'All': 'ALL', 'Interlab': 'INTERLAB'}, inplace=True)
    datasets_info = datasets.groupby('Dataset ID').first()[
        ['Polarity', 'Matrix short', 'Matrix long', 'Slide code', pred_type]
    ]

    # Merge with predictions and classification
    df = pd.merge(predictions, datasets_info, left_on='dsId', right_on='Dataset ID', how='left')

    # merge with pathway
    if load_pathway:
        pathways = pd.read_parquet(f'{url_prefix}/{pathways_file}')
        df = df.merge(pathways, left_on='name', right_on='name_short', how='left')

    df = df[df[pred_type]]

    # dsIds, formulas and matrix columns are needed to generate url to metaspace with filter
    # the columns are duplicated and renamed, in case the x_axis or y_axis also having the same name
    # would throw an error
    df['dataset_ids'] = df['dsId']
    df['formulas'] = df['f']
    df['matrixes'] = df['Matrix long']

    # Filter to keep only datasets chosen for plots about matrix comparison
    df = calculate_detected_intensities(df, threshold=0.8)
    spotting_data = df[df.detectability]

    # merge with class
    if load_class:
        classes1 = pd.read_parquet(f'{url_prefix}/{chem_class_file}')

        if y_axis != 'main_coarse_class' and x_axis != 'main_coarse_class':
            chem_subclass = classes1[
                ['name_short', 'coarse_class', 'fine_class']
            ].drop_duplicates()  # coarse class here is to do sorting if you want
            chem = chem_subclass[chem_subclass.coarse_class != 'Thermometers']
            sizes = chem_subclass.fine_class.value_counts()
            chem['class_size'] = [sizes[k] for k in chem.fine_class]
        else:
            chem_class = classes1[['name_short', 'main_coarse_class']].drop_duplicates()
            chem = chem_class[chem_class.main_coarse_class != 'Thermometers']
            sizes = chem_class.main_coarse_class.value_counts()
            chem['class_size'] = [sizes[k] for k in chem.main_coarse_class]

        spotting_data = spotting_data.merge(
            chem, left_on='name', right_on='name_short', how='right'
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

    return spotting_data, spotting_data.name.nunique()


def summarise_data_w_class(spotting_data, x_axis, y_axis):
    """
    Summarise spotting data with class.
    """

    # merge array items with comma, as it will be used to generate metaspace url
    join_aggregation_func = lambda x: ','.join(pd.unique(x))

    step1_indexes = ['dsId', 'name', x_axis, y_axis]
    step2_indexes = ['dsId', x_axis, y_axis]
    if x_axis == 'dsId' or y_axis == 'dsId':
        step1_indexes.pop(0)
        step2_indexes.pop(0)

    # First step is to  aggregate per metabolite, dataset and axes values
    step1 = spotting_data.pivot_table(
        index=step1_indexes,
        values=[
            'effective_intensity',
            'detectability',
            'class_size',
            'dataset_ids',
            'formulas',
            'matrixes',
        ],
        aggfunc={
            'effective_intensity': 'sum',
            'detectability': 'max',
            'class_size': 'first',
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
        },
        fill_value=0,
    )

    # Next, aggregare per dataset and axes values

    step2 = step1.pivot_table(
        index=step2_indexes,
        values=[
            'effective_intensity',
            'detectability',
            'class_size',
            'dataset_ids',
            'formulas',
            'matrixes',
        ],
        aggfunc={
            'class_size': 'first',
            'effective_intensity': 'mean',  # only when considering only 'detected' data
            'detectability': 'sum',
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
        },
        fill_value=0,
    )

    step2['fraction_detected'] = step2.detectability / step2.class_size

    # Finally, take the average of results of all datasets

    step3 = step2.groupby([x_axis, y_axis]).agg(
        {
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
            'effective_intensity': 'mean',
            'fraction_detected': 'mean',
        }
    )

    step3['log10_intensity'] = step3['effective_intensity'].apply(lambda x: np.log10(x + 1))

    return step3.reset_index(level=[x_axis, y_axis])


def summarise_data(spotting_data, n_metabolites, x_axis, y_axis):
    """
    Summarise spotting data without class.
    """

    # merge array items with comma, as it will be used to generate metaspace url
    join_aggregation_func = lambda x: ','.join(pd.unique(x))

    step1_indexes = ['dsId', 'name', x_axis, y_axis]
    step2_indexes = ['dsId', x_axis, y_axis]
    if x_axis == 'dsId' or y_axis == 'dsId':
        step1_indexes.pop(0)
        step2_indexes.pop(0)

    # Aggregate data from individual ions per metabolite ('name_short'),
    # per dataset ('dataset_id') and axis values
    step1 = spotting_data.pivot_table(
        index=step1_indexes,
        values=['effective_intensity', 'detectability', 'dataset_ids', 'formulas', 'matrixes'],
        aggfunc={
            'effective_intensity': sum,
            'detectability': max,
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
        },
    )

    # Aggregate data per dataset and axis values
    # Calculate what fraction metabolites in this dataset were detected with a given X, Y axis value
    # There are 172 metaboites in total
    step2 = step1.groupby(step2_indexes).agg(
        {
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
            'effective_intensity': 'mean',
            'detectability': lambda x: sum(x) / n_metabolites,
        }
    )

    # Finally, take the average of results of all datasets

    step3 = step2.groupby([x_axis, y_axis]).agg(
        {
            'dataset_ids': join_aggregation_func,
            'formulas': join_aggregation_func,
            'matrixes': join_aggregation_func,
            'effective_intensity': 'mean',
            'detectability': 'mean',
        }
    )

    step3.rename(columns={'detectability': 'fraction_detected'}, inplace=True)
    step3['log10_intensity'] = np.log10(step3['effective_intensity'] + 1)

    return step3.reset_index(level=[x_axis, y_axis])


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
    base_data, n_metabolites = load_data(
        pred_type, load_pathway, load_class, filter_hash, x_axis, y_axis
    )

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

    # Summarise data per molecule (intensities of its detected ions are summed)
    if not load_pathway and not load_class:
        data = summarise_data(base_data, n_metabolites, x_axis, y_axis)
    else:
        data = summarise_data_w_class(base_data, x_axis, y_axis)

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


class MyServer(BaseHTTPRequestHandler):
    # pylint: disable=invalid-name
    def do_GET(self):

        print('url')
        url = self.path
        parsed_url = urlparse(url)
        query = parse_qsl(parsed_url.query)
        print(query)
        print(dict(query))

        payload = lambda_handler(
            dict(query),
            None,
        )

        json_to_pass = json.dumps(payload)
        self.send_response(code=200, message='here is your token')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header(keyword='Content-type', value='application/json')
        self.end_headers()
        self.wfile.write(json_to_pass.encode('utf-8'))


if __name__ == "__main__":
    webServer = HTTPServer(('localhost', 8080), MyServer)
    print("Yang's local server started at port 8080")
    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
    # payload = lambda_handler(
    #     {
    #         'predType': 'EMBL',
    #         'xAxis': 'Matrix short',
    #         'yAxis': 'dsId',
    #         'loadPathway': 'false',
    #         'loadClass': 'false',
    #         'queryType': 'data',
    #         'filter': '',
    #         'filterValues': '',
    #     },
    #     None,
    # )
    # print(payload)

# %%
