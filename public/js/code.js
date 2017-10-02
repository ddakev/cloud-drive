var code = "";

window.onload = function() {
    let codefield = document.getElementById("code-container");
    code = window.editor.getValue();
    console.log(code);
};

function autosave(editor) {
    console.log(editor.getValue());
}