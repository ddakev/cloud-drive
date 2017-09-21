const url = `https://${window.location.host}`;

window.onload = function(e) {
    document.getElementById("login-form").style.position = "relative";
    document.getElementById("login-form").style.visibility = "visible";
    document.getElementById("login-form").style.maxHeight = "500px";
    
    Array.prototype.forEach.call(document.getElementsByClassName("form-submit"), function(sbtn) {
        sbtn.addEventListener("click", function(e) {
            e.preventDefault();
            if(e.target.parentElement.id == "login-form") {
                let username = document.getElementById("login-user-field").value;
                let password = document.getElementById("login-pass-field").value;
                request("POST", url + "/login", {username: username, password: password}, function(err, res) {
                    console.log(err, res);
                    if(!err) {
                        window.location.replace("https://" + window.location.host + "/");
                    }
                });
            }
            else if(e.target.parentElement.id == "register-form") {
                let username = document.getElementById("register-user-field").value;
                let password = document.getElementById("register-pass-field").value;
                if(password != document.getElementById("register-repeat-pass-field").value) {
                    console.log("Passwords don't match.");
                    return false;
                }
                let token = document.getElementById("register-token-field").value;
                if(username.length < 6) {
                    console.log("Username needs to have at least 6 characters.");
                    return false;
                }
                if(username.length > 128) {
                    console.log("Username cannot have more than 128 characters.");
                    return false;
                }
                if(password.length < 6) {
                    console.log("Password needs to have at least 6 characters.");
                    return false;
                }
                if(password.length > 128) {
                    console.log("Password cannot have more than 256 characters.");
                    return false;
                }
                request("POST", url + "/users", {username: username, password: password, token: token}, function(err, res, status) {
                    if(err) {
                        console.log(err, res);
                        return;
                    }
                    window.location.replace("https://" + window.location.host + "/");
                });
            }
            return false;
        });
    });
    
    document.getElementById("register-btn").addEventListener("click", function(e) {
        let loginForm = document.getElementById("login-form");
        let registerForm = document.getElementById("register-form");
        loginForm.style.maxHeight = "0px";
        setTimeout(function() {
            loginForm.style.visibility = "hidden";
            loginForm.style.position = "absolute";
            registerForm.style.position = "relative";
            registerForm.style.visibility = "visible";
            registerForm.style.maxHeight = "500px";
        }, 500);
    });
    
    Array.prototype.forEach.call(document.getElementsByClassName("back-login-btn"), function(btn) {
        btn.addEventListener("click", function(e) {
            let loginForm = document.getElementById("login-form");
            let currentForm = e.target.parentElement;
            currentForm.style.maxHeight = "0px";
            setTimeout(function() {
                currentForm.style.visibility = "hidden";
                currentForm.style.position = "absolute";
                loginForm.style.position = "relative";
                loginForm.style.visibility = "visible";
                loginForm.style.maxHeight = "500px";
            }, 500);
        });
    });
    
    document.getElementById("forgot-pass-btn").addEventListener("click", function(e) {
        let loginForm = document.getElementById("login-form");
        let forgotForm = document.getElementById("forgot-pass-form");
        loginForm.style.maxHeight = "0px";
        setTimeout(function() {
            loginForm.style.visibility = "hidden";
            loginForm.style.position = "absolute";
            forgotForm.style.position = "relative";
            forgotForm.style.visibility = "visible";
            forgotForm.style.maxHeight = "500px";
        }, 500);
    });
};

function request(method = "GET", address, params, callback) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                callback(null, xhr.responseText, xhr.status);
            }
            else if(xhr.status == 403 || xhr.status == 400) {
                callback("Authentication error", xhr.responseText, xhr.status);
            }
            else {
                callback("Error fetching " + address, xhr.status, xhr.status);
            }
        }
    }
    xhr.open(method, address, true);
    xhr.withCredentials = true;
    if(params) {
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));
    }
    else {
        xhr.send(null);
    }
}