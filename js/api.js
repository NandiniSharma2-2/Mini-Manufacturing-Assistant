
const API_BASE = "http://127.0.0.1:8000/api";

const ManufacturingAPI = {
    async login(username, password) {
        const response = await fetch(`${API_BASE}/accounts/login/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            const error = data.detail || data.non_field_errors?.[0] ||
                data.error || "Login failed";
            throw new Error(typeof error === "string" ? error : "Login failed");
        }

        sessionStorage.setItem("access_token", data.access);
        sessionStorage.setItem("refresh_token", data.refresh);
        return data;
    },

    async request(path, options = {}) {
        const token = sessionStorage.getItem("access_token");

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers
            }
        });

        const responseText = await response.text();
        let data;
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            data = { detail: responseText || "The server returned an invalid response." };
        }

        if (!response.ok) {
            const error = new Error(
                data.detail || data.error || "The assistant request failed."
            );
            error.status = response.status;
            throw error;
        }
        if (!data || typeof data !== "object") {
            throw new Error("The assistant returned an invalid response.");
        }

        return data;
    },

    getMachines() {
        return this.request("/manuals/machines/");
    },

    askQuestion(machineId, question) {
        return this.request("/questions/ask/", {
            method: "POST",
            body: JSON.stringify({
                machine_id: machineId,
                question: question
            })
        });
    },

    getHistory() {
        return this.request("/questions/history/");
    },

    logout() {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("refresh_token");
    }
};
