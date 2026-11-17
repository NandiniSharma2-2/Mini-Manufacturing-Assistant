
document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    async function api(path) {
        return ManufacturingAPI.request(path);
    }

    function records(data) {
        return Array.isArray(data)
            ? data
            : (data.results || []);
    }

    function cell(row, value, className = "") {
        const td = document.createElement("td");
        td.textContent = value == null ? "" : String(value);
        td.className = className;
        row.appendChild(td);
    }

    async function verifySupervisor() {
        const profile = await api("/accounts/profile/");

        if (profile.role !== "SUPERVISOR") {
            throw new Error("Supervisor access required.");
        }

        $("accessMessage").hidden = true;
        $("dashboard").hidden = false;
    }

    async function loadMachines() {
        const data = await api("/manuals/machines/");
        const machines = records(data);
        const select = $("machineFilter");

        select.replaceChildren();
        select.add(new Option("All Machines", ""));

        machines.forEach(machine => {
            select.add(new Option(
                `${machine.machine_id} — ${machine.machine_name}`,
                machine.machine_id
            ));
        });
    }

    function getParams() {
        const params = new URLSearchParams();

        if ($("machineFilter").value) {
            params.set("machine_id", $("machineFilter").value);
        }

        if ($("statusFilter").value) {
            params.set("status", $("statusFilter").value);
        }

        if ($("fromDate").value) {
            params.set("date_from", $("fromDate").value);
        }

        if ($("toDate").value) {
            params.set("date_to", $("toDate").value);
        }

        return params;
    }

    async function loadHistory() {
        const params = getParams();

        const data = await api(
            "/questions/history/?" + params.toString()
        );

        const history = records(data);
        const table = $("historyTable");

        table.replaceChildren();

        if (history.length === 0) {
            const row = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6;
            td.textContent = "No questions found.";
            row.appendChild(td);
            table.appendChild(row);
            return;
        }

        history.forEach(item => {
            const row = document.createElement("tr");

            const date = item.created_at
                ? new Date(item.created_at).toLocaleString()
                : "-";

            const engineer =
                typeof item.user === "object"
                    ? item.user?.username
                    : (item.username || item.user || "-");

            const machine =
                typeof item.machine === "object"
                    ? (
                        item.machine?.machine_id ||
                        item.machine?.machine_name
                    )
                    : (item.machine_id || item.machine || "-");

            cell(row, date);
            cell(row, engineer);
            cell(row, machine);
            cell(row, item.question, "question");
            cell(row, item.answer, "answer");

            cell(
                row,
                item.status,
                "status " + (
                    item.status === "ANSWERED"
                        ? "answered"
                        : "insufficient"
                )
            );

            table.appendChild(row);
        });
    }

    async function loadStatistics() {
        const params = new URLSearchParams();

        if ($("fromDate").value) {
            params.set("date_from", $("fromDate").value);
        }

        if ($("toDate").value) {
            params.set("date_to", $("toDate").value);
        }

        const stats = await api(
            "/questions/statistics/?" + params.toString()
        );

        $("totalQuestions").textContent =
            stats.total_questions ?? 0;

        $("answeredQuestions").textContent =
            stats.answered ?? 0;

        $("unansweredQuestions").textContent =
            stats.insufficient_evidence ?? 0;

        $("answerRate").textContent =
            Number(stats.answer_rate || 0).toFixed(1) + "%";

        $("averageTime").textContent =
            Number(
                stats.average_generation_time_seconds || 0
            ).toFixed(2) + "s";

        const container = $("machineStatistics");
        container.replaceChildren();

        const entries = Object.entries(
            stats.questions_by_machine || {}
        );

        if (!entries.length) {
            container.textContent = "No statistics available.";
        }

        entries.forEach(([name, count]) => {
            const p = document.createElement("p");
            p.textContent = `${name}: ${count} questions`;
            container.appendChild(p);
        });
    }

    async function refreshDashboard() {
        $("filterMessage").textContent = "Loading data...";

        try {
            await Promise.all([
                loadHistory(),
                loadStatistics()
            ]);

            $("filterMessage").textContent = "";
        } catch (error) {
            $("filterMessage").textContent = error.message;
            $("filterMessage").className = "error";
        }
    }

    $("applyFilters").addEventListener(
        "click",
        refreshDashboard
    );

    $("refreshBtn").addEventListener(
        "click",
        refreshDashboard
    );

    $("clearFilters").addEventListener("click", () => {
        $("machineFilter").value = "";
        $("statusFilter").value = "";
        $("fromDate").value = "";
        $("toDate").value = "";
        refreshDashboard();
    });

    $("logoutBtn").addEventListener("click", () => {
        ManufacturingAPI.logout();
        window.location.href = "login.html";
    });

    async function initialize() {
        try {
            await verifySupervisor();
            await loadMachines();
            await refreshDashboard();
        } catch (error) {
            $("accessMessage").textContent = error.message;
            $("accessMessage").hidden = false;
            $("dashboard").hidden = true;
        }
    }

    initialize();
});
