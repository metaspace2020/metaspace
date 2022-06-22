// saved as tsx to be included in the project
// import json
// import pydash
// import requests
// import math
// import pandas as pd
// import numpy as np
// import urllib.parse
//
//
// def load_data(is_matrix_data=False, load_pathway=False, load_class= False,
//     filters = {}):
//     """
//       Load spotting related data and apply filters
//     """
//
//     url_prefix = "https://sm-spotting-project.s3.eu-west-1.amazonaws.com/new/"
//
//     # filter types definitions
//     numeric_filters = ['pV']
//
//     # Load predictions, format neutral loss column
//     if is_matrix_data == 'false':
//         predictions_json = requests.get("{}interlab_predictions_27-04-22.json"
//         .format(url_prefix)).json()
//     else:
//         predictions_json = requests.get("{}matrix_predictions_24-05-22.json"
//         .format(url_prefix)).json()
//     predictions = pd.read_json(json.dumps(predictions_json))
//     predictions.rename(columns = {'nL':'nl'}, inplace = True)
//     predictions.nl.fillna('', inplace=True)
//
//
//     # Get a subset of most relevant information from Datasets file
//     datasets_json = requests.get("{}datasets_31-05-22.json"
//     .format(url_prefix)).json()
//     datasets = pd.read_json(json.dumps(datasets_json))
//     datasets_info = datasets.groupby('Dataset ID').first()
//
//     # Merge with predictions and classification
//     df = pd.merge(predictions, datasets_info, left_on='dsId',
//     right_on='Dataset ID', how='left')
//
//     # merge with pathway
//     if load_pathway:
//         pathways_json = requests.get("{}pathways_14-03-22.json"
//                                .format(url_prefix)).json()
//         pathways = pd.read_json(json.dumps(pathways_json))
//
//         df = df.merge(pathways, left_on='name',
//         right_on='name_short', how='left')
//
//     # merge with class
//     if load_class:
//         chem_class_json = requests.get("{}custom_classification_14-03-22.json"
//                                .format(url_prefix)).json()
//         chem_class = pd.read_json(json.dumps(chem_class_json))
//         df = df.merge(chem_class, left_on='name',
//         right_on='name_short', how='left')
//
//     # apply filters
//     for filter_key in filters.keys():
//         if filter_key == 'p':
//             values = [2] if filters[filter_key][0] == 'True' else [0, 1]
//             df = df[df[filter_key].isin(values)]
//         elif filter_key in numeric_filters:
//             df = df[df[filter_key] <= float(filters[filter_key][0])]
//         else:
//             df = df[df[filter_key].isin(filters[filter_key])]
//
//     return df
//
//
// def summarise_data(df, x_axis, y_axis, intensity_col_name, prediction_col_name):
//     """
//         Summarise spotting data by aggregating it by given x and y axis metrics.
//     """
//     intensity_aggregation_func = lambda x: 0 if True not in (x==2).value_counts().index else (x==2).value_counts().loc[True]
//     ds_aggregation_func = lambda x: ','.join(pd.unique(x))
//     df['class_size'] = 1
//     df['dataset_ids'] = df['dsId']
//     df['formulas'] = df['f']
//     df['matrixes'] = df['Matrix long']
//     df['log'] = df[intensity_col_name]
//     data = df.pivot_table(index=[x_axis],
//                                    columns=y_axis,
//                                    values=[intensity_col_name, prediction_col_name, 'class_size', 'log', 'dataset_ids', 'formulas', 'matrixes'],
//                                    aggfunc = {
//                                         'class_size':sum,
//                                         intensity_col_name : lambda x: sum(x),
//                                         'log': lambda x: np.log10(sum(x)+1),
//                                         prediction_col_name : intensity_aggregation_func,
//                                         'dataset_ids': ds_aggregation_func,
//                                         'formulas' : ds_aggregation_func,
//                                         'matrixes' : ds_aggregation_func
//                                    },
//                                    fill_value=0,
//                                    sort=False)
//
//     data = data.stack(level=1, dropna=False).reset_index()
//
//     for index, row in data.iterrows():
//         detected = df[(df[x_axis] == row[x_axis])
//         & (df[prediction_col_name] == 2) &
//         (df[y_axis] == row[y_axis])]['name'].unique()
//         non_detected = df[(df[x_axis] == row[x_axis]) &
//         (df[prediction_col_name] != 2) &
//         (df[y_axis] == row[y_axis])]['name'].unique()
//         non_detected = list(set(non_detected) - set(detected))
//         total = 1 if (len(detected) +
//         len(non_detected) == 0) else (len(detected) + len(non_detected))
//         data.loc[index, 'detected'] = len(detected)
//         data.loc[index, 'non_detected'] = len(non_detected)
//         data.loc[index,'fraction_detected'] = len(detected) / total
//
//     return data[(data['class_size'] != 0) & (data['p'] != 0) & (data['v'] != 0)]
//
// def lambda_handler(event, context):
//     """Get spotting project compiled information.
//
//     :param isMatrix: Boolean to indicate use of matrix or interlab project
//     :param xAxis: Metric to be plotted as x axis
//     :param yAxis: Metric to be plotted as y axis
//     :param loadPathway: If True indicates that pathway file should be merged
//         to compile the information
//     :param loadClass: If True indicates that class file should be merged
//         to compile the information
//     :param filter: Metrics to be used as filter. It is a string that can be
//         converted to array by spliting ','
//     :param filterValues: Values set to be applied to each filter. Each filter
//         can have multiple values, so it corresponds to filter by separating
//         by ',' and aftewards separates by '#' to get the multiple values of
//         each
//     :param queryType: If 'filterValues', function returns the possible values
//         of the field 'filter'
//
//
//     :return: If querType = filterValues, the possible values of the filter
//         metric
//             If queryType = other, information built based on x axis and
//             y axis metrics to build a chart
//     """
//
//     # set intensity and prediction identifiers
//     intensity_col_name = 'v'
//     prediction_col_name = 'p'
//
//     # load options from query params or lambda test params
//     try:
//         is_matrix_data = event["queryStringParameters"]["isMatrix"]
//     except:
//         is_matrix_data = event["isMatrix"]
//     try:
//         x_axis = event["queryStringParameters"]["xAxis"]
//     except:
//         x_axis = event["xAxis"]
//     try:
//         y_axis = event["queryStringParameters"]["yAxis"]
//     except:
//         y_axis = event["yAxis"]
//     try:
//         load_pathway = event["queryStringParameters"]["loadPathway"]
//     except:
//         load_pathway = event["loadPathway"]
//     try:
//         load_class = event["queryStringParameters"]["loadClass"]
//     except:
//         load_class = event["loadClass"]
//     try:
//         query_type = event["queryStringParameters"]["queryType"]
//     except:
//         query_type = event["queryType"]
//     try:
//         query_filter_src = event["queryStringParameters"]["filter"]
//     except:
//         query_filter_src = event["filter"]
//     try:
//         query_filter_values = event["queryStringParameters"]["filterValues"]
//     except:
//         if "filterValues" in event.keys():
//             query_filter_values = event["filterValues"]
//         else:
//             query_filter_values = ''
//
//
//     # load filters preferences
//     filter_src = []
//     filter_values = []
//     filter_hash = {}
//     if query_filter_src and query_filter_values:
//         filter_src = urllib.parse.unquote(query_filter_src).split(',')
//         filter_values = urllib.parse.unquote(query_filter_values).split('|')
//         for idx, src in enumerate(filter_src):
//             filter_hash[src] = filter_values[idx].split('#')
//
//     # load base data
//     base_data = load_data(is_matrix_data, load_pathway, load_class, filter_hash)
//
//     # get filter values
//     if query_type == 'filterValues':
//         return {
//             'statusCode': 200,
//             'body': {
//                 'src': query_filter_src,
//                 'values': base_data[query_filter_src].unique().tolist(),
//             }
//         }
//
//     # if y_axis is coarse_class, compose aggregation to show fine_class on
//     # sub axis
//     if y_axis == 'coarse_class':
//         base_data['class_full'] = (base_data['coarse_class'] + ' -agg- ' +
//                                 base_data['fine_class'])
//         y_axis = 'class_full'
//
//
//     # Summarise data per molecule (intensities of its detected ions are summed)
//     data = summarise_data(base_data, x_axis, y_axis,
//             intensity_col_name, prediction_col_name)
//
//     return {
//         'statusCode': 200,
//         'body': {
//             'data': data.to_dict(orient='records'),
//             'xAxis': list(data[x_axis].unique()),
//             'yAxis': list(data[y_axis].unique()),
//             'filterSrc': list(filter_src),
//             'filterValues': list(filter_values),
//         }
//     }
