var max_peaks_to_show = 6;

// Page initialisation
$(document).ready(function() {
    addSignOutAction();

    var results_table = initResultsTable();
    addRowSelectionHandler(results_table);
    addRatingChangeHandler(results_table);
    addCommentSaveHandler(results_table);
    initColumnFilters(results_table);

    $( "#feedbackForm" ).hide();
//    updateFeedbackFormVisibility();
});

//    function handleKeyPress(e){
//      var keycode;
//      if (window.event) keycode = window.event.keyCode;
//      else if (e) keycode = e.which;
//      var direction = (keycode==38)?-1:(keycode==40)?1:0;
//      if (direction != 0 && $('#table-demo tbody tr').hasClass('selected')){
//        var results_table_my = $("#table-demo").dataTable();
//        var cur = results_table_my.$('#table-demo tbody tr.selected');
//        var next = results_table_my.fnGetAdjacentTr( cur[0], (direction == 1) );
//        cur.removeClass('selected');
//        select_row(next);
//      }
//    }
//
//    document.onkeydown = handleKeyPress;