
function drawLineChart(job_id, db_id, sf_id, adduct) {
    var url = "/spectrum_line_chart_data/" + job_id + "/" + db_id + "/" + sf_id + "/" + adduct;
    $.getJSON(url, function( data ) {
        var min_mz = data["mz_grid"]["min_mz"];
        var max_mz = data["mz_grid"]["max_mz"];
        var points_n = data["mz_grid"]["points_n"];

        // create a grid
        var grid = [];
        var step = (max_mz - min_mz) / (points_n-1);
        for (var i = 0; i < points_n; i++) {
            grid.push((min_mz + i*step).toFixed(3));
        }

        // create intensity series for profiles
        var prof_int_series = [];
        for (var i = 0; i < points_n; i++) {
            prof_int_series[i] = 0;
        }
        for (var i = 0; i < data["theor"]["inds"].length; i++) {
            var grid_ind = data["theor"]["inds"][i];
            prof_int_series[grid_ind] = data["theor"]["ints"][i]
        }

        // create intensity series for centroids
        var centr_int_series = [];
        for (var i = 0; i < points_n; i++) {
            centr_int_series[i] = 0;
        }
        for (var i = 0; i < data["sample"]["inds"].length; i++) {
            var grid_ind = data["sample"]["inds"][i];
            centr_int_series[grid_ind] = data["sample"]["ints"][i]
        }

        // prepare chart data structure
        var chartData = [];
        for (var i = 0; i < points_n; i++) {
            chartData.push({"peak_mz": grid[i],
                            "prof_peak_int": prof_int_series[i],
                            "centr_peak_int": centr_int_series[i]});
        }

        // create guides from centroids
        var guides = data["sample"]["inds"].map(function(grid_ind, ind, arr) {
            return {"category" : grid[grid_ind],
                    "boldLabel" : "True",
                    "color" : "black",
                    "dashLength" : 5,
                    "lineAlpha" : 1,
                    "label" : grid[grid_ind]}
        });

        AmCharts.makeChart("peaks-line-chart", {
            type: "serial",
            pathToImages: "http://sm-engine-webapp.s3-website-eu-west-1.amazonaws.com/js/amcharts/images/",
            dataProvider: chartData,
            categoryField: "peak_mz",

            categoryAxis: {
                dashLength: 1,
                labelsEnabled: false,
                fontSize: 14,
                guides: guides,
            },

            valueAxes: [{
                id: "val_axis",
                title: "Intensity (a.u.)",
                fontSize: 14,
                maximum: 120,
                axisThickness: 1.5,
                dashLength: 5,
                gridCount: 10,
                dashLength: 1,
            }],

            graphs: [{
                id: "theor_int",
                valueField: "prof_peak_int",
                title: "Theoretical",
                lineColor: "blue",
                type: "smoothedLine",

            },{
                id: "sample_int",
                valueField: "centr_peak_int",
                title: "Sample",
                lineColor: "red",
                type: "column",
                fixedColumnWidth: 5,
                fillAlphas: 1,
            }],

            chartScrollbar : {
                //updateOnReleaseOnly: true,
            },

            chartCursor: {
                cursorPosition: "mouse",
            },

            legend: {
              fontSize: 14,
              markerSize: 15,
              useGraphSettings: true,
              position: "bottom",
              align: "center",
            },
        });
    });
}