
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    const usernameInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const roleInput = document.getElementById("role");
    const message = document.getElementById("loginMessage");
    const submitButton = form.querySelector('button[type="submit"]');

    const dashboardRoutes = {
        admin: "inspection-admin.html",
        engineer: "assistant.html",
        supervisor: "inspection-supervisor.html"
    };

    const roleMap = {
        administrator: "admin",
        engineer: "engineer",
        supervisor: "supervisor"
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        message.textContent = "Authenticating...";
        submitButton.disabled = true;

        try {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const selectedRole = roleInput.value;

            await ManufacturingAPI.login(username, password);

            const profile = await ManufacturingAPI.request(
                "/accounts/profile/"
            );

            const actualRole = String(profile.role).toLowerCase();

            if (roleMap[selectedRole] !== actualRole) {
                ManufacturingAPI.logout();

                throw new Error(
                    `Incorrect role selected. Your account role is ${profile.role}.`
                );
            }

            const destination = dashboardRoutes[actualRole];

            if (!destination) {
                ManufacturingAPI.logout();
                throw new Error("Unsupported account role.");
            }

            message.textContent =
                "Login successful. Opening workspace...";

            window.location.href = destination;

        } catch (error) {
            message.textContent = error.message;
        } finally {
            submitButton.disabled = false;
        }
    });
});
