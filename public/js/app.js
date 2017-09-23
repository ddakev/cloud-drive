const url = `https://${window.location.host}/api`;
var user = {username: "", superuser: false};

var keysPressed = {
    "ctrl": false,
    "shift": false,
    "alt": false
}

var clipboard = {
    action: null,
    path: null,
    files: []
}

var marked = [];
var pathHistory = [];
var hisIndex = -1;
var navigate = false;
var markedOnShift = null;
var dragTimeout = null;
var globalPath = null;
var sideDir = null;
var dirFiles = null;
var terminalStart = 4;

var detailTypes = {
    "size": "Size",
    "atime": "Last opened",
    "mtime": "Modified",
    "ctime": "Created"
}

window.onload = init;

function init() {
    request("GET", url.substring(0, url.length-4) + "/username", null, function(err, res) {
        user = JSON.parse(res);
        document.getElementById("profile").getElementsByTagName("span")[0].textContent = user.username;
        let topNode = document.getElementById("fs").getElementsByTagName("li")[0];
        let topNodeSpan = topNode.getElementsByTagName("span")[topNode.getElementsByTagName("span").length-1];
        topNodeSpan.textContent = user.username + "'s Drive";
        if(user.superuser) {
            let subheader = document.getElementById("subheader");
            let inviteBtn = document.createElement("button");
            inviteBtn.id = "invite-btn";
            inviteBtn.textContent = "INVITE";
            inviteBtn.addEventListener("click", getInviteCode);
            subheader.appendChild(inviteBtn);
        }
    });
    
    let root = document.createElement("ul");
    let rootli = document.createElement("li");
    let exp = document.createElement("span");
    exp.className = "expand";
    let arr = document.createElement("i");
    arr.className = "rarrow";
    let label = document.createElement("span");
    label.textContent = "Name's Drive";
    exp.appendChild(arr);
    rootli.appendChild(exp);
    rootli.appendChild(label);
    root.appendChild(rootli);
    document.getElementById("fs").appendChild(root);
    rootli.addEventListener("click", function() {
        let originalTarget = event.target;
        let target_el = event.target;
        if(target_el.tagName == "SPAN") {
            target_el = target_el.parentElement;
        }
        else if(target_el.tagName == "I") {
            target_el = target_el.parentElement.parentElement;
        }
        let el = target_el;
        let selectedPath = "/";
        if(originalTarget.className == "expand" || originalTarget.className == "rarrow") {
            if(target_el.nextElementSibling && target_el.nextElementSibling.tagName == "UL") {
                openPath(selectedPath, false);
            }
            else {
                openPath(selectedPath, true);
            }
        }
        else {
            openPath(selectedPath);
        }
    });
    
    // Populate sidebar and content area
    openPath("/");
    
    request("POST", url + "/size", {path: "../"}, function(err, res) {
        let usedspace = document.getElementById("used-storage");
        let size = JSON.parse(res).size;
        let storageTag = document.getElementById("storage-tag");
        usedspace.style.width = (size / (1024 * 1024 * 1024 * 1024)) + "%";
        storageTag.textContent = "Used " + sizeString(size) + " out of 1 TB";
    });
    
    window.addEventListener("keydown", function(e) {
        if(e.keyCode == 17) {
            keysPressed.ctrl = true;
        }
        else if(e.keyCode == 16) {
            keysPressed.shift = true;
        }
        else if(e.keyCode == 18) {
            keysPressed.alt = true;
        }
        else if(e.keyCode == 65 && keysPressed.ctrl) {
            let filearea = document.getElementById("content");
            let fitems = filearea.getElementsByClassName("file-item");
            for(let i=0; i<fitems.length; i++) {
                if(fitems[i].className.indexOf(" marked") < 0) {
                    fitems[i].className += " marked";
                    marked.push(fitems[i]);
                }
            }
        }
        else if(e.keyCode == 88 && keysPressed.ctrl) {
            cut(marked);
        }
        else if(e.keyCode == 67 && keysPressed.ctrl) {
            copy(marked);
        }
        else if(e.keyCode == 86 && keysPressed.ctrl) {
            paste();
        }
    });
    window.addEventListener("keyup", function(e) {
        if(e.keyCode == 17) {
            keysPressed.ctrl = false;
        }
        else if(e.keyCode == 16) {
            keysPressed.shift = false;
        }
        else if(e.keyCode == 18) {
            keysPressed.alt = false;
        }
    });
    window.addEventListener("click", function(e) {
        let contextMenu = document.getElementById("context-menu");
        if(contextMenu) {
            document.body.removeChild(contextMenu);
        }
    });
    window.addEventListener("mouseup", function(e) {
        let viewToggle = document.getElementById("view-toggle");
        let target = e.target;
        while(target && target.id != "view-controls") {
            target = target.parentElement;
            if(!target) {
                if(viewToggle.checked) {
                    viewToggle.checked = false;
                }
                return;
            }
        }
    });
    
    document.getElementById("content").addEventListener("contextmenu", function(e) {
        e.preventDefault();
        let oldmenu = document.getElementById("context-menu");
        if(oldmenu) {
            document.body.removeChild(oldmenu);
        }
        let menu = document.createElement("div");
        menu.id = "context-menu";
        menu.className = "menu";
        menu.style.top = (e.clientY+5) + "px";
        menu.style.left = (e.clientX+5) + "px";
        document.body.appendChild(menu);
        let target = e.target;
        while(target.id != "content" && target.className.indexOf("file-item") < 0) {
            target = target.parentElement;
        }
        if(target.className.indexOf("file-item") > -1) {
            if(target.className.indexOf(" marked") < 0) {
                markFile();
            }
            let options = [
                {label: "Rename", icon: "rename", action: function() {rename(target);}},
                "line",
                {label: "Cut", icon: "cut", action: function() {cut(marked);}},
                {label: "Copy", icon: "copy", action: function() {copy(marked);}},
                {label: "Paste", icon: "paste", action: function() {paste();}},
                "line",
                {label: "Download", icon: "download", action: function() {download(marked);}},
                "line",
                {label: "Delete", icon: "trash", action: function() {remove(marked);}}
            ];
            generateMenu(menu, options);
        }
        else if(target.id == "content") {
            let options = [
                {label: "New Folder", icon: "new-folder", action: function() {newFolder();}},
                "line",
                {label: "Paste", icon: "paste", action: function() {paste();}}
            ];
            generateMenu(menu, options);
        }
    });
    
    document.getElementById("content").addEventListener("mousedown", function(e) {
        let contextMenu = document.getElementById("context-menu");
        if(contextMenu) {
            document.body.removeChild(contextMenu);
        }
        
        let target = e.target;
        while(target.id != "content") {
            if(target.className.indexOf("file-item") > -1) {
                return;
            }
            target = target.parentElement;
        }
        if(!keysPressed.ctrl) {
            for(let i=0; i<marked.length; i++) {
                marked[i].className = marked[i].className.replace(" marked", "");
            }
            marked = [];
        }
        let filearea = document.getElementById("content");
        let sx = e.clientX - filearea.offsetLeft;
        let sy = e.clientY - filearea.offsetTop + filearea.scrollTop;
        let selectarea = document.createElement("div");
        let selected = [];
        selectarea.id = "select-area";
        selectarea.style.top = sy + "px";
        selectarea.style.left = sx + "px";
        filearea.appendChild(selectarea);
        filearea.onmousemove = function(e) {
            let fx = e.clientX - filearea.offsetLeft;
            let fy = e.clientY - filearea.offsetTop + filearea.scrollTop;
            selectarea.style.left = Math.min(sx, fx) + "px";
            selectarea.style.width = Math.max(sx, fx) - Math.min(sx, fx) + "px";
            selectarea.style.top = Math.min(sy, fy) + "px";
            selectarea.style.height = Math.max(sy, fy) - Math.min(sy, fy) + "px";
            let files = filearea.getElementsByClassName("file-item");
            for(let i=0; i<files.length; i++) {
                let fx1 = files[i].offsetLeft;
                let fy1 = files[i].offsetTop;
                let fx2 = fx1 + parseFloat(getComputedStyle(files[i]).width);
                let fy2 = fy1 + parseFloat(getComputedStyle(files[i]).height);
                let sx1 = Math.min(sx, fx);
                let sy1 = Math.min(sy, fy);
                let sx2 = Math.max(sx, fx);
                let sy2 = Math.max(sy, fy);
                let minx = Math.min(fx2, sx2);
                let maxx = Math.max(fx1, sx1);
                let miny = Math.min(fy2, sy2);
                let maxy = Math.max(fy1, sy1);
                if(maxx < minx && maxy < miny) {
                    if(selected.indexOf(files[i]) < 0) {
                        selected.push(files[i]);
                        if(files[i].className.indexOf(" marked") > -1) {
                            files[i].className = files[i].className.replace(" marked", "");
                            marked.splice(marked.indexOf(files[i]), 1);
                        }
                        else {
                            files[i].className += " marked";
                            marked.push(files[i]);
                        }
                    }
                }
                else {
                    if(selected.indexOf(files[i]) > -1) {
                        selected.splice(selected.indexOf(files[i]), 1);
                        if(files[i].className.indexOf(" marked") > -1) {
                            files[i].className = files[i].className.replace(" marked", "");
                            marked.splice(marked.indexOf(files[i]), 1);
                        }
                        else {
                            files[i].className += " marked";
                            marked.push(files[i]);
                        }
                    }
                }
            }
        };
        window.onmouseup = function(e) {
            filearea.onmousemove = null;
            filearea.onmouseout = null;
            let selectarea = document.getElementById("select-area");
            if(selectarea) {
                filearea.removeChild(selectarea);
            }
        };
    });
    
    window.addEventListener("dragover", function(e) {
        clearTimeout(dragTimeout);
        document.getElementById("file-drop-area").style.visibility = "visible";
        e = e || event;
        e.preventDefault();
    });
    window.addEventListener("dragleave", function() {
        clearTimeout(dragTimeout);
        dragTimeout = setTimeout(function() {document.getElementById("file-drop-area").style.visibility = "";}, 100);
    });
    window.addEventListener("drop", function(e) {
        e = e || event;
        e.preventDefault();
    });
    document.getElementById("file-drop-area").addEventListener("drop", uploadFiles);
    
    document.getElementById("dir-back").addEventListener("click", function(e) {
        var button = document.getElementById("dir-back");
        if(hisIndex <= 0) {
            button.className.baseVal = button.className.baseVal.replace(" active", "");
            return;
        }
        hisIndex --;
        navigate = true;
        openPath(pathHistory[hisIndex]);
    });
    document.getElementById("dir-forward").addEventListener("click", function(e) {
        var button = document.getElementById("dir-forward");
        if(hisIndex >= pathHistory.length-1) {
            button.className.baseVal = button.className.baseVal.replace(" active", "");
            return;
        }
        hisIndex ++;
        navigate = false;
        openPath(pathHistory[hisIndex]);
    });
    document.getElementById("dir-up").addEventListener("click", function(e) {
        var button = document.getElementById("dir-up");
        if(globalPath == "/") {
            button.className.baseVal = button.className.baseVal.replace(" active", "");
            return;
        }
        let lastDirPos = globalPath.lastIndexOf("/", globalPath.length-2);
        let newPath = globalPath.substring(0, lastDirPos+1);
        openPath(newPath);
    });
    
    document.getElementById("list-view-button").addEventListener("click", function(e) {
        document.getElementById("content").className = "details-view";
        let vi = document.getElementById("view-indicator");
        if(vi.className.indexOf(" big-view") > -1) {
            vi.className = vi.className.replace(" big-view", "");
        }
        if(vi.className.indexOf(" list-view") < 0) {
            vi.className += " list-view";
        }
    });
    document.getElementById("big-view-button").addEventListener("click", function(e) {
        document.getElementById("content").className = "big-icons";
        let vi = document.getElementById("view-indicator");
        if(vi.className.indexOf(" list-view") > -1) {
            vi.className = vi.className.replace(" list-view", "");
        }
        if(vi.className.indexOf(" big-view") < 0) {
            vi.className += " big-view";
        }
    });
    
    document.getElementById("terminal").getElementsByTagName("textarea")[0].addEventListener("mousedown", forceSelection);
    document.getElementById("terminal").getElementsByTagName("textarea")[0].addEventListener("keydown", forceSelection);
    
    document.getElementById("logout-btn").addEventListener("click", function(e) {
        request("GET", url.substring(0, url.length-4) + "/logout", null, function(err, res) {
            window.location.replace("https://" + window.location.host + "/login");
        });
    });
}

// When opening path, display all relevant subfolders
function openPath(path, expand) {
    if(path != globalPath) {
        if(navigate) {
            navigate = false;
        }
        else {
            if(hisIndex < pathHistory.length-1) {
                pathHistory.splice(hisIndex+1);
            }
            pathHistory.push(path);
            hisIndex ++;
        }
    }
    var dirupButton = document.getElementById("dir-up");
    var backButton = document.getElementById("dir-back");
    var forwardButton = document.getElementById("dir-forward");
    if(path != "/") {
        if(dirupButton.className.baseVal.indexOf(" active") < 0) {
            dirupButton.className.baseVal += " active";
        }
    }
    else {
        if(dirupButton.className.baseVal.indexOf(" active") > -1) {
            dirupButton.className.baseVal = dirupButton.className.baseVal.replace(" active", "");
        }
    }
    if(hisIndex > 0) {
        if(backButton.className.baseVal.indexOf(" active") < 0) {
            backButton.className.baseVal += " active";
        }
    }
    else {
        if(backButton.className.baseVal.indexOf(" active") > -1) {
            backButton.className.baseVal = dirupButton.className.baseVal.replace(" active", "");
        }
    }
    if(hisIndex < pathHistory.length-1) {
        if(forwardButton.className.baseVal.indexOf(" active") < 0) {
            forwardButton.className.baseVal += " active";
        }
    }
    else {
        if(forwardButton.className.baseVal.indexOf(" active") > -1) {
            forwardButton.className.baseVal = dirupButton.className.baseVal.replace(" active", "");
        }
    }

    request("POST", url + "/files", {path: path}, function(err, res) {
        if(err) console.log(err);
        let files = JSON.parse(res);

        if(typeof expand === "undefined") {
            let filearea = document.getElementById("content");
            let fileItems = filearea.getElementsByClassName("file-item");
            for(let i=0; i<fileItems.length; ) {
                filearea.removeChild(fileItems[i]);
            }
            if(filearea.getElementsByClassName("background-message").length > 1) {
                filearea.removeChild(filearea.getElementsByClassName("background-message")[1]);
            }
            for(let i=0; i<files.directories.length; i++) {
                let fileItem = document.createElement("div");
                fileItem.className = "file-item";
                let icon = document.createElement("i");
                icon.className = "icon folder";
                let label = document.createElement("span");
                label.className = "file-name";
                label.textContent = files.directories[i].filename;
                let size = document.createElement("span");
                size.className = "file-size";
                size.textContent = sizeString(files.directories[i].info.size);
                let date = document.createElement("span");
                date.className = "file-date";
                date.textContent = parseDate(files.directories[i].info.mtime);
                fileItem.appendChild(icon);
                fileItem.appendChild(label);
                fileItem.appendChild(size);
                fileItem.appendChild(date);
                filearea.appendChild(fileItem);

                fileItem.addEventListener("click", markFile);
                fileItem.addEventListener("dblclick", function() {
                    let target = event.target;
                    while(target.className.indexOf("file-item") < 0) {
                        target = target.parentElement;
                    }
                    openPath(path + target.getElementsByClassName("file-name")[0].textContent + "/");
                });
                label.addEventListener("click", function(e) {
                    if(e.target.parentElement.className.indexOf(" marked") > -1) {
                        setTimeout(function() {
                            rename(this.target.parentElement);
                        }.bind(e), 500);
                    }
                });
            }
            for(let i=0; i<files.files.length; i++) {
                let fileItem = document.createElement("div");
                fileItem.className = "file-item";
                let icon = document.createElement("i");
                icon.className = "icon " + fileIcon(files.files[i].filename);
                let label = document.createElement("span");
                label.className = "file-name";
                label.textContent = files.files[i].filename;
                let size = document.createElement("span");
                size.className = "file-size";
                size.textContent = sizeString(files.files[i].info.size);
                let date = document.createElement("span");
                date.className = "file-date";
                date.textContent = parseDate(files.files[i].info.mtime);
                fileItem.appendChild(icon);
                fileItem.appendChild(label);
                fileItem.appendChild(size);
                fileItem.appendChild(date);
                filearea.appendChild(fileItem);

                fileItem.addEventListener("click", markFile);
                label.addEventListener("click", function(e) {
                    if(e.target.parentElement.className.indexOf(" marked") > -1) {
                        setTimeout(function() {
                            rename(this.target.parentElement);
                        }.bind(e), 500);
                    }
                });
            }
            if(files.directories.length == 0 && files.files.length == 0) {
                let backMessage = document.createElement("div");
                backMessage.className = "background-message";
                let icon = document.createElement("i");
                icon.className = "icon no-files";
                let title = document.createElement("h1");
                title.textContent = "Nothing to see here";
                let subtitle = document.createElement("h2");
                subtitle.textContent = "Drop files here to upload";
                backMessage.appendChild(icon);
                backMessage.appendChild(title);
                backMessage.appendChild(subtitle);
                filearea.appendChild(backMessage);
            }
        }

        globalPath = path;
        dirFiles = files;

        let root = document.getElementById("fs").firstElementChild;
        let dirs = path.split('/').slice(1, path.split('/').length-1);
        for(let i=0; i<dirs.length; i++) {
            let subs = root.getElementsByTagName("li");
            for(let j=0; j<subs.length; j++) {
                let spans = subs[j].getElementsByTagName("span");
                let filename = spans[spans.length-1].textContent;
                if(filename == dirs[i]) {
                    root = subs[j];
                    break;
                }
            }
            if(i < dirs.length-1) {
                root = root.nextElementSibling;
            }
        }

        if(path == "/") {
            root = root.firstElementChild;
        }

        if(typeof expand == "undefined" || expand == true) {
            if(sideDir) {
                sideDir.className = sideDir.className.replace(" selected", "");
            }

            root.className += " selected";
            sideDir = root;

            if(root.getElementsByClassName("expand").length > 0) {
                var arr = root.getElementsByClassName("expand")[0].getElementsByClassName("rarrow")[0];
                arr.style.transform = "rotate(90deg)";
            }
            if(root.nextElementSibling && root.nextElementSibling.tagName == "UL") {
                return;
            }
            let new_root = document.createElement("ul");
            root.parentElement.insertBefore(new_root, root.nextElementSibling);
            for(let i=0; i<files.directories.length; i++) {
                let li = document.createElement("li");
                new_root.appendChild(li);
                if(files.directories[i].hasSubs) {
                    let arrSpan = document.createElement("span");
                    arrSpan.className = "expand";
                    let arrIcon = document.createElement("i");
                    arrIcon.className = "rarrow";
                    arrSpan.appendChild(arrIcon);
                    li.appendChild(arrSpan);
                }
                li.addEventListener("click", function() {
                    let originalTarget = event.target;
                    let target_el = event.target;
                    if(target_el.tagName == "SPAN") {
                        target_el = target_el.parentElement;
                    }
                    else if(target_el.tagName == "I") {
                        target_el = target_el.parentElement.parentElement;
                    }
                    let el = target_el;
                    let selectedPath = "/";
                    while(el.parentElement.previousElementSibling) {
                        let spans = el.getElementsByTagName("span");
                        selectedPath = "/" + spans[spans.length-1].textContent + selectedPath;
                        el = el.parentElement.previousElementSibling;
                    }
                    if(originalTarget.className == "expand" || originalTarget.className == "rarrow") {
                        if(target_el.nextElementSibling && target_el.nextElementSibling.tagName == "UL") {
                            openPath(selectedPath, false);
                        }
                        else {
                            openPath(selectedPath, true);
                        }
                    }
                    else {
                        openPath(selectedPath);
                    }
                });
                let folderTag = document.createElement("span");
                folderTag.textContent = files.directories[i].filename;
                li.appendChild(folderTag);
            }
        }
        else {
            var arr = root.getElementsByClassName("expand")[0].getElementsByClassName("rarrow")[0];
            arr.style.transform = "";
            root.parentElement.removeChild(root.nextElementSibling);
        }
    });
}

function markFile() {
    let target = event.target;
    while(target.className.indexOf("file-item") < 0) {
        target = target.parentElement;
    }
    if(keysPressed.shift && markedOnShift == null) {
        markedOnShift = marked[marked.length-1];
    }
    if(!keysPressed.ctrl) {
        for(let i=0; i<marked.length; i++) {
            marked[i].className = marked[i].className.replace(" marked", "");
        }
        marked = [];
    }
    if(keysPressed.shift) {
        let lastSelected = markedOnShift;
        let newSelected = target;
        let filearea = document.getElementById("content");
        let ind1 = Array.prototype.indexOf.call(filearea.children, newSelected);
        let ind2 = Array.prototype.indexOf.call(filearea.children, lastSelected);
        for(let i=Math.min(ind1, ind2); i<=Math.max(ind1, ind2); i++) {
            if(filearea.children[i].className.indexOf(" marked") < 0) {
                filearea.children[i].className += " marked";
                marked.push(filearea.children[i]);
            }
        }
    }
    else {
        markedOnShift = null;
        if(target.className.indexOf(" marked") < 0) {
            target.className += " marked";
            marked.push(target);
        }
        else {
            if(keysPressed.ctrl) {
                target.className = target.className.replace(" marked", "");
                marked.splice(marked.indexOf(target), 1);
            }
        }
    }
    
    let detailsarea = document.getElementById("right-sidebar");
    let found = false;
    for(let i=0; i<dirFiles.directories.length; i++) {
        if(dirFiles.directories[i].filename == target.getElementsByClassName("file-name")[0].textContent) {
            while(detailsarea.hasChildNodes()) {
                detailsarea.removeChild(detailsarea.lastChild);
            }
            let folderIcon = document.createElement("i");
            folderIcon.className = "icon folder";
            let label = document.createElement("span");
            label.textContent = dirFiles.directories[i].filename;
            let details = document.createElement("table");
            details.className = "details";
            
            let row = document.createElement("tr");
            let name = document.createElement("td");
            name.textContent = "File type";
            let val = document.createElement("td");
            val.textContent = "Folder";
            row.appendChild(name);
            row.appendChild(val);
            details.appendChild(row);
            
            for(var det in detailTypes) {
                if(detailTypes.hasOwnProperty(det) && dirFiles.directories[i].info.hasOwnProperty(det)) {
                    let row = document.createElement("tr");
                    let name = document.createElement("td");
                    name.textContent = detailTypes[det];
                    let val = document.createElement("td");
                    if(det == "size") {
                        val.textContent = "calculating...";
                        request("POST", url + "/size", {path: globalPath + dirFiles.directories[i].filename}, function(err, res) {
                            val.textContent = sizeString(JSON.parse(res).size);
                        });
                    }
                    else if(det == "atime" || det == "mtime" || det == "ctime") {
                        val.textContent = parseDate(dirFiles.directories[i].info[det]);
                    }
                    else {
                        val.textContent = dirFiles.directories[i].info[det];
                    }
                    row.appendChild(name);
                    row.appendChild(val);
                    details.appendChild(row);
                }
            }
            detailsarea.appendChild(folderIcon);
            detailsarea.appendChild(label);
            detailsarea.appendChild(details);
            found = true;
        }
    }
    if(!found) {
        for(let i=0; i<dirFiles.files.length; i++) {
            if(dirFiles.files[i].filename == target.getElementsByTagName("span")[0].textContent) {
                while(detailsarea.hasChildNodes()) {
                    detailsarea.removeChild(detailsarea.lastChild);
                }
                let fileico = document.createElement("i");
                fileico.className = "icon " + fileIcon(dirFiles.files[i].filename);
                let label = document.createElement("span");
                label.textContent = dirFiles.files[i].filename;
                let details = document.createElement("table");
                details.className = "details";
                
                let row = document.createElement("tr");
                let name = document.createElement("td");
                name.textContent = "File type";
                let val = document.createElement("td");
                val.textContent = fileType(dirFiles.files[i].filename);
                row.appendChild(name);
                row.appendChild(val);
                details.appendChild(row);
                
                for(var det in detailTypes) {
                    if(detailTypes.hasOwnProperty(det) && dirFiles.files[i].info.hasOwnProperty(det)) {
                        let row = document.createElement("tr");
                        let name = document.createElement("td");
                        name.textContent = detailTypes[det];
                        let val = document.createElement("td");
                        if(det == "size") {
                            val.textContent = sizeString(dirFiles.files[i].info[det]);
                        }
                    else if(det == "atime" || det == "mtime" || det == "ctime") {
                        val.textContent = parseDate(dirFiles.files[i].info[det]);
                    }
                        else {
                            val.textContent = dirFiles.files[i].info[det];
                        }
                        row.appendChild(name);
                        row.appendChild(val);
                        details.appendChild(row);
                    }
                }
                detailsarea.appendChild(fileico);
                detailsarea.appendChild(label);
                detailsarea.appendChild(details);
            }
        }
    }
}

function request(method = "GET", address, params, callback, progressCallback, isDownload) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                if(!isDownload) {
                    callback(null, xhr.responseText, xhr);
                }
                else {
                    callback(null, null, xhr);
                }
            }
            else {
                callback("Error fetching " + address);
            }
        }
        else if(xhr.readyState == 3) {
            if(progressCallback) {
                progressCallback(xhr.responseText);
            }
        }
    }
    xhr.open(method, address, true);
    if(isDownload) {
        xhr.responseType = "arraybuffer";
    }
    if(params) {
        if(params instanceof FormData) {
            xhr.upload.onprogress = progressCallback;
            xhr.send(params);
        }
        else {
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(params));
        }
    }
    else {
        xhr.send(null);
    }
}

function rename(fileItem) {
    let label = fileItem.getElementsByClassName("file-name")[0];
    label.contentEditable = true;
    selectAll(label);
    let oldname = label.textContent;
    label.onkeydown = function(e) {
        if(e.keyCode == 13) {
            e.preventDefault();
            changeName(fileItem, oldname, e.target.textContent);
            e.target.onchange = null;
            e.target.onkeydown = null;
        }
    };
    label.onblur = function(e) {
        changeName(fileItem, oldname, e.target.textContent);
        e.target.onchange = null;
        e.target.onkeydown = null;
    };
}

function changeName(fileItem, oldname, newname) {
    let label = fileItem.getElementsByClassName("file-name")[0];
    label.contentEditable = false;
    if(oldname == newname) return;
    request("POST", url + "/rename", {path: globalPath, oldname: oldname, newname: newname}, function(err, res) {
        
    });
}

function download(fileItems) {
    let filenames = [];
    fileItems.forEach(function(fi) {
        filenames.push(fi.getElementsByClassName("file-name")[0].textContent);
    });
    request("POST", url + "/download", {path: globalPath, filenames: filenames}, function(err, res, xhr) {
        if(err) return;
        var blob = new Blob([xhr.response]);
        let a = document.createElement("a");
        a.style = "display: none;";
        document.body.appendChild(a);
        let url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = xhr.getResponseHeader("Content-Disposition").match(/\sfilename="([^"]+)"(\s|$)/)[1];
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, null, true);
}

function remove(fileItems) {
    fileItems.forEach(function(fi) {
        let label = fi.getElementsByClassName("file-name")[0];
        request("POST", url + "/remove", {path: globalPath + label.textContent}, function(err, res) {
            if(!err) {
                document.getElementById("content").removeChild(fi);
            }
        });
    });
}

function newFolder() {
    let filearea = document.getElementById("content");
    let fileItems = filearea.getElementsByClassName("file-item");
    let newName = "New folder";
    let unique = false;
    while(!unique) {
        unique = true;
        for(let i=0; i<fileItems.length; i++) {
            let label = fileItems[i].getElementsByClassName("file-name")[0].textContent;
            if(label == newName) {
                unique = false;
                let ind = 0;
                if(newName.lastIndexOf(")") == newName.length-1) {
                    ind = parseInt(newName.substring(newName.lastIndexOf("(")+1, newName.lastIndexOf(")")));
                }
                ind ++;
                newName = "New folder (" + ind + ")";
                break;
            }
        }
    }
    request("POST", url + "/new_folder", {path: globalPath, name: newName}, function(err, res) {
        openPath(globalPath);
        setTimeout(function() {
            let filearea = document.getElementById("content");
            let fileItems = filearea.getElementsByClassName("file-item");
            for(let i=0; i<fileItems.length; i++) {
                let label = fileItems[i].getElementsByClassName("file-name")[0].textContent;
                if(label == newName) {
                    rename(fileItems[i]);
                    return;
                }
            }
        }, 10);
    });
}

function cut(files) {
    clipboard.action = "cut";
    clipboard.path = globalPath;
    clipboard.files = files;
}

function copy(files) {
    clipboard.action = "copy";
    clipboard.path = globalPath;
    clipboard.files = files;
}

function paste() {
    if(clipboard.action == null || (clipboard.action == "cut" && clipboard.path == globalPath)) {
        return;
    }
    let fnames = [];
    clipboard.files.forEach(function(f) {
        fnames.push(f.getElementsByClassName("file-name")[0].textContent);
    });
    request("POST", url + "/" + clipboard.action, {from: clipboard.path, to: globalPath, files: fnames}, function(err, res) {
        res = JSON.parse(res);
        openPath(globalPath);
        setTimeout(function() {
            let filearea = document.getElementById("content");
            let fileItems = filearea.getElementsByClassName("file-item");
            marked = [];
            for(let i=0; i<fileItems.length; i++) {
                if(fileItems[i].className.indexOf(" marked") > -1) {
                    fileItems[i].className = fileItems[i].className.replace(" marked", "");
                }
                let label = fileItems[i].getElementsByClassName("file-name")[0].textContent;
                if(res.indexOf(label) > -1) {
                    fileItems[i].className += " marked";
                    marked.push(fileItems[i]);
                }
            }
        }, 50);
    });
    if(clipboard.action == "cut") {
        clipboard.action == null;
        clipboard.path == null;
        clipboard.files = [];
    }
}

function generateMenu(menu, options) {
    options.forEach(function(opt) {
        if(opt == "line") {
            let line = document.createElement("div");
            line.className = "menu-line";
            menu.appendChild(line);
        }
        else {
            let btn = document.createElement("div");
            btn.className = "menu-opt";
            btn.addEventListener("click", opt.action);
            let icon = document.createElement("i");
            icon.className = "icon " + opt.icon;
            let label = document.createElement("span");
            label.className = "menu-label";
            label.textContent = opt.label;
            btn.appendChild(icon);
            btn.appendChild(label);
            menu.appendChild(btn);
        }
    });
}

function getInviteCode() {
    let oldWindow = document.getElementById("invite-token-window");
    if(oldWindow) document.getElementById("subheader").removeChild(oldWindow);
    request("GET", url.substring(0, url.length-4) + "/invite", null, function(err, invite) {
        if(err) return;
        invite = JSON.parse(invite);
        let tokenWindow = document.createElement("div");
        tokenWindow.id = "invite-token-window";
        tokenWindow.style.top = (document.getElementById("subheader").offsetTop) + "px";
        tokenWindow.style.right = "10px";
        let infoSpan = document.createElement("span");
        infoSpan.id = "invite-message";
        infoSpan.textContent = "Give the following code to another user for registration:";
        let tokenSpan = document.createElement("span");
        tokenSpan.id = "invite-token";
        tokenSpan.textContent = invite.token;
        let timeSpan = document.createElement("span");
        timeSpan.id = "invite-time";
        let time = Math.ceil((invite.expires - Date.now())/1000);
        let seconds = time;
        let minutes = 0;
        if(seconds >= 60) {
            minutes = Math.floor(seconds / 60);
            seconds -= minutes * 60;
        }
        if(minutes < 10) minutes = "0" + minutes;
        if(seconds < 10) seconds = "0" + seconds;
        timeSpan.textContent = "Code expires in " + minutes + ":" + seconds;
        let countdown = setInterval(function() {
            let time = Math.ceil((invite.expires - Date.now())/1000);
            let seconds = time;
            let minutes = 0;
            if(seconds >= 60) {
                minutes = Math.floor(seconds / 60);
                seconds -= minutes * 60;
            }
            if(minutes < 10) minutes = "0" + minutes;
            if(seconds < 10) seconds = "0" + seconds;
            timeSpan.textContent = "Code expires in " + minutes + ":" + seconds;
        }, 1000);
        let timeout = setTimeout(function() {clearInterval(countdown); timeSpan.textContent = "Code expired.";}, time * 1000);
        let closeBtn = document.createElement("span");
        closeBtn.className = "close-btn";
        closeBtn.textContent = "x";
        closeBtn.addEventListener("click", function(e) {
            document.getElementById("subheader").removeChild(e.target.parentElement);
            clearTimeout(timeout);
        });
        tokenWindow.appendChild(infoSpan);
        tokenWindow.appendChild(tokenSpan);
        tokenWindow.appendChild(timeSpan);
        tokenWindow.appendChild(closeBtn);
        document.getElementById("subheader").appendChild(tokenWindow);
        selectAll(tokenSpan);
    });
}

function sizeString(size) {
    if(size / (1024 * 1024 * 1024 * 1024) > 1) {
        return (size / (1024 * 1024 * 1024 * 1024)).toPrecision(3) + " TB";
    }
    else if(size / (1024 * 1024 * 1024) > 1) {
        return (size / (1024 * 1024 * 1024)).toPrecision(3) + " GB";
    }
    else if(size / (1024 * 1024) > 1) {
        return (size / (1024 * 1024)).toPrecision(3) + " MB";
    }
    else if(size / 1024 > 1) {
        return (size / 1024).toPrecision(3) + " KB";
    }
    else {
        return size + " b";
    }
}

function fileIcon(fname) {
    let ext = fname.substring(fname.lastIndexOf(".")+1);
    switch(ext) {
        case "txt":
            return "file-text";
        case "png": case "jpg": case "jpeg": case "bmp": case "svg": case "ico":
            return "file-image";
        case "exe": case "sh":
            return "file-executable";
        case "html": case "htm":
            return "file-html";
        case "js": case "json":
            return "file-js";
        case "css":
            return "file-css";
        case "cpp":
            return "file-cpp";
        case "c":
            return "file-c";
        case "zip": case "tar": case "rar":
            return "file-archive";
        case "mp3": case "wav": case "ogg": case "aac": case "mp4": case "avi":
            return "file-media";
        case "ai":
            return "file-ai";
        case "ps":
            return "file-ps";
        default:
            return "file-default";
    }
}

function fileType(fname) {
    let ext = fname.substring(fname.lastIndexOf(".")+1);
    switch(ext) {
        case "txt":
            return "Text file";
        case "png": case "jpg": case "jpeg": case "bmp": case "svg": case "ico":
            return "Image file";
        case "exe": case "sh":
            return "Executable file";
        case "html": case "htm":
            return "HTML file";
        case "js": 
            return "Javascript file";
        case "json":
            return "JSON file";
        case "css":
            return "CSS file";
        case "cpp":
            return "C++ file";
        case "c":
            return "C file";
        case "zip": case "tar": case "rar":
            return "Archive";
        case "mp3": case "wav": case "ogg": case "aac":
            return "Audio file";
        case "mp4": case "avi":
            return "Video file";
        case "ai":
            return "Adobe Illustrator file";
        case "ps":
            return "Adobe Photoshop file";
        default:
            return "File";
    }
}

function parseDate(datestring) {
    let datetime = new Date(datestring).toString();
    let parts = datetime.split(" ");
    return parts[1] + " " + parts[2] + ", " + parts[3] + "; " + parts[4].split(":")[0] + ":" + parts[4].split(":")[1];
}

function uploadFiles(e) {
    e.preventDefault();
    document.getElementById("file-drop-area").style.visibility = "";
    let files = e.target.files || e.dataTransfer.files;
    console.log(files);
    Array.prototype.forEach.call(files, function(file) {
        let formData = new FormData();
        formData.append("path", globalPath);
        formData.append("file", file);
        let progressItem = document.createElement("div");
        progressItem.className = "progress-item";
        let label = document.createElement("span");
        label.textContent = file.name;
        let progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        let progress = document.createElement("div");
        progress.className = "progress";
        progressBar.appendChild(progress);
        progressItem.appendChild(label);
        progressItem.appendChild(progressBar);
        document.getElementById("progress-window").appendChild(progressItem);
        request("POST", url + "/upload", formData, function(err, res) {
            progressItem.removeChild(progressBar);
            let result = document.createElement("div");
            result.className = "upload-result";
            progressItem.appendChild(result);
            if(err) {
                result.textContent = "There was an error";
                console.log(err);
            }
            else {
                result.textContent = "Done."
                openPath(globalPath);
            }
        }, function(e) {
            e = e || event;
            let loaded = e.position || e.loaded;
            let total = e.totalSize || e.total;
            progress.style.width = 100*(loaded/total) + "%";
        });
    });
}

function selectAll(e) {
    var range = document.createRange();
    range.selectNodeContents(e);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function forceSelection(e) {
    let start = e.target.selectionStart;
    let end = e.target.selectionEnd;
    if(end < terminalStart) {
        end = terminalStart;
    }
    if(start < terminalStart) {
        start = terminalStart;
    }
    e.target.setSelectionRange(start, end);
}