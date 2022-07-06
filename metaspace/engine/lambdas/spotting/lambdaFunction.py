# %%
import json
import urllib.parse
import pandas as pd
import numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qsl


def calculate_detected_intensities(df, threshold=0.8):
    '''
    Make a column with background corrected intensities for detected compounds, and 0s for not detected compounds
    Change any negative values to zero
    Also add detectability column, where compounds with prediction value above threshold=0.8 are labelled as detected (1)
    '''

    df['detectability'] = df.pV >= threshold
    vals = df.v * df.detectability
    df['effective_intensity'] = np.clip(vals, 0, None)
    return df

# pylint: disable=too-many-locals
def load_data(pred_type='EMBL', load_pathway=False, load_class=False, filters=None):
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
    datasets_info = datasets.groupby('Dataset ID').first()[['Polarity', 'Matrix short', 'Matrix long', 'Slide code', pred_type]]

    # Merge with predictions and classification
    df = pd.merge(
        predictions, datasets_info, left_on='dsId', right_on='Dataset ID', how='left'
    )

    # merge with pathway
    if load_pathway:
        pathways = pd.read_parquet(f'{url_prefix}/{pathways_file}')
        df = df.merge(
            pathways, left_on='name', right_on='name_short', how='left'
        )

    # merge with class
    if load_class:
        chem_class = pd.read_parquet(f'{url_prefix}/{chem_class_file}')
        df = df.merge(
            chem_class, left_on='name', right_on='name_short', how='left'
        )

    # filter types definitions
    numeric_filters = ['pV']

    # apply filters
    if filters:
        for filter_key in filters.keys():
            if filter_key == 'p':
                values = [2] if filters[filter_key][0] == 'True' else [0, 1]
                df = df[df[filter_key].isin(values)]
            elif filter_key in numeric_filters:
                df = df[
                    df[filter_key] <= float(filters[filter_key][0])
                ]
            else:
                df = df[df[filter_key].isin(filters[filter_key])]


    df = df[df[pred_type]]

    # Filter to keep only datasets chosen for plots about matrix comparison
    df = calculate_detected_intensities(df, threshold=0.8)
    spotting_data = df[df.detectability]

    return spotting_data, df.name.nunique()


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
    base_data, n_metabolites = load_data(pred_type, load_pathway, load_class, filter_hash)

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

    # Aggregate data from individual ions per metabolite ('name_short'), per dataset ('dataset_id') and axis values
    step1 = base_data.pivot_table(index=['dsId', 'name', x_axis, y_axis],
                             values=['effective_intensity', 'detectability'],
                             aggfunc=
                             {'effective_intensity': lambda series: np.log10(sum(series) + 1),  # sum,
                              'detectability': max})

    # Aggregate data per dataset and axis values
    # Calculate what fraction metabolites in this dataset were detected with a given X, Y axis value
    # There are 172 metaboites in total
    step2 = step1.groupby(['dsId', x_axis, y_axis]).agg({
        'effective_intensity': 'mean',
        'detectability': lambda x: sum(x) / n_metabolites})

    # Finally, take the average of results of all datasets

    step3 = step2.groupby([x_axis, y_axis]).agg({
        'effective_intensity': 'mean',
        'detectability': 'mean'})

    step3['log10_intensity'] = np.log10(step3['effective_intensity'] + 1)

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


class MyServer(BaseHTTPRequestHandler):
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
    # webServer = HTTPServer(('localhost', 8080), MyServer)
    # print("Yang's local server started at port 8080")
    # try:
    #     webServer.serve_forever()
    # except KeyboardInterrupt:
    #     pass
    #
    # webServer.server_close()
    # print("Server stopped.")
    payload = lambda_handler(
        {
            'predType': 'EMBL',
            'xAxis': 'a',
            'yAxis': 'Matrix short',
            'loadPathway': 'false',
            'loadClass': 'false',
            'queryType': 'data',
            'filter': '',
            'filterValues': '',
        },
        None,
    )
    print(payload)

# %%
