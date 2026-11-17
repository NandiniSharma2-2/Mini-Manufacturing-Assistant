"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const role = document.body.dataset.role;
  const blobs = new Set();
  const uploadPreviewUrls = new Set();
  const imageCache = new Map();
  let currentUserId = null;
  let inspectionPollingTimer = null;
  const roleNames = {
    ADMIN: "inspection-admin.html",
    ENGINEER: "inspection-engineer.html",
    SUPERVISOR: "inspection-supervisor.html"
  };

  function records(data) {
    return Array.isArray(data) ? data : (data.results || []);
  }

  async function loadMachines() {
    const machines = records(await request("/manuals/machines/"));
    document.querySelectorAll("[data-machine-select]").forEach((select) => {
      const current = select.value;
      select.replaceChildren();
      option(
        select,
        select.id === "historyMachine" ? "All machines" : "Select a machine",
        ""
      );
      machines.forEach((machine) => {
        option(
          select,
          `${machine.machine_id} — ${machine.machine_name}`,
          machine.id
        );
      });
      if (current) select.value = current;
    });
  }

  async function loadAdminManuals() {
    const [machineData, manualData, productData] = await Promise.all([
      request("/manuals/machines/?include_inactive=true"),
      request("/manuals/?include_inactive=true"),
      request("/inspections/products/?include_inactive=true")
    ]);
    const allMachines = records(machineData);
    const machines = allMachines.filter((machine) => machine.is_active);
    const products = records(productData);
    const machineSelect = $("manualMachine");
    if (machineSelect) {
      const currentMachine = machineSelect.value;
      machineSelect.replaceChildren();
      option(machineSelect, "Select a machine", "");
      machines.forEach((machine) => {
        option(
          machineSelect,
          `${machine.machine_id} — ${machine.machine_name}`,
          machine.machine_id
        );
      });
      if (currentMachine) machineSelect.value = currentMachine;
    }

    renderMachineTables(allMachines);
    const table = $("manualTable");
    if (!table) return;
    const manuals = records(manualData);
    const activeTable = $("manualTable");
    const inactiveTable = $("inactiveManualTable");
    activeTable.replaceChildren();
    inactiveTable?.replaceChildren();
    if (!manuals.length) {
      emptyRow(activeTable, "No active manuals.");
      if (inactiveTable) emptyRow(inactiveTable, "No inactive manuals.");
      return;
    }

    manuals.forEach((manual) => {
      const machine = allMachines.find(
        (item) => String(item.id) === String(manual.machine)
      );
      const product = products.find(
        (item) => String(item.id) === String(manual.product)
      );
      const ownerActive = product ? product.active : machine?.is_active;
      const isActive = manual.active && ownerActive;
      const row = createManualRow(manual, machine, product, isActive, ownerActive);
      (isActive ? activeTable : inactiveTable)?.appendChild(row);
    });
    if (!activeTable.rows.length) emptyRow(activeTable, "No active manuals.");
    if (inactiveTable && !inactiveTable.rows.length) {
      emptyRow(inactiveTable, "No inactive manuals.");
    }
  }

  function createManualRow(manual, machine, product, isActive, ownerActive) {
    const row = document.createElement("tr");
    cell(
      row,
      product
        ? `${product.sku} — ${product.name}`
        : machine
          ? `${machine.machine_id} — ${machine.machine_name}`
          : "Unknown"
    );
    cell(row, manual.document_id);
    cell(row, manual.revision);
    cell(row, manual.pdf_filename);
    const processing = manual.processed
      ? "Processed"
      : manual.processing_error
        ? `Failed: ${manual.processing_error}`
        : manual.status || "Pending";
    cell(row, processing);
    cell(row, manual.chunk_count || 0);
    const actions = cell(row, "");
    actions.className = "table-actions";
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = isActive ? "danger" : "secondary";
    toggleButton.textContent = isActive ? "Deactivate" : "Recover";
    toggleButton.disabled = !isActive && !ownerActive;
    if (!isActive && !ownerActive) {
      toggleButton.title = "Recover the inactive machine or product first.";
    }
    toggleButton.addEventListener("click", () => setManualActive(manual, !manual.active));
    actions.appendChild(toggleButton);
    return row;
  }

  async function setManualActive(manual, active) {
    const action = active ? "Recover" : "Deactivate";
    const confirmed = window.confirm(
      `${action} manual ${manual.document_id} revision ${manual.revision}?`
    );
    if (!confirmed) return;

    try {
      await request(`/manuals/${manual.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      message(
        "manualLibraryMessage",
        `Manual ${manual.document_id} revision ${manual.revision} ${active ? "recovered" : "deactivated"}.`
      );
      await loadAdminManuals();
    } catch (error) {
      message("manualLibraryMessage", error.message, true);
    }
  }

  function renderMachineTables(machines) {
    const activeTable = $("machineTable");
    const inactiveTable = $("inactiveMachineTable");
    if (!activeTable || !inactiveTable) return;
    activeTable.replaceChildren();
    inactiveTable.replaceChildren();
    machines.forEach((machine) => {
      const row = document.createElement("tr");
      cell(row, machine.machine_id);
      cell(row, machine.machine_name);
      cell(row, machine.model);
      cell(row, machine.description);
      const actions = cell(row, "");
      actions.className = "table-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = machine.is_active ? "danger" : "secondary";
      button.textContent = machine.is_active ? "Deactivate" : "Recover";
      button.addEventListener("click", () => setMachineActive(machine, !machine.is_active));
      actions.appendChild(button);
      (machine.is_active ? activeTable : inactiveTable).appendChild(row);
    });
    if (!activeTable.rows.length) emptyRow(activeTable, "No active machines.");
    if (!inactiveTable.rows.length) emptyRow(inactiveTable, "No inactive machines.");
  }

  async function setMachineActive(machine, isActive) {
    const action = isActive ? "Recover" : "Deactivate";
    if (!window.confirm(`${action} ${machine.machine_id}?`)) return;
    try {
      await request(`/manuals/machines/${machine.id}/status/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive })
      });
      await loadAdminManuals();
      message(
        "manualLibraryMessage",
        `Machine ${machine.machine_id} ${isActive ? "recovered" : "deactivated"}.`
      );
    } catch (error) {
      message("manualLibraryMessage", error.message, true);
    }
  }

  function errorMessage(data) {
    if (data.detail) return data.detail;
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join(" | ") || "Request failed.";
  }

  async function request(path, options = {}) {
    const token = sessionStorage.getItem("access_token");
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      throw new Error(typeof data === "string" ? data : errorMessage(data));
    }
    return data;
  }

  async function download(path, filename) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("access_token")}`
      }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(errorMessage(data));
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showImage(url, inspection) {
    let dialog = document.getElementById("inspectionImageDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "inspection-image-dialog";
      dialog.id = "inspectionImageDialog";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => dialog.close());
      const title = document.createElement("h2");
      title.id = "imagePreviewTitle";
      const layout = document.createElement("div");
      layout.className = "inspection-image-detail-layout";
      const image = document.createElement("img");
      image.id = "imagePreviewContent";
      image.className = "inspection-image-detail-preview";
      image.alt = "Selected inspection image";
      const details = document.createElement("section");
      details.id = "inspectionImageStats";
      details.className = "inspection-image-detail-stats";
      layout.append(image, details);
      dialog.append(close, title, layout);
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
    dialog.querySelector("#imagePreviewTitle").textContent = inspection.original_filename;
    const image = dialog.querySelector("#imagePreviewContent");
    image.src = url;
    image.alt = `Inspection image: ${inspection.original_filename}`;
    renderInspectionDetails(dialog.querySelector("#inspectionImageStats"), inspection);
    dialog.showModal();
  }

  function message(id, text, isError = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = text;
    element.className = `message ${isError ? "error" : "success"}`;
  }

  function cell(row, value) {
    const td = document.createElement("td");
    td.textContent = value == null ? "" : String(value);
    row.appendChild(td);
    return td;
  }

  function emptyRow(table, text) {
    const row = table.insertRow();
    const emptyCell = row.insertCell();
    emptyCell.colSpan = table.closest("table").tHead.rows[0].cells.length;
    emptyCell.className = "table-empty";
    emptyCell.textContent = text;
  }

  function option(select, label, value) {
    select.add(new Option(label, value));
  }

  function renderInspectionDetails(container, inspection) {
    container.replaceChildren();
    const kicker = document.createElement("p");
    kicker.className = "workspace-kicker";
    kicker.textContent = "Visual inspection result";
    const prediction = inspection.ai_prediction || "Pending";
    const result = document.createElement("strong");
    result.className = `inspection-detail-result ${prediction === "DEFECTIVE" ? "is-defective" : prediction === "UNCERTAIN" ? "is-uncertain" : ""}`;
    result.textContent = `AI result: ${prediction}`;
    container.append(kicker, result);

    const confidence = Number(inspection.ai_confidence);
    if (inspection.ai_confidence != null && Number.isFinite(confidence)) {
      const confidenceLabel = document.createElement("span");
      confidenceLabel.className = "muted small";
      confidenceLabel.textContent = "AI confidence estimate";
      const confidenceValue = document.createElement("strong");
      confidenceValue.className = "inspection-detail-confidence";
      confidenceValue.textContent = `${confidence.toFixed(1)}%`;
      container.append(confidenceLabel, confidenceValue);
      appendConfidenceGauge(container, prediction, confidence);
    } else {
      const unavailable = document.createElement("p");
      unavailable.className = "muted small";
      unavailable.textContent = "AI confidence is not available for this inspection.";
      container.appendChild(unavailable);
    }

    const details = document.createElement("dl");
    [
      ["Product", `${inspection.product_sku} · ${inspection.product_name}`],
      ["Machine", inspection.machine_id
        ? `${inspection.machine_id} · ${inspection.machine_name}`
        : "Unassigned (legacy inspection)"],
      ["Image category", inspection.product_category || "Uncategorized"],
      ["Status", inspection.status],
      ["Final reviewed result", inspection.final_prediction || "Not reviewed"],
      ["Defect probability", inspection.ai_defect_probability == null ? "—" : `${inspection.ai_defect_probability}%`],
      ["Model version", inspection.model_version || "—"],
      ["Submitted by", inspection.engineer || "—"],
      ["Inspected", new Date(inspection.created_at).toLocaleString()],
      ["Reviewed by", inspection.reviewed_by || "Not reviewed"]
    ].forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });
    container.appendChild(details);

    if (inspection.ai_explanation) {
      appendInspectionNote(container, "AI analysis", inspection.ai_explanation);
    }
    if (inspection.review_comment) {
      appendInspectionNote(container, "Supervisor review", inspection.review_comment);
    }
    if (inspection.failure_reason) {
      appendInspectionNote(container, "Inspection issue", inspection.failure_reason);
    }
  }

  function appendInspectionNote(container, headingText, noteText) {
    const note = document.createElement("div");
    note.className = "inspection-detail-note";
    const heading = document.createElement("strong");
    heading.textContent = headingText;
    const text = document.createElement("p");
    text.textContent = noteText;
    note.append(heading, text);
    container.appendChild(note);
  }

  function appendConfidenceGauge(container, prediction, confidence) {
    const chart = svgNode("svg", {
      viewBox: "0 0 120 76",
      role: "img",
      "aria-label": `${prediction.toLowerCase()} prediction, ${confidence.toFixed(1)} percent model confidence estimate`
    });
    const arc = "M 16 64 A 44 44 0 0 1 104 64";
    chart.append(
      svgNode("path", {
        d: arc,
        class: "confidence-track",
        pathLength: "100"
      }),
      svgNode("path", {
        d: arc,
        class: `confidence-arc ${prediction === "DEFECTIVE" ? "is-defective" : prediction === "UNCERTAIN" ? "is-uncertain" : ""}`,
        pathLength: "100",
        "stroke-dasharray": `${Math.max(0, Math.min(100, confidence))} 100`
      }),
      svgNode("text", {
        x: 60, y: 58, class: "confidence-value", "text-anchor": "middle"
      }, `${confidence.toFixed(1)}%`)
    );
    container.appendChild(chart);
  }

  async function imageUrl(path) {
    if (!path) return "";
    if (imageCache.has(path)) return imageCache.get(path);
    const loading = (async () => {
      const response = await fetch(new URL(path, API_BASE), {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("access_token")}`
      }
    });
      if (!response.ok) return "";
      const url = URL.createObjectURL(await response.blob());
      blobs.add(url);
      return url;
    })();
    imageCache.set(path, loading);
    return loading;
  }

  function releaseImages() {
    blobs.forEach((url) => URL.revokeObjectURL(url));
    blobs.clear();
    imageCache.clear();
  }

  async function verifyRole() {
    const profile = await request("/accounts/profile/");
    if (profile.role !== role) {
      throw new Error("Access denied. Sign in with an account for this role.");
    }
    currentUserId = profile.id;
    $("userName").textContent = profile.username;
    $("accessMessage").hidden = true;
    $("dashboard").hidden = false;
  }

  async function loadProducts() {
    const products = records(await request("/inspections/products/"));
    const inactiveProducts = $("inactiveProductTable")
      ? records(await request("/inspections/products/?include_inactive=true"))
        .filter((product) => !product.active)
      : [];
    const allProducts = [
      ...products,
      ...inactiveProducts.filter(
        (inactive) => !products.some((product) => product.id === inactive.id)
      )
    ];
    if ($("totalProducts")) {
      $("totalProducts").textContent = String(
        products.filter((product) => product.active).length
      );
    }
    document.querySelectorAll("[data-product-select]").forEach((select) => {
      const current = select.value;
      select.replaceChildren();
      option(
        select,
        select.id === "historyProduct" ? "All products" : "Select a product",
        ""
      );
      const selectorProducts = select.id === "historyProduct" ? allProducts : products;
      selectorProducts.forEach((p) => {
        const category = p.category || "Uncategorized";
        option(select, `${p.sku} — ${p.name} · ${category}`, p.id);
      });
      if (current) select.value = current;
    });

    const categoryFilter = $("historyCategory");
    if (categoryFilter) {
      const currentCategory = categoryFilter.value;
      const categories = [...new Set(
        allProducts.map((product) => (product.category || "").trim()).filter(Boolean)
      )].sort((a, b) => a.localeCompare(b));
      categoryFilter.replaceChildren();
      option(categoryFilter, "All categories", "");
      categories.forEach((category) => option(categoryFilter, category, category));
      option(categoryFilter, "Uncategorized", "__uncategorized__");
      if (categories.includes(currentCategory)) {
        categoryFilter.value = currentCategory;
      } else if (currentCategory === "__uncategorized__") {
        categoryFilter.value = currentCategory;
      }
    }

    renderProductTable($("productTable"), products, false);
    if ($("inactiveProductTable")) {
      renderProductTable($("inactiveProductTable"), inactiveProducts, true);
    }
  }

  function renderProductTable(table, products, inactive) {
    if (!table) return;
    table.replaceChildren();
    if (!products.length) {
      emptyRow(
        table,
        inactive ? "No inactive products." : "No active products. Add a product above to get started."
      );
      return;
    }
    products.forEach((product) => {
      const row = document.createElement("tr");
      cell(row, product.sku);
      cell(row, product.name);
      cell(row, product.category);
      cell(row, inactive ? "Inactive" : "Active");
      const actions = cell(row, "");
      actions.className = "table-actions";
      const details = document.createElement("button");
      details.type = "button";
      details.className = "secondary";
      details.textContent = "Details";
      details.addEventListener("click", () => showProductDetails(product));
      actions.appendChild(details);
      if (inactive) {
        const recover = document.createElement("button");
        recover.type = "button";
        recover.className = "secondary";
        recover.textContent = "Recover";
        recover.addEventListener("click", () => setProductActive(product, true));
        actions.appendChild(recover);
      } else {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editProduct(product));
        actions.appendChild(edit);
        const deactivate = document.createElement("button");
        deactivate.type = "button";
        deactivate.className = "danger";
        deactivate.textContent = "Deactivate";
        deactivate.addEventListener("click", () => setProductActive(product, false));
        actions.appendChild(deactivate);
      }
      table.appendChild(row);
    });
  }

  function showProductDetails(product) {
    let dialog = document.getElementById("productDetailsDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "productDetailsDialog";
      dialog.setAttribute("aria-labelledby", "productDetailsTitle");
      document.body.appendChild(dialog);
    }

    const heading = document.createElement("h2");
    heading.id = "productDetailsTitle";
    heading.textContent = "Product details";
    const details = document.createElement("dl");
    [
      ["SKU", product.sku],
      ["Name", product.name],
      ["Category", product.category || "—"],
      ["Status", product.active ? "Active" : "Inactive"],
      ["Description", product.description || "No description provided."],
      ["Created", product.created_at ? new Date(product.created_at).toLocaleString() : "—"],
      ["Last updated", product.updated_at ? new Date(product.updated_at).toLocaleString() : "—"]
    ].forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.className = "secondary";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    dialog.replaceChildren(heading, details, close);
    dialog.showModal();
  }

  async function editProduct(product) {
    const name = window.prompt("Product name", product.name);
    if (name === null) return;
    const category = window.prompt("Category", product.category || "");
    if (category === null) return;
    const description = window.prompt("Description", product.description || "");
    if (description === null) return;
    try {
      await request(`/inspections/products/${product.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ name, category, description })
      });
      message("productMessage", "Product updated.");
      await loadProducts();
    } catch (error) {
      message("productMessage", error.message, true);
    }
  }

  async function setProductActive(product, active) {
    const action = active ? "Recover" : "Deactivate";
    if (!window.confirm(`${action} ${product.sku}?`)) return;
    try {
      await request(`/inspections/products/${product.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      message("productMessage", `Product ${active ? "recovered" : "deactivated"}.`);
      await loadProducts();
    } catch (error) {
      message("productMessage", error.message, true);
    }
  }

  async function loadUsers() {
    const table = $("userTable");
    if (!table) return;
    const [activeData, inactiveData] = await Promise.all([
      request("/accounts/users/"),
      request("/accounts/users/?include_inactive=true")
    ]);
    const users = records(activeData);
    const inactiveUsers = records(inactiveData).filter((user) => !user.is_active);
    if ($("totalUsers")) $("totalUsers").textContent = String(users.length);
    renderUserTable(table, users, false);
    renderUserTable($("inactiveUserTable"), inactiveUsers, true);
  }

  function renderUserTable(table, users, inactive) {
    if (!table) return;
    table.replaceChildren();
    if (!users.length) {
      emptyRow(table, inactive ? "No inactive user accounts." : "No active user accounts.");
      return;
    }
    users.forEach((user) => {
      const row = document.createElement("tr");
      const isCurrentUser = String(user.id) === String(currentUserId);
      cell(row, user.username);
      cell(row, user.email);
      const roleCell = cell(row, "");
      const roleSelect = document.createElement("select");
      ["ENGINEER", "SUPERVISOR", "ADMIN"].forEach((value) => {
        option(roleSelect, value, value);
      });
      roleSelect.value = user.role;
      roleSelect.disabled = isCurrentUser || inactive;
      if (isCurrentUser) {
        roleSelect.title = "You cannot change your own role from this account.";
      }
      roleCell.appendChild(roleSelect);
      cell(row, `${user.is_active ? "Active" : "Inactive"}${isCurrentUser ? " (you)" : ""}`);
      const actions = cell(row, "");
      actions.className = "table-actions";
      const saveRole = document.createElement("button");
      saveRole.type = "button";
      saveRole.className = "secondary";
      saveRole.textContent = "Save role";
      saveRole.disabled = isCurrentUser || inactive;
      if (isCurrentUser) {
        saveRole.title = "You cannot change your own role from this account.";
      }
      saveRole.addEventListener("click", async () => {
        try {
          await request(`/accounts/users/${user.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ role: roleSelect.value })
          });
          message("userMessage", "User account updated.");
          await loadUsers();
        } catch (error) {
          message("userMessage", error.message, true);
        }
      });
      const toggleActive = document.createElement("button");
      toggleActive.type = "button";
      toggleActive.className = inactive ? "secondary" : "danger";
      toggleActive.textContent = inactive ? "Recover" : "Deactivate";
      toggleActive.disabled = isCurrentUser;
      if (isCurrentUser) {
        toggleActive.title = "You cannot change your own account status.";
      }
      toggleActive.addEventListener("click", async () => {
        try {
          await request(`/accounts/users/${user.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: inactive })
          });
          message(
            "userMessage",
            `User account ${inactive ? "recovered" : "deactivated"}.`
          );
          await loadUsers();
        } catch (error) {
          message("userMessage", error.message, true);
        }
      });
      if (!inactive) actions.append(saveRole);
      actions.append(toggleActive);
      table.appendChild(row);
    });
  }

  function filterQuery() {
    const query = new URLSearchParams();
    const mappings = [
      ["historyStatus", "status"],
      ["historyPrediction", "prediction"],
      ["historyProduct", "product"],
      ["historyMachine", "machine"],
      ["historyCategory", "category"],
      ["historyFrom", "date_from"],
      ["historyTo", "date_to"]
    ];
    mappings.forEach(([id, param]) => {
      const value = $(id)?.value;
      if (value) query.set(param, value);
    });
    return query.toString();
  }

  function addImage(row, inspection) {
    const td = document.createElement("td");
    if (!inspection.image_url) {
      td.textContent = "No valid image saved";
      row.appendChild(td);
      return;
    }
    const image = document.createElement("img");
    image.className = "thumb";
    image.alt = `Uploaded image: ${inspection.original_filename}`;
    imageUrl(inspection.image_url).then((url) => {
      if (url) {
        image.src = url;
        image.addEventListener("click", () => {
          showImage(url, inspection);
        });
      } else {
        image.alt = "Inspection image could not be loaded.";
        message("inspectionMessage", "An inspection image could not be loaded.", true);
      }
    }).catch((error) => {
      image.alt = "Inspection image could not be loaded.";
      message("inspectionMessage", error.message, true);
    });
    td.appendChild(image);
    row.appendChild(td);
  }

  function renderVisualInspectionGallery(inspections) {
    const gallery = $("visualInspectionGallery");
    if (!gallery) return;
    gallery.replaceChildren();
    const latest = inspections.slice(0, 8);
    if (!latest.length) {
      const empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "No inspection images match this view yet.";
      gallery.appendChild(empty);
      return;
    }

    latest.forEach((inspection) => {
      const card = document.createElement("article");
      card.className = "visual-inspection-card";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "visual-image-button";
      preview.setAttribute("aria-label", `Open ${inspection.original_filename}`);
      if (inspection.image_url) {
        const image = document.createElement("img");
        image.className = "visual-inspection-image";
        image.alt = `Inspection image: ${inspection.original_filename}`;
        image.loading = "lazy";
        imageUrl(inspection.image_url).then((url) => {
          if (!url) {
            image.alt = "Inspection image could not be loaded.";
            preview.disabled = true;
            return;
          }
          image.src = url;
          preview.addEventListener("click", () => {
            showImage(url, inspection);
          });
        }).catch((error) => {
          image.alt = "Inspection image could not be loaded.";
          preview.disabled = true;
          message("inspectionMessage", error.message, true);
        });
        preview.appendChild(image);
      } else {
        preview.disabled = true;
        preview.textContent = "No valid image saved";
      }

      const details = document.createElement("div");
      details.className = "visual-inspection-details";
      const category = document.createElement("span");
      category.className = "badge";
      category.textContent = inspection.product_category || "Uncategorized";
      const result = document.createElement("strong");
      result.textContent = inspection.final_prediction || inspection.ai_prediction || inspection.status;
      const product = document.createElement("span");
      product.className = "muted small";
      product.textContent = `${inspection.product_sku} · ${inspection.product_name}`;
      const date = document.createElement("time");
      date.className = "muted small";
      date.dateTime = inspection.created_at;
      date.textContent = new Date(inspection.created_at).toLocaleString();
      details.append(category, result, product, date);

      if (inspection.reviewed_prediction) {
        const review = document.createElement("div");
        review.className = "inspection-supervisor-review";
        const reviewTitle = document.createElement("strong");
        reviewTitle.textContent = `Supervisor review: ${inspection.reviewed_prediction}`;
        const reviewer = document.createElement("span");
        reviewer.className = "muted small";
        reviewer.textContent = `Reviewed by ${inspection.reviewed_by || "supervisor"}${inspection.reviewed_at ? ` · ${new Date(inspection.reviewed_at).toLocaleString()}` : ""}`;
        review.append(reviewTitle, reviewer);
        if (inspection.review_comment) {
          const comment = document.createElement("p");
          comment.textContent = inspection.review_comment;
          review.appendChild(comment);
        }
        details.appendChild(review);
      }

      const scores = document.createElement("div");
      scores.className = "inspection-score-grid";
      appendInspectionScore(
        scores,
        "AI confidence",
        inspection.ai_confidence,
        "confidence"
      );
      appendInspectionScore(
        scores,
        "Defect probability",
        inspection.ai_defect_probability,
        "defect"
      );
      details.appendChild(scores);

      card.append(preview, details);
      gallery.appendChild(card);
    });
  }

  function appendInspectionScore(container, label, rawValue, type) {
    const score = rawValue == null ? Number.NaN : Number(rawValue);
    const valid = Number.isFinite(score) && score >= 0 && score <= 100;
    const item = document.createElement("div");
    item.className = `inspection-score inspection-score-${type}`;

    const heading = document.createElement("span");
    heading.className = "muted small";
    heading.textContent = label;
    const value = document.createElement("strong");
    value.textContent = valid ? `${score.toFixed(1)}%` : "Pending";
    item.append(heading, value);

    if (valid) {
      const track = document.createElement("div");
      track.className = "inspection-score-track";
      track.setAttribute("role", "meter");
      track.setAttribute("aria-label", label);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(score));
      const fill = document.createElement("span");
      fill.style.width = `${score}%`;
      track.appendChild(fill);
      item.appendChild(track);
    }

    container.appendChild(item);
  }

  async function showInspectionAudit(inspection) {
    const dialog = $("inspectionAuditDialog");
    const eventsContainer = $("inspectionAuditEvents");
    const context = $("inspectionAuditContext");
    if (!dialog || !eventsContainer || !context) return;

    context.textContent = `#${inspection.id} · ${inspection.product_sku} — ${inspection.product_name} · ${inspection.original_filename}`;
    eventsContainer.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "muted small";
    loading.textContent = "Loading audit events…";
    eventsContainer.appendChild(loading);
    dialog.showModal();

    try {
      const data = await request(`/inspections/audit/?inspection_id=${encodeURIComponent(inspection.id)}`);
      const events = records(data);
      eventsContainer.replaceChildren();
      if (!events.length) {
        const empty = document.createElement("p");
        empty.className = "muted small";
        empty.textContent = "No audit events are recorded for this inspection.";
        eventsContainer.appendChild(empty);
        return;
      }

      events.forEach((event) => {
        const entry = document.createElement("article");
        entry.className = "audit-event";
        const heading = document.createElement("strong");
        heading.textContent = String(event.event_type || "Event").replaceAll("_", " ");
        const time = document.createElement("time");
        time.className = "muted small";
        time.dateTime = event.created_at;
        time.textContent = new Date(event.created_at).toLocaleString();
        const actor = document.createElement("p");
        actor.className = "muted small";
        actor.textContent = `Actor: ${event.actor || "System"}`;
        const details = document.createElement("pre");
        details.textContent = JSON.stringify(event.details || {}, null, 2);
        entry.append(heading, time, actor, details);
        eventsContainer.appendChild(entry);
      });
    } catch (error) {
      eventsContainer.replaceChildren();
      const failure = document.createElement("p");
      failure.className = "message error";
      failure.textContent = `Could not load audit trail: ${error.message}`;
      eventsContainer.appendChild(failure);
    }
  }

  async function deleteInspection(inspection, button) {
    const confirmed = window.confirm(
      `Permanently delete inspection #${inspection.id} (${inspection.original_filename})?\n\nThis also deletes its image, review history, and audit events. This action cannot be undone.`
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      await request(`/inspections/${inspection.id}/`, { method: "DELETE" });
      message("inspectionMessage", `Inspection #${inspection.id} and its associated records were deleted.`);
      await refresh();
    } catch (error) {
      message("inspectionMessage", `Could not delete inspection #${inspection.id}: ${error.message}`, true);
      button.disabled = false;
    }
  }

  async function loadInspections() {
    releaseImages();
    const query = filterQuery();
    const data = await request(`/inspections/${query ? `?${query}` : ""}`);
    const inspections = records(data);
    window.clearTimeout(inspectionPollingTimer);
    const hasPendingInspections = inspections.some(
      (item) => item.status === "QUEUED" || item.status === "PROCESSING"
    );
    const refreshDelay = hasPendingInspections ? 2500 : 15000;
    inspectionPollingTimer = window.setTimeout(() => {
      if (!document.hidden) refresh();
    }, refreshDelay);
    renderVisualInspectionGallery(inspections);
    const table = $("inspectionTable") || $("historyTable");
    if (!table) return;
    table.replaceChildren();
    if (inspections.length === 0) {
      emptyRow(
        table,
        role === "ENGINEER"
          ? "No inspections yet. Your submitted inspections will appear here."
          : "No inspection records match this view."
      );
      const count = $("inspectionCount");
      if (count) count.textContent = "0 inspections";
      return;
    }

    inspections.forEach((item) => {
      const row = document.createElement("tr");
      cell(row, new Date(item.created_at).toLocaleString());
      if (role !== "ENGINEER") cell(row, item.engineer);
      cell(row, `${item.product_sku} — ${item.product_name}`);
      cell(
        row,
        item.machine_id
          ? `${item.machine_id} — ${item.machine_name}`
          : "Unassigned"
      );
      cell(row, item.product_category || "Uncategorized");
      addImage(row, item);
      cell(row, item.status);
      cell(row, item.ai_prediction || item.failure_reason || "Pending");
      cell(row, item.ai_confidence == null ? "—" : `${item.ai_confidence}%`);
      cell(
        row,
        item.ai_defect_probability == null
          ? "—"
          : `${item.ai_defect_probability}%`
      );
      const finalResult = cell(row, item.final_prediction || "—");
      if (item.reviewed_prediction) {
        const review = document.createElement("div");
        review.className = "table-review-summary";
        review.textContent = `Supervisor review · ${item.reviewed_by || "Supervisor"}`;
        if (item.review_comment) {
          const comment = document.createElement("span");
          comment.textContent = item.review_comment;
          review.appendChild(comment);
        }
        finalResult.appendChild(review);
      }

      if (role === "SUPERVISOR") {
        const review = cell(row, "");
        if (item.status === "COMPLETED" || item.status === "REVIEWED") {
          const prediction = document.createElement("select");
          ["NORMAL", "DEFECTIVE", "UNCERTAIN"].forEach((value) => {
            option(prediction, value, value);
          });
          prediction.value = item.final_prediction || item.ai_prediction || "UNCERTAIN";
          const comment = document.createElement("input");
          comment.placeholder = "Review comment";
          comment.value = item.review_comment || "";
          const save = document.createElement("button");
          save.type = "button";
          save.textContent = item.status === "REVIEWED" ? "Update review" : "Confirm / correct";
          save.addEventListener("click", async () => {
            save.disabled = true;
            try {
              await request(`/inspections/${item.id}/review/`, {
                method: "PATCH",
                body: JSON.stringify({
                  prediction: prediction.value,
                  comment: comment.value
                })
              });
              message("inspectionMessage", "Review saved.");
              await refresh();
            } catch (error) {
              message("inspectionMessage", error.message, true);
            } finally {
              save.disabled = false;
            }
          });
          review.append(prediction, comment, save);
        }
      }
      if (role === "ADMIN") {
        const auditCell = cell(row, "");
        auditCell.className = "table-actions";
        const auditButton = document.createElement("button");
        auditButton.type = "button";
        auditButton.className = "secondary";
        auditButton.textContent = "View audit";
        auditButton.addEventListener("click", () => showInspectionAudit(item));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger";
        deleteButton.textContent = "Delete log";
        deleteButton.addEventListener("click", () => deleteInspection(item, deleteButton));
        auditCell.append(auditButton, deleteButton);
      }
      table.appendChild(row);
    });
    const count = $("inspectionCount");
    if (count) count.textContent = `${inspections.length} inspection(s)`;
  }

  function svgNode(name, attributes = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    if (text) node.textContent = text;
    return node;
  }

  function renderOutcomeChart(container, entries) {
    if (!container) return;
    container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "muted small chart-empty";
      empty.textContent = "No AI predictions in this view yet.";
      container.appendChild(empty);
      return;
    }

    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    if (!total) {
      renderOutcomeChart(container, []);
      return;
    }

    const colors = {
      Normal: "var(--green)",
      Defective: "var(--red)",
      Uncertain: "#9da9ff"
    };
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const size = 180;
    const svg = svgNode("svg", {
      viewBox: `0 0 ${size} ${size}`,
      role: "img",
      "aria-label": `Inspection outcomes: ${entries.map((entry) => `${entry.label} ${entry.value}`).join(", ")}`,
      class: "outcome-donut"
    });
    const arcs = svgNode("g", {
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    });
    entries.forEach((entry) => {
      const segment = (entry.value / total) * circumference;
      arcs.appendChild(svgNode("circle", {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: "none",
        stroke: colors[entry.label],
        "stroke-width": 20,
        "stroke-dasharray": `${segment} ${circumference - segment}`,
        "stroke-dashoffset": -offset,
        class: "donut-segment"
      }));
      offset += segment;
    });
    svg.appendChild(arcs);
    svg.append(
      svgNode("text", {
        x: size / 2, y: 84, class: "donut-total", "text-anchor": "middle"
      }, String(total)),
      svgNode("text", {
        x: size / 2, y: 103, class: "donut-caption", "text-anchor": "middle"
      }, "INSPECTIONS")
    );

    const layout = document.createElement("div");
    layout.className = "outcome-chart-layout";
    layout.appendChild(svg);
    const legend = document.createElement("ul");
    legend.className = "outcome-legend";
    entries.forEach((entry) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "outcome-legend-label";
      const marker = document.createElement("span");
      marker.className = `outcome-legend-marker marker-${entry.label.toLowerCase()}`;
      marker.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = entry.label;
      label.append(marker, text);
      const value = document.createElement("strong");
      value.textContent = `${entry.value} · ${Math.round((entry.value / total) * 100)}%`;
      item.append(label, value);
      legend.appendChild(item);
    });
    layout.appendChild(legend);

    container.appendChild(layout);
  }

  function renderAnalyticsCharts(stats) {
    const outcomeEntries = [
      { label: "Normal", value: stats.normal || 0 },
      { label: "Defective", value: stats.defective || 0 },
      { label: "Uncertain", value: stats.uncertain || 0 }
    ];
    renderOutcomeChart($("outcomeChart"), outcomeEntries.filter((entry) => entry.value > 0));
  }

  async function loadStatistics() {
    const query = filterQuery();
    const stats = await request(`/inspections/statistics/${query ? `?${query}` : ""}`);
    renderAnalyticsCharts(stats);
    const names = {
      total: "totalInspections",
      normal: "normalCount",
      defective: "defectiveCount",
      uncertain: "uncertainCount",
      pending_review: "pendingReviewCount",
      reviewed: "reviewedCount",
      failed: "failedCount",
      defect_rate: "defectRate",
      total_products: "totalProducts"
    };
    Object.entries(names).forEach(([key, id]) => {
      if ($(id)) {
        $(id).textContent = key === "defect_rate"
          ? `${stats[key] ?? 0}%`
          : (stats[key] ?? 0);
      }
    });
    const categoryOverview = $("categoryOverview");
    if (categoryOverview) {
      categoryOverview.replaceChildren();
      const categories = stats.by_category || [];
      const total = categories.reduce((sum, item) => sum + item.total, 0);
      $("categoryImageTotal").textContent = String(total);

      if (!categories.length) {
        const empty = document.createElement("p");
        empty.className = "muted small";
        empty.textContent = "No category data yet. Complete an inspection to see the breakdown.";
        categoryOverview.appendChild(empty);
      } else {
        categories.forEach((item) => {
          const label = item["product__category"] || "Uncategorized";
          const row = document.createElement("article");
          row.className = "category-row";
          const selectCategory = document.createElement("button");
          selectCategory.type = "button";
          selectCategory.className = "category-select";
          selectCategory.setAttribute("aria-label", `Filter images by ${label}`);
          selectCategory.addEventListener("click", () => {
            const categoryFilter = $("historyCategory");
            if (!categoryFilter) return;
            categoryFilter.value = item["product__category"] || "__uncategorized__";
            refresh();
          });

          const heading = document.createElement("div");
          heading.className = "category-row-heading";
          const title = document.createElement("strong");
          title.textContent = label;
          const count = document.createElement("span");
          count.textContent = `${item.total} image${item.total === 1 ? "" : "s"}`;
          heading.append(title, count);

          const bar = document.createElement("div");
          bar.className = "category-bar";
          bar.setAttribute("role", "img");
          const percentage = total ? (item.total / total) * 100 : 0;
          bar.setAttribute("aria-label", `${label}: ${Math.round(percentage)}% of inspections`);
          const fill = document.createElement("span");
          fill.style.width = `${percentage}%`;
          bar.appendChild(fill);

          const meta = document.createElement("div");
          meta.className = "category-row-meta";
          const share = document.createElement("span");
          share.textContent = `${Math.round(percentage)}% of images`;
          const defective = document.createElement("span");
          defective.textContent = `${item.defective} AI flagged`;
          meta.append(share, defective);

          selectCategory.append(heading, bar, meta);
          row.appendChild(selectCategory);
          categoryOverview.appendChild(row);
        });
      }
    }
    const engineers = $("engineerStats");
    if (engineers) {
      engineers.replaceChildren();
      const engineerEntries = stats.by_engineer || [];
      if (!engineerEntries.length) {
        const empty = document.createElement("p");
        empty.className = "small";
        empty.textContent = "No engineer inspection activity in this view yet.";
        engineers.appendChild(empty);
      }
      engineerEntries.forEach((entry) => {
        const row = document.createElement("p");
        row.textContent = `${entry.engineer__username}: ${entry.total} inspections, ${entry.defective} AI-flagged defective`;
        engineers.appendChild(row);
      });
    }

    const machineTable = $("machineInspectionStats");
    if (machineTable) {
      machineTable.replaceChildren();
      const machines = stats.by_machine || [];
      if (!machines.length) {
        emptyRow(machineTable, "No machine inspection activity in this view yet.");
      } else {
        machines.forEach((machine) => {
          const row = machineTable.insertRow();
          const label = machine.machine__machine_id
            ? `${machine.machine__machine_id} — ${machine.machine__machine_name}`
            : "Unassigned";
          cell(row, label);
          cell(row, machine.total);
          cell(row, machine.normal);
          cell(row, machine.defective);
          cell(row, machine.pending_review);
          cell(row, machine.reviewed);
        });
      }
    }

  }

  function clearUploadPreviews() {
    uploadPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    uploadPreviewUrls.clear();
    $("imagePreview")?.replaceChildren();
  }

  function uploadFileError(files) {
    if (!files.length) return "";
    if (files.length > 10) return "Choose no more than 10 images at a time.";
    return "";
  }

  function renderUploadPreviews(files) {
    const preview = $("imagePreview");
    if (!preview) return;
    clearUploadPreviews();
    const error = uploadFileError(files);
    if (error) {
      $("inspectionImages").value = "";
      message("uploadMessage", error, true);
      return;
    }

    files.forEach((file) => {
      const card = document.createElement("article");
      card.className = "upload-preview-card";
      const image = document.createElement("img");
      image.alt = `Preview of ${file.name}`;
      image.src = URL.createObjectURL(file);
      uploadPreviewUrls.add(image.src);
      const filename = document.createElement("span");
      filename.className = "small";
      filename.textContent = file.name;
      card.append(image, filename);
      preview.appendChild(card);
    });
    if (files.length) {
      message(
        "uploadMessage",
        `${files.length} image${files.length === 1 ? "" : "s"} ready to inspect.`
      );
    }
  }

  function configureUploadControls() {
    const input = $("inspectionImages");
    const dropzone = $("imageDropzone");
    if (!input || !dropzone) return;

    $("chooseImages")?.addEventListener("click", (event) => {
      event.stopPropagation();
      input.click();
    });
    dropzone.addEventListener("click", (event) => {
      if (!event.target.closest("button")) input.click();
    });
    dropzone.addEventListener("keydown", (event) => {
      if (event.target === dropzone && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => renderUploadPreviews(Array.from(input.files)));
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    });
    dropzone.addEventListener("dragleave", (event) => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging");
    });
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
      const files = Array.from(event.dataTransfer.files);
      const error = uploadFileError(files);
      if (error) {
        message("uploadMessage", error, true);
        return;
      }
      input.files = event.dataTransfer.files;
      renderUploadPreviews(files);
    });
    $("closeInspectionAudit")?.addEventListener("click", () => $("inspectionAuditDialog").close());
  }

  async function refresh() {
    try {
      await Promise.all([
        loadInspections(),
        loadStatistics(),
        ...(role === "ADMIN"
          ? [loadProducts(), loadMachines(), loadUsers(), loadAdminManuals()]
          : [])
      ]);
    } catch (error) {
      message("inspectionMessage", error.message, true);
    }
  }

  async function startUpload(event) {
    event.preventDefault();
    const files = Array.from($("inspectionImages").files);
    if (!files.length) {
      message("uploadMessage", "Choose at least one product image.", true);
      return;
    }
    const validationError = uploadFileError(files);
    if (validationError) {
      message("uploadMessage", validationError, true);
      return;
    }
    if (!$("inspectionProduct").value) {
      message("uploadMessage", "Select a product before submitting images.", true);
      return;
    }
    const form = new FormData();
    form.append("product", $("inspectionProduct").value);
    files.forEach((file) => form.append("images", file));
    const button = $("uploadButton");
    button.disabled = true;
    message("uploadMessage", "Uploading images and queuing background inspection...");
    try {
      const results = await request("/inspections/", {
        method: "POST",
        body: form
      });
      const queued = results.filter(
        (item) => item.status === "QUEUED" || item.status === "PROCESSING"
      ).length;
      const failed = results.filter((item) => item.status === "FAILED").length;
      const uploadSummary = queued
        ? `${results.length} image(s) recorded: ${queued} queued for inference. Scores appear in Latest uploads and inspection history when processing finishes.`
        : `${results.length} image(s) recorded.`;
      message(
        "uploadMessage",
        `${uploadSummary}${failed ? ` ${failed} failed (see history for details).` : ""}`,
        failed > 0
      );
      $("uploadForm").reset();
      clearUploadPreviews();
      await refresh();
    } catch (error) {
      message("uploadMessage", error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function uploadManual(event) {
    event.preventDefault();
    const form = $("manualForm");
    const button = $("manualUploadButton");
    const file = $("pdfFile")?.files[0];
    const ownerType = $("manualOwnerType").value;
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      message("manualMessage", "Choose a PDF manual to upload.", true);
      return;
    }
    const ownerId = ownerType === "product"
      ? $("manualProduct").value
      : $("manualMachine").value;
    if (!ownerId) {
      message(
        "manualMessage",
        ownerType === "product"
          ? "Select the product this manual belongs to."
          : "Select the machine this manual belongs to.",
        true
      );
      return;
    }

    const body = new FormData();
    body.append(
      ownerType === "product" ? "product_id" : "machine_id",
      ownerId
    );
    body.append("document_id", $("documentId").value.trim());
    body.append("revision", $("revision").value.trim());
    body.append("pdf_file", file);

    button.disabled = true;
    message("manualMessage", "Uploading and processing the manual...");
    try {
      const result = await request("/manuals/upload/", {
        method: "POST",
        body
      });
      const manual = result.manual || {};
      const processingFailed =
        Boolean(manual.processing_error) || manual.processed === false;
      const ownerLabel = ownerType === "product"
        ? "Product manual uploaded"
        : "Machine manual uploaded";
      if (processingFailed) {
        message(
          "manualMessage",
          result.message ||
            `Manual uploaded, but processing failed${manual.processing_error ? `: ${manual.processing_error}` : "."}`,
          true
        );
      } else {
        message(
          "manualMessage",
          ownerType === "product"
            ? `${ownerLabel}${manual.processed ? " and processed." : "."}`
            : result.message || (manual.processed ? "Manual uploaded and processed." : "Manual uploaded."),
          false
        );
      }
      form.reset();
      $("manualOwnerType").dispatchEvent(new Event("change"));
      await loadAdminManuals();
    } catch (error) {
      message("manualMessage", error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function start() {
    try {
      await verifyRole();
      if (role !== "ADMIN") await Promise.all([loadProducts(), loadMachines()]);
      await refresh();
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refresh();
      });
    } catch (error) {
      $("accessMessage").textContent = error.message;
      $("accessMessage").className = "error";
    }

    $("logoutBtn").addEventListener("click", () => {
      ManufacturingAPI.logout();
      window.location.href = "login.html";
    });
    $("refreshBtn")?.addEventListener("click", refresh);
    $("filterBtn")?.addEventListener("click", refresh);
    $("downloadReport")?.addEventListener("click", async () => {
      try {
        await download(`/inspections/reports.csv?${filterQuery()}`, "inspection-report.csv");
      } catch (error) {
        message("inspectionMessage", error.message, true);
      }
    });
    $("uploadForm")?.addEventListener("submit", startUpload);
    configureUploadControls();
    $("manualOwnerType")?.addEventListener("change", () => {
      const isProductManual = $("manualOwnerType").value === "product";
      $("manualMachineField").hidden = isProductManual;
      $("manualMachine").required = !isProductManual;
      $("manualProductField").hidden = !isProductManual;
      $("manualProduct").required = isProductManual;
    });
    $("manualForm")?.addEventListener("submit", uploadManual);
    $("inspectionMachineForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("inspectionMachineButton");
      button.disabled = true;
      try {
        const machine = await request("/manuals/machines/create/", {
          method: "POST",
          body: JSON.stringify({
            machine_id: $("inspectionMachineId").value.trim(),
            machine_name: $("inspectionMachineName").value.trim(),
            model: $("inspectionMachineModel").value.trim(),
            description: $("inspectionMachineDescription").value.trim()
          })
        });
        await loadAdminManuals();
        $("manualOwnerType").value = "machine";
        $("manualOwnerType").dispatchEvent(new Event("change"));
        $("manualMachine").value = machine.machine_id;
        $("inspectionMachineForm").reset();
        message(
          "inspectionMachineMessage",
          "Machine added. It is selected above for manual upload."
        );
      } catch (error) {
        message("inspectionMachineMessage", error.message, true);
      } finally {
        button.disabled = false;
      }
    });
    $("refreshManualsBtn")?.addEventListener("click", async () => {
      try {
        await loadAdminManuals();
        message("manualLibraryMessage", "Manual library refreshed.");
      } catch (error) {
        message("manualLibraryMessage", error.message, true);
      }
    });
    $("productForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter || $("productForm").querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await request("/inspections/products/", {
          method: "POST",
          body: JSON.stringify({
            sku: $("productSku").value.trim(),
            name: $("productName").value.trim(),
            category: $("productCategory").value.trim(),
            description: $("productDescription").value.trim()
          })
        });
        $("productForm").reset();
        message("productMessage", "Product added.");
        await loadProducts();
        message("productMessage", "Product added to the catalog and available for inspections.");
      } catch (error) {
        message("productMessage", error.message, true);
      } finally {
        if (button) button.disabled = false;
      }
    });
    $("userForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await request("/accounts/users/create/", {
          method: "POST",
          body: JSON.stringify({
            username: $("newUsername").value.trim(),
            email: $("newEmail").value.trim(),
            password: $("newPassword").value,
            role: $("newRole").value,
            is_active: true
          })
        });
        $("userForm").reset();
        message("userMessage", "User account created.");
        await loadUsers();
      } catch (error) {
        message("userMessage", error.message, true);
      }
    });
  }

  start();
});
