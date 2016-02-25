
function addFeedbackFormSubmitHandler(results_table) {
    $("#feedbackForm").submit(function (e) {
        var rowData = results_table.rows('.selected').data()[0];

        var rating;
        if ($("input[name=good]:checked").val() == 'on') {
            rating = 1;
        }
        else if ($("input[name=bad]:checked").val() == 'on') {
            rating = -1;
        }
        else {
            rating = 0;
        }
        var comment = $("textarea[name=comment]").val();
        updateFeedbackPanelMsg(comment);

        $.ajax({
            url: '/feedback',
            type: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            data: {
                'job_id': rowData[10],
                'db_id': rowData[14],
                'sf_id': rowData[12],
                'adduct': rowData[9],
                'rating': rating,
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

function updateFeedbackPanelMsg(comment) {
    if (typeof comment !== 'undefined') {
        $('#feedbackPanel').removeClass('panel-danger').addClass('panel-success')
        $('#feedbackPanelMsg').text("Thank you for your assistance! You contributed to society and human well-being");
    }
    else {
        $('#feedbackPanel').removeClass('panel-success').addClass('panel-danger')
        $('#feedbackPanelMsg').text("We need your feedback for this molecule! Urgently! Now or never! Only today buy one get two!");
    }
}

function initFeedbackForm(job_id, db_id, sf_id, adduct) {
    $.ajax({
        url: '/feedback',
        type: 'GET',
        contentType: 'application/x-www-form-urlencoded',
        data: {
            'job_id': job_id,
            'db_id': db_id,
            'sf_id': sf_id,
            'adduct': adduct,
        }
    }).done(function(data) {
        updateFeedbackPanelMsg(data.comment);
        $("#feedbackForm textarea[name=comment]").val(data.comment);
        $('label').removeClass('active');
        switch (data.rating) {
            case 1:
                $('#labelGood').addClass('active');
                break;
            case -1:
                $('#labelBad').addClass('active');
                break;
            default:
                $('#labelNotSure').addClass('active');
        }
        console.log('Initialized feedback form with saved values');
    }).error(function(error) {
        console.log(error);
    });
}