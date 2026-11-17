
/* =================================
   MANUFACTURING AI
   LOGIN HANDLER
================================= */

document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");

    if (!loginForm) return;

    loginForm.addEventListener("submit", (event) => {

        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const role = document.getElementById("role").value;

        if (!email || !password || !role) {
            loginMessage.textContent = "Please complete all fields.";
            loginMessage.style.color = "#e5a08c";
            return;
        }

        loginMessage.textContent =
            "Login interface ready. Awaiting secure Django authentication.";

        loginMessage.style.color = "#c5a46d";

        console.log("Login form validated:", {
            email: email,
            role: role
        });

    });

});
