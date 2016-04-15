
function addRatingChangeHandler(results_table) {
    $( "form#feedbackForm label.btn" ).click(function() {
        var rowData = results_table.rows('.selected').data()[0];

        var rating;
        if (this.id == 'labelGood') {
            rating = 1;
        }
        else if (this.id == 'labelBad') {
            rating = -1;
        }
        else {
            rating = 0;
        }

        $.ajax({
            url: '/feedback-rating',
            type: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            data: {
                'job_id': rowData[10],
                'db_id': rowData[14],
                'sf_id': rowData[12],
                'adduct': rowData[9],
                'fdr_thr': $("#fdr_thr_btn").text(),
                'rating': rating
            }
        }).done(function() {
            console.log('Sent rating to the backend: ' + rating);
        }).error(function(error) {
            console.log(error);
        });
    });
}

function addCommentSaveHandler(results_table) {
    $("#feedbackForm").submit(function (e) {
        var rowData = results_table.rows('.selected').data()[0];
        var comment = $("textarea[name=comment]").val();

        $.ajax({
            url: '/feedback-comment',
            type: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            data: {
                'job_id': rowData[10],
                'db_id': rowData[14],
                'sf_id': rowData[12],
                'adduct': rowData[9],
                'fdr_thr': $("#fdr_thr_btn").text(),
                'comment': comment
            }
        }).done(function() {
            console.log('Sent feedback to the backend');
        }).error(function(error) {
            console.log(error);
        });

        e.preventDefault();
    });
}

function initFeedbackRating(job_id, db_id, sf_id, adduct) {
    $.ajax({
        url: '/feedback-rating',
        type: 'GET',
        contentType: 'application/x-www-form-urlencoded',
        data: {
            'job_id': job_id,
            'db_id': db_id,
            'sf_id': sf_id,
            'adduct': adduct,
            'fdr_thr': $("#fdr_thr_btn").text()
        }
    }).done(function(data) {
        $('label').removeClass('active');
        switch (data.rating) {
            case 1:
                $('#labelGood').addClass('active');
                break;
            case -1:
                $('#labelBad').addClass('active');
                break;
            case 0:
                $('#labelNotSure').addClass('active');
                break;
        }
        console.log('Initialized rating with saved values');
    }).error(function(error) {
        console.log(error);
    });
}

function initFeedbackComment(job_id, db_id, sf_id, adduct) {
    $.ajax({
        url: '/feedback-comment',
        type: 'GET',
        contentType: 'application/x-www-form-urlencoded',
        data: {
            'job_id': job_id,
            'db_id': db_id,
            'sf_id': sf_id,
            'adduct': adduct,
            'fdr_thr': $("#fdr_thr_btn").text()
        }
    }).done(function(data) {
        $("#feedbackForm textarea[name=comment]").val(data.comment);
        console.log('Initialized comment with saved values');
    }).error(function(error) {
        console.log(error);
    });
}