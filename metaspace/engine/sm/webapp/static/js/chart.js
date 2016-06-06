function centroidPlot(data) {
    var mzs = data['mzs'];
    var ints = data['ints'];
    var mzs2 = [];
    var ints2 = [];
    for (var i = 0; i < mzs.length; i++) {
        mzs2.push(mzs[i] - 1e-6);
        mzs2.push(mzs[i]);
        mzs2.push(mzs[i] + 1e-6);
        ints2.push(-1);
        ints2.push(ints[i]);
        ints2.push(-1);
    }
    return {'mzs': mzs2, 'ints': ints2};
}

function drawLineChart(job_id, db_id, sf_id, adduct) {
    var url = "/spectrum_line_chart_data/" + job_id + "/" + db_id + "/" + sf_id + "/" + adduct;
    $.getJSON(url, function( data ) {
        var min_mz = data["mz_grid"]["min_mz"];
        var max_mz = data["mz_grid"]["max_mz"];

        var layout = {
            xaxis: {'range': [min_mz, max_mz]},
            yaxis: {title: 'Intensity (a. u.)', rangemode: 'nonnegative'},
            legend: {x: 0.5, y: -0.2, xanchor: 'center', yanchor: 'top',
                     orientation: 'h', traceorder: 'reversed'},
            margin: {t: 20, b: 20},
            font: {size: 16}
        };

        var sampleData = centroidPlot(data['sample'])

        var plotData = [
            {
                x: sampleData['mzs'],
                y: sampleData['ints'],
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Sample',
                line: {color: 'red'},
                fill: 'tozeroy',
                fillcolor: 'red'
            },
            {
                name: 'Theoretical',
                x: data['theor']['mzs'],
                y: data['theor']['ints'],
                line: {color: 'blue'},
                opacity: 0.3,
                type: 'scatter',
                mode: 'lines'
            }
        ]

        Plotly.newPlot('peaks-line-chart', plotData, layout)
    });
}
