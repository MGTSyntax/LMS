document.addEventListener("DOMContentLoaded", function() {
    var loansLink = document.getElementById("loansLink");
    var loanSubMenu = document.getElementById("loanSubMenu");

    loansLink.addEventListener("click", function(e) {
        e.preventDefault();
        loanSubMenu.style.display = (loanSubMenu.style.display === "block") ? "none" : "block";
    });
});