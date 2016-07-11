function drawLineChart(job_id, db_id, sf_id, adduct) {
    var url = "/spectrum_line_chart_data/" + job_id + "/" + db_id + "/" + sf_id + "/" + adduct;
    $.getJSON(url, function( data ) {
        var min_mz = data["mz_grid"]["min_mz"];
        var max_mz = data["mz_grid"]["max_mz"];
        var ppm = data['ppm'];

        var sampleData = data['sample'];

        var plotData = [
            {
                name: 'Theoretical',
                x: data['theor']['mzs'],
                y: data['theor']['ints'],
                line: {color: 'blue'},
                opacity: 0.3,
                type: 'scatter',
                mode: 'lines'
            },
            {
                name: 'Sample',
                x: sampleData['mzs'],
                y: sampleData['ints'],
                type: 'scatter',
                mode: 'markers',
                line: {color: 'red'}
            }
        ];

        var shapes = [];
        for (var i = 0; i < sampleData['mzs'].length; i++) {
            shapes.push({
                type: 'line',
                x0: sampleData['mzs'][i],
                y0: 0,
                x1: sampleData['mzs'][i],
                y1: sampleData['ints'][i],
                line: {
                    color: 'red',
                    width: 2
                }
            });

            shapes.push({
                type: 'rect',
                xref: 'x',
                yref: 'paper',
                x0: sampleData['mzs'][i] * (1.0 - 1e-6 * ppm),
                y0: 0,
                x1: sampleData['mzs'][i] * (1.0 + 1e-6 * ppm),
                y1: 1,
                line: {width: 0},
                fillcolor: 'grey',
                opacity: 0.1
            });
        }

        var layout = {
            xaxis: {'range': [min_mz, max_mz]},
            yaxis: {title: 'Intensity (a. u.)', rangemode: 'nonnegative'},
            legend: {x: 0.5, y: -0.2, xanchor: 'center', yanchor: 'top',
                     orientation: 'h', traceorder: 'reversed'},
            margin: {t: 20, b: 20},
            font: {size: 16},
            shapes: shapes
        };

        Plotly.newPlot('peaks-line-chart', plotData, layout);

        window.onresize = function() {
            Plotly.Plots.resize($('#peaks-line-chart')[0]);
        };
    });
}
