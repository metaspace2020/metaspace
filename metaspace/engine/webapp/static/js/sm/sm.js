
// Page initialisation
$(document).ready(function() {
    //var array_adducts = ['H', 'Na', 'K'];

    var max_peaks_to_show = 6;
    var mz_array = [];

    var res_datasetids = [];
    var res_datasets = [];
    var res_alldatasets = [];
    var res_stats = [];
    var res_jobids = [];
    var tbl_demo;
    var current_dataset = -1;

    function set_dataset(id) {
      current_dataset = id;
      var j = 0;
      for (; j < res_datasetids.length; j++) {
        if (res_datasetids[j] == id) {
          break;
        }
      }
      $("#img-body").empty();
      if (j < res_datasetids.length) {
        $("#img-header").text("Images and statistics for dataset " + res_datasets[j]);
        $("#img-body").append('<div class="row"><div class="col-lg-8" style="text-align:right;">Average correlation with the monoisotopic (first) image:</div><div class="col-lg-4"><b><span id="span-corriso"></span></b></div></div><div class="row"><div class="col-lg-8" style="text-align:right;">Correlation with peak intensities:</div><div class="col-lg-4"><b><span id="span-corrint"></span></b></div></div><div class="row"><div class="col-lg-8" style="text-align:right;">Mean entropy:</div><div class="col-lg-4"><b><span id="span-meanent"></span></b></div></div><table id="tbl-images" width="100%"></table>');
        $("#span-corriso").text(res_stats[j]["corr_images"].toFixed(4));
        $("#span-corrint").text(res_stats[j]["corr_int"].toFixed(4));
        $("#span-meanent").text(res_stats[j]["mean_ent"].toFixed(4));
        $("#tbl-images").empty();
        $("#tbl-images").append('<tr id="tr-images"></tr>');
        for (var k=0; k < res_stats[j]["entropies"].length; k++) {
          $("#tr-images").append('<td><img width="100%" src="/mzimage/' + res_jobids[j] + 'p' + k + '.png"/></td>');
        }
        $("#tbl-images").append('<tr id="tr-imageent"></tr>');
        for (var k=0; k < res_stats[j]["entropies"].length; k++) {
          $("#tr-imageent").append('<td style="text-align:center;">Entropy: <b>' + res_stats[j]["entropies"][k].toFixed(3) + '</b></td>');
        }
      } else {
        $("#img-header").text("Run m/z extraction for dataset " + res_alldatasets[id]);
        $("#img-body").append('<div class="row"><div class="col-md-8">When you press this button, a Spark job will be initiated at the server side. It will appear in the list (updated every 5 seconds). When it finishes, <b>reload the page</b> to view the m/z image.</div><div class="col-md-4"><div class="pull-right"><button id="btn-runmz" class="btn btn-large btn-primary" type="button">Run m/z extraction for dataset ' + res_alldatasets[id] + '</button></div></div></div>');
        $('#btn-runmz').click(function() {
          $('#btn-runmz').addClass("disabled");
          // alert(mz_array_forspark.toString());
          $.post("/run/extractmzs", {
            "data" : mz_array_forspark.toString(),
            "formula_id" : subst_id,
            "dataset_id" : current_dataset
          });
        });
      }
    }

    tbl_demo = $('#table-demo').DataTable( {
      ajax: "/ajax/demobigtable/",
      scrollY: "200px",
      dom: "rtiS",
      deferRender: true,
      processing: true,
      serverSide: false,
      paging:     false,
      bSortCellsTop: true,
      bSearchable: false,
      bStateSave: true,
      order: [[ 7, "desc" ]],
      fnInitComplete: function(oSettings, json) {
        $('#table-demo tbody tr:eq(0)').click();
      },
      "columnDefs": [
        { "render": function ( data, type, row ) {
          if (type === 'display') {
            return sin_render_sf(data);
          } else {
            return data;
          }
        }, "targets": [2] },
        { "render": function ( data, type, row ) {
          if (type === 'filter' || type === 'sort') {
            return data.join(" ");
          }
          if (data.length == 1) {
            return sin_render_substance_small(row[4][0], data[0]);
          }
          res = '<span style="margin:0 0px;" rel="tooltip" data-html="true" title="'
            + data.join("<br/>").replace(/"/g, '\\"')
            + '">' + data.length.toString() + ' metabolite';
          if (data.length > 1) {
            res += 's';
          }
          return res + '</span>';
        }, "targets": [3] },
        { "render": function ( data, type, row ) {
          if (type === 'filter' || type === 'sort') {
            return data.join(" ");
          }
          if (data.length == 1) {
            return sin_render_substance_small(row[4][0], data[0]);
          }
          res = '<span style="margin:0 0px;" rel="tooltip" data-html="true" title="'
            + data.join("<br/>").replace(/"/g, '\\"')
            + '">' + data.length.toString() + ' id';
          if (data.length > 1) {
            res += 's';
          }
          return res + '</span>';
        }, "targets": [4] },
//        { "render": function ( data, type, row ) {
//          // console.log(data);
//          return d3.max(data);
//        }, "targets": [5, 6, 7] },
        { "render": function ( data, type, row ) {
//          return data.sort().map(function(d) { return array_adducts[d]; }).join(" ");
            return data;
        }, "targets": [8] },
        { "visible": false,  "targets": [ 9, 10, 11, 12, 13] },
      ],
      "initComplete" : function(oSettings, json) {
        $('#table-demo').tooltip({
          selector: "span[rel=tooltip]",
          html: true
        });
      }
    } );

    // Column filter/sorters
    yadcf.init(tbl_demo, [
      {column_number : 0, filter_type: "select", filter_container_id: "fil-db", filter_reset_button_text: false, filter_default_label: 'Select...'},
      {column_number : 1, filter_type: "select", filter_container_id: "fil-ds", filter_reset_button_text: false, filter_default_label: 'Select...'},
      {column_number : 2, filter_type: "text", filter_container_id: "fil-nm", filter_reset_button_text: false },
      {column_number : 3, filter_type: "text", filter_container_id: "fil-sf", filter_reset_button_text: false},
      {column_number : 4, filter_type: "text", filter_container_id: "fil-id", filter_reset_button_text: false},
      {column_number : 5, filter_type: "lower_bound_number", filter_container_id: "fil-sp",
        filter_reset_button_text: false, filter_default_label: ['&ge;']
      },
      {column_number : 6, filter_type: "lower_bound_number", filter_container_id: "fil-ic", filter_reset_button_text: false, filter_default_label: ['&ge;'] },
      {column_number : 7, filter_type: "lower_bound_number", filter_container_id: "fil-sc", filter_reset_button_text: false, filter_default_label: ['&ge;']},
      {column_number : 8, filter_type: "select", filter_container_id: "fil-ad", filter_reset_button_text: false, filter_default_label: 'all'},
      // {column_number : 7, filter_type: "range_number", filter_container_id: "fil-jb", filter_reset_button_text: false},
    ]);

    // Row select action
    $('#table-demo tbody').on( 'click', 'tr', function () {
      if ( $(this).hasClass('selected') ) {
        $(this).removeClass('selected');
      }
      else {
        tbl_demo.$('tr.selected').removeClass('selected');
        select_row(this);
      }
    } );

    $(".fancybox").fancybox();

    // Row select handler
    function select_row(row_object) {
        var t_start = performance.now();
        $(row_object).addClass('selected');
        var d = tbl_demo.row(row_object).data();
        console.log(d);
        var sf = d[2];
        var subst_names = d[3];
        var subst_ids = d[4];
        var adducts = [d[8]];
        var job_id = d[9];
        var dataset_id = d[10];
        var sf_id = d[11];
        var peaks_n = d[12];
        var db_id = d[13];
//        var colors = ['#352A87', '#0268E1', '#108ED2', '#0FAEB9', '#65BE86', '#C0BC60', '#FFC337', '#F9FB0E'];

        var pixel_size = 4;

        $("#imagediv").empty();
        $("#imagediv").html("<h4 style='text-align:center'>...loading images...</h4>");
        $("#ionimage_total").empty();
        $("#ionimage_total").html("<h4 style='text-align:center'>...loading image...</h4>");
        $("#ionimage_total_cb").empty();

        /*
         * start building the page
         */
        // sum formula
        $("#about-name").html(sin_render_sf(sf));
        // molecules
        var asf_html = '';
        for (var i = 0; i < subst_names.length; i++) {
            asf_html += '<div class="col-md-1"><h5>' + subst_ids[i] +
                '</h5></div>';
            asf_html += '<div class="col-md-3" style="word-wrap: '
                + 'break-word;"><h4>' + subst_names[i] + '</h4></div>';
            asf_html += '<div class="col-md-2"><a class="fancybox" '
                + 'rel="group"'
                + ' href="http://moldb.wishartlab.com/molecules/HMDB'
                + subst_ids[i].toString() + '/image.png"><img height="80"'
                + ' src="http://moldb.wishartlab.com/molecules/HMDB'
                + subst_ids[i].toString() + '/thumb.png" alt=""/></a></div>';
            if (i % 2 == 1) {
                asf_html += '</div><div class="row">';
            }
        }
        $("#about-sf").html( '<div class="row">' + asf_html + '</div>' );

        // IMAGES
        // total image
        var url_params = dataset_id + '/'
            + job_id + '/' + sf_id + '/' + sf;
        $("#ionimage_total").html(
            '<img src="/mzimage2/' + url_params + '" id="img-total">'
        );
        // images per adduct and peak
        var iso_img_n = Math.min(peaks_n, 6)
        var col_w = Math.floor(12 / iso_img_n);
        var urls = [];
        for (adduct_idx in adducts) {
            var adduct = adducts[adduct_idx];
//            var col_w = Math.floor(12 / entropies[adduct_idx].length);
            $("#imagediv").empty();
            $("#imagediv").append('<div class="row"><div class="col-lg-3"><h3>' + adduct + '</h3></div></div><div class="row" id="row-images-' + adduct_idx + '"></div><div class="row"><div id="molchart_' + adduct_idx + '"></div></div>');
            for (var peak_id = 0; peak_id < iso_img_n; peak_id++) {
                to_append = '<div style="text-align:center;" class="col-lg-'
                    + col_w.toString() + '">' + '<div class="container-fluid">'
                    + '<div class="row" id="col-img-' + adduct_idx + '-' + peak_id.toString() + '"></div>'
                    + '<div class="row">';
                to_append += '</div></div></div>';
                $('#row-images-' + adduct_idx).append(to_append);
                var url = "/mzimage2/" + db_id + '/' + dataset_id + '/' + job_id + '/' +
                            sf_id + '/' + sf + '/' + adduct + '/' + peak_id;
                urls.push(url);
            }
        }
        var loaded_images = 0;
        for (var i = 0; i < urls.length; i++) {
            var elem = $("#col-img-" + 0 + "-" + i.toString());
            var to_append = '<img src="' + urls[i] + '" width="100%" id="img-' + i.toString() + '">';
            elem.append(to_append);
            // callback for logging the elapsed time
            $("#img-" + i.toString()).load(function () {
                if (++loaded_images == urls.length) {
                    console.log((performance.now() - t_start).toFixed(2).toString() + "ms for images.");
                }
            });
        }

        // Bottom line chart generation
        var url = "/spectrum_line_chart_data/" + job_id + "/" + db_id + "/" + sf_id + "/" + adducts[0];
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
                pathToImages: "/static/js/amcharts/images/",
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

//    function handleKeyPress(e){
//      var keycode;
//      if (window.event) keycode = window.event.keyCode;
//      else if (e) keycode = e.which;
//      var direction = (keycode==38)?-1:(keycode==40)?1:0;
//      if (direction != 0 && $('#table-demo tbody tr').hasClass('selected')){
//        var tbl_demo_my = $("#table-demo").dataTable();
//        var cur = tbl_demo_my.$('#table-demo tbody tr.selected');
//        var next = tbl_demo_my.fnGetAdjacentTr( cur[0], (direction == 1) );
//        cur.removeClass('selected');
//        select_row(next);
//      }
//    }
//
//    document.onkeydown = handleKeyPress;

} );