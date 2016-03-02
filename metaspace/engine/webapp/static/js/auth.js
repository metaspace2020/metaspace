function backendSignIn(id_token) {
    $.ajax({
        url: '/auth',
        type: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        data: {'id_token': id_token, 'action': 'sign_in'}
    }).done(function() {
        console.log('Sent a sign in request to the backend');
    }).error(function(error) {
        console.log(error);
    });
}

function renderSignInButton() {
    gapi.signin2.render('google-sign-in', {
        'scope': 'profile email',
        'width': 210,
        'height': 45,
        'longtitle': true,
        'theme': 'dark',
        'onsuccess': function(googleUser) {
            console.log('Signed in as: ' + googleUser.getBasicProfile().getName());
            backendSignIn(googleUser.getAuthResponse().id_token);
            $('#google-sign-out').css('visibility', 'visible');
            $('#feedbackForm').show();
        },
        'onfailure': function (error) {
            console.log(error);
        }
    });
}

function backendSignOut() {
    $.ajax({
        url: '/auth',
        type: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        data: {'action': 'sign_out'}
    }).done(function() {
        console.log('Sent a sign out request to the backend');
    }).error(function(error) {
        console.log(error);
    });
}

function addSignOutAction() {
    $('#google-sign-out').click(function() {
        var auth2 = gapi.auth2.getAuthInstance();
        auth2.disconnect().then(function () {
            console.log('Signed out');
        });
        backendSignOut();
        $('#google-sign-out').css('visibility', 'hidden');
        $('#feedbackForm').hide();
    });
}

/*function updateFeedbackFormVisibility() {
    if (typeof $.cookie('client_id') === 'undefined') {
        $('#feedback-accordion').css('visibility', 'hidden');
    }
    else {
        $('#feedback-accordion').css('visibility', 'visible');
    }
}*/