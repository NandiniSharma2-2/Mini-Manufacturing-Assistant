
"use strict";

// Manufacturing AI Manual Assistant
// Administrator Dashboard

const $ = (id) => document.getElementById(id);

// Use the existing API client from js/api.js.
async function apiRequest(path, options = {}) {
    return ManufacturingAPI.request(path, options);
}

// Display success and error messages.
function showMessage(id, message, success = false) {
    const element = $(id);

    if (!element) {
        console.warn("Missing element:", id);
        return;
    }

    element.textContent = message;
    element.className = "message " + (
        success ? "success" : "error"
    );
}

// Support both normal arrays and paginated API responses.
function getResults(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (data && Array.isArray(data.results)) {
        return data.results;
    }

    return [];
}

// Add a cell safely to a table row.
function addCell(row, value) {
    const cell = document.createElement("td");

    cell.textContent =
        value === null || value === undefined
            ? ""
            : String(value);

    row.appendChild(cell);
}

// Verify Administrator access.
async function verifyAdmin() {
    const user = await apiRequest("/accounts/profile/");

    if (String(user.role).toUpperCase() !== "ADMIN") {
        throw new Error(
            "Access denied. Administrator account required."
        );
    }

    $("adminName").textContent = user.username;

    $("accessMessage").hidden = true;
    $("dashboard").hidden = false;

    console.log("Administrator verified:", user.username);
}

// Load registered machines.
async function loadMachines() {
    const data = await apiRequest("/manuals/machines/?include_inactive=true");
    const machines = getResults(data);

    const table = $("machineTable");
    const inactiveTable = $("inactiveMachineTable");
    const select = $("manualMachine");

    table.replaceChildren();
    inactiveTable.replaceChildren();
    select.replaceChildren();

    select.add(new Option("Select machine", ""));

    for (const machine of machines) {
        const row = document.createElement("tr");

        addCell(row, machine.machine_id);
        addCell(row, machine.machine_name);
        addCell(row, machine.model);
        addCell(row, machine.description);
        const actions = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = machine.is_active ? "danger" : "secondary";
        button.textContent = machine.is_active ? "Deactivate" : "Recover";
        button.addEventListener("click", () => toggleMachine(machine));
        actions.appendChild(button);
        row.appendChild(actions);

        if (machine.is_active) {
                table.appendChild(row);
                select.add(
                    new Option(
                        `${machine.machine_id} — ${machine.machine_name}`,
                        machine.machine_id
                    )
                );
        } else {
                inactiveTable.appendChild(row);
        }
    }

    console.log("Machines loaded:", machines.length);
}

// Load uploaded PDF manuals.
async function loadManuals() {
    const [manualData, machineData, productData] = await Promise.all([
        apiRequest("/manuals/?include_inactive=true"),
        apiRequest("/manuals/machines/?include_inactive=true"),
        apiRequest("/inspections/products/?include_inactive=true")
    ]);
    const manuals = getResults(manualData);
    const machines = getResults(machineData);
    const products = getResults(productData);

    const table = $("manualTable");
    const inactiveTable = $("inactiveManualTable");
    table.replaceChildren();
    inactiveTable.replaceChildren();

    for (const manual of manuals) {
        const row = document.createElement("tr");

        const machine = machines.find(
            (item) => String(item.id) === String(manual.machine)
        );
        const product = products.find(
            (item) => String(item.id) === String(manual.product)
        );
        const ownerActive = product ? product.active : machine?.is_active;
        const active = manual.active && ownerActive;
        addCell(
            row,
            product
                ? `${product.sku} — ${product.name}`
                : machine
                    ? `${machine.machine_id} — ${machine.machine_name}`
                    : "Unknown"
        );
        addCell(row, manual.document_id);
        addCell(row, manual.revision);
        addCell(row, manual.pdf_filename);

        let processingStatus = "Pending";

        if (manual.processed) {
            processingStatus = "Processed";
        } else if (manual.processing_error) {
            processingStatus = "Failed";
        } else if (manual.status) {
            processingStatus = manual.status;
        }

        addCell(row, processingStatus);
        addCell(row, manual.chunk_count || 0);
        const actions = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = active ? "danger" : "secondary";
        button.textContent = active ? "Deactivate" : "Recover";
        button.disabled = !active && (manual.active || !ownerActive);
        if (button.disabled) {
            button.title = "Recover the inactive machine or product first.";
        }
        button.addEventListener("click", () => toggleManual(manual));
        actions.appendChild(button);
        row.appendChild(actions);
        (active ? table : inactiveTable).appendChild(row);
    }
    if (!table.rows.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.className = "muted";
        cell.textContent = "No active manuals.";
        row.appendChild(cell);
        table.appendChild(row);
    }
    if (!inactiveTable.rows.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.className = "muted";
        cell.textContent = "No inactive manuals.";
        row.appendChild(cell);
        inactiveTable.appendChild(row);
    }

    console.log("Manuals loaded:", manuals.length);
}

async function toggleMachine(machine) {
    const isActive = !machine.is_active;
    const action = isActive ? "Recover" : "Deactivate";
    if (!window.confirm(`${action} ${machine.machine_id}?`)) return;
    try {
        await apiRequest(`/manuals/machines/${machine.id}/status/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive })
        });
        await refreshDashboard();
    } catch (error) {
        alert(error.message || `Could not ${action.toLowerCase()} machine.`);
    }
}

async function toggleManual(manual) {
    const active = !manual.active;
    const action = active ? "Recover" : "Deactivate";
    if (!window.confirm(`${action} manual ${manual.document_id} revision ${manual.revision}?`)) return;
    try {
        await apiRequest(`/manuals/${manual.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active })
        });
        await refreshDashboard();
    } catch (error) {
        alert(error.message || `Could not ${action.toLowerCase()} manual.`);
    }
}

// Register a new machine.
async function registerMachine(event) {
    event.preventDefault();

    const button = event.submitter ||
        $("machineForm").querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled = true;
    }

    const payload = {
        machine_id: $("machineId").value.trim(),
        machine_name: $("machineName").value.trim(),
        model: $("machineModel").value.trim(),
        description: $("machineDescription").value.trim()
    };

    try {
        await apiRequest("/manuals/machines/create/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        showMessage(
            "machineMessage",
            "Machine registered successfully.",
            true
        );

        $("machineForm").reset();

        await loadMachines();

    } catch (error) {
        console.error("Machine registration failed:", error);

        showMessage(
            "machineMessage",
            error.message || "Machine registration failed."
        );

    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// Upload a PDF manual.
async function uploadManual(event) {
    event.preventDefault();

    const button = event.submitter ||
        $("manualForm").querySelector(
            'button[type="submit"]'
        );

    const file = $("pdfFile").files[0];
    const machineId = $("manualMachine").value;

    if (!machineId) {
        showMessage(
            "manualMessage",
            "Please select a machine."
        );
        return;
    }

    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
        showMessage(
            "manualMessage",
            "Please select a valid PDF file."
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    const formData = new FormData();

    formData.append("machine_id", machineId);
    formData.append(
        "document_id",
        $("documentId").value.trim()
    );
    formData.append(
        "revision",
        $("revision").value.trim()
    );
    formData.append("pdf_file", file);

    try {
        showMessage(
            "manualMessage",
            "Uploading and processing PDF..."
        );

        // Send the PDF exactly once.
        // Do not set Content-Type for FormData.
        // Get the authentication token.
const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("access");

if (!token) {
    throw new Error("Login session expired. Please log in again.");
}

// Upload the PDF using multipart/form-data.
const response = await fetch(
    "http://127.0.0.1:8000/api/manuals/upload/",
    {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    }
);

// Read the Django response.
const result = await response.json().catch(() => ({}));

if (!response.ok) {
    const details = Object.entries(result)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");

    throw new Error(
        details || `Upload failed (${response.status})`
    );
}

        const processed = result.manual?.processed;
        const processingError =
            result.manual?.processing_error;

        if (processingError) {
            showMessage(
                "manualMessage",
                "PDF saved, but processing failed: " +
                processingError
            );
        } else {
            showMessage(
                "manualMessage",
                result.message ||
                    (processed
                        ? "PDF uploaded and processed successfully."
                        : "PDF uploaded successfully."),
                true
            );
        }

        $("manualForm").reset();

        await loadManuals();

        console.log("Upload response:", result);

    } catch (error) {
        console.error("PDF upload failed:", error);

        showMessage(
            "manualMessage",
            error.message || "PDF upload failed."
        );

    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// Refresh machines and manuals.
async function refreshDashboard() {
    try {
        await Promise.all([
            loadMachines(),
            loadManuals()
        ]);
    } catch (error) {
        console.error("Refresh failed:", error);
        alert(error.message || "Failed to refresh dashboard.");
    }
}

// Logout.
function logout() {
    ManufacturingAPI.logout();
    window.location.href = "login.html";
}

// Initialize the Administrator Dashboard.
async function initialize() {
    try {
        // Verify access before showing protected UI.
        await verifyAdmin();

        // Connect dashboard actions.
        $("machineForm").addEventListener(
            "submit",
            registerMachine
        );

        $("manualForm").addEventListener(
            "submit",
            uploadManual
        );

        $("refreshBtn").addEventListener(
            "click",
            refreshDashboard
        );

        $("logoutBtn").addEventListener(
            "click",
            logout
        );

        // Load existing data.
        await Promise.all([
            loadMachines(),
            loadManuals()
        ]);

        console.log("Administrator dashboard ready.");

    } catch (error) {
        console.error(
            "Administrator dashboard initialization failed:",
            error
        );

        const accessMessage = $("accessMessage");

        if (accessMessage) {
            accessMessage.textContent =
                error.message || "Dashboard failed to load.";

            // Display error only when access verification failed.
            if ($("dashboard").hidden) {
                accessMessage.hidden = false;
            }
        }
    }
}

// Start after the HTML is ready.
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );
} else {
    initialize();
}
