
// Row select action
function addRowSelectionHandler(results_table) {
    $('#results-table tbody').on( 'click', 'tr', function () {
        if ($(this).hasClass('selected') != true) {
            results_table.$('tr.selected').removeClass('selected');
            $(this).addClass('selected');
            on_select_row(results_table.row($(this)).data());
        }
    });
}

// Arrow key press action
function addKeyPressHandler(results_table) {
    document.onkeydown = function (e) {
        var keycode;
        if (window.event)
            keycode = window.event.keyCode;
        else if (e)
            keycode = e.which;

        var direction = (keycode==38) ? -1 : (keycode==40) ? 1 : 0;
        if (direction != 0 && $('#results-table tbody tr').hasClass('selected')) {
            var cur = results_table.$('#results-table tbody tr.selected');
            var next;
            if (direction == 1)
                next = $(cur).next();
            else if (direction == -1)
                next = $(cur).prev();
            else
                next = cur;
            var next_data = results_table.row(next).data();
            if (next_data != null) {
                $(cur).removeClass('selected');
                $(next).addClass('selected');
                on_select_row(next_data);
            }
        }
    }
}

function on_select_row(data) {
    var t_start = performance.now();
    var d = data;
    console.log(d);
    if (d !== undefined) {
        var sf = d[2];
        var subst_names = d[3];
        var subst_ids = d[4];
        var adduct = d[5];
        var job_id = d[11];
        var ds_id = d[12];
        var sf_id = d[13];
        var peaks_n = d[14];
        var db_id = d[15];
        var fdr_pass = d[16];

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
        var add = adduct == "" ? "None" : adduct;
        // total image
        var url = '/min_max_int/' + job_id + '/' + db_id + '/' + sf_id + '/' + add;
        $.getJSON(url, function( data ) {
            var url_params = db_id + '/' + ds_id + '/' + job_id + '/' + sf_id + '/' + sf + '/' + add;
            $("#ionimage_total").html(
                '<img src="/mzimage2/' + url_params + '" id="img-total">'
            );

            $("#ionimage_min_int").text(data['min_int']);
            $("#ionimage_max_int").text(data['max_int']);
        });

        // images per adduct and peak
        var url = '/sf_peak_mzs/' + ds_id + '/' + db_id + '/' + sf_id + '/' + add;
        $.getJSON(url, function( data ) {
            var sf_mzs = data;

            var iso_img_n = Math.min(sf_mzs.length, max_peaks_to_show);
            var col_w = Math.floor(12 / iso_img_n);
            var urls = [];

            $("#imagediv").empty();
            $("#imagediv").append('<div class="row"><div class="col-xs-3"><h3>' + adduct + '</h3></div></div><div class="row" id="row-images"></div><div class="row"><div id="molchart"></div></div>');
            for (var peak_id = 0; peak_id < iso_img_n; peak_id++) {
                to_append = '<div style="text-align:center;" class="col-xs-'
                    + col_w.toString() + '">' + '<div class="container-fluid">'
                    + '<div class="row" id="col-img-' + peak_id.toString() + '"></div>'
                    + '<div class="row">';
                to_append += '</div></div></div>';
                $("#row-images").append(to_append);
                var url = "/mzimage2/" + db_id + '/' + ds_id + '/' + job_id + '/' +
                            sf_id + '/' + sf + '/' + add + '/' + peak_id;
                urls.push(url);
            }

            var loaded_images = 0;
            for (var i = 0; i < iso_img_n; i++) {
                var elem = $("#col-img-" +  i.toString());
                var to_append = '<span>' + sf_mzs[i].toFixed(4) + '</span>';
                to_append += '<img src="' + urls[i] + '" id="img-' + i.toString() + '" ' + 'class="iso-image">';
                elem.append(to_append);
                // callback for logging the elapsed time
                $("#img-" + i.toString()).load(function () {
                    if (++loaded_images == urls.length) {
                        console.log((performance.now() - t_start).toFixed(2).toString() + "ms for images.");
                    }
                });
            }
        });

        // Update feedback form content
        initFeedbackRating(job_id, db_id, sf_id, adduct);
        initFeedbackComment(job_id, db_id, sf_id, adduct);

        // Bottom line chart generation
        drawLineChart(ds_id, job_id, db_id, sf_id, adduct);
    }
}