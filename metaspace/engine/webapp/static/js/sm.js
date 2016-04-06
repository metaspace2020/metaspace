var max_peaks_to_show = 6;

// Page initialisation
$(document).ready(function() {
    addSignOutAction();

//    init_s3_upload();

    var results_table = initResultsTable();

    fdrThrUpdate(results_table);

    addRowSelectionHandler(results_table);
    addKeyPressHandler(results_table);

    addRatingChangeHandler(results_table);
    addCommentSaveHandler(results_table);

    initColumnFilters(results_table);

    $( "#feedbackForm" ).hide();
//    updateFeedbackFormVisibility();
});