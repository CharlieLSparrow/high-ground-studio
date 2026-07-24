var ExtensionPreprocessingJS = new function () {
    this.run = function (arguments) {
        var selection = "";
        if (window.getSelection) {
            selection = String(window.getSelection());
        }
        arguments.completionFunction({
            url: String(document.location.href || ""),
            title: String(document.title || ""),
            selectedText: selection
        });
    };
};
