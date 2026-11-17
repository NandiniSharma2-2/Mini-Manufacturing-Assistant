"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const accessMessage = $("accessMessage");
  const dashboard = $("dashboard");
  const machineSelect = $("machine");
  const questionInput = $("question");
  const askButton = $("askButton");
  const askStatus = $("askStatus");
  let isSubmitting = false;
  const savedAnswerKey = "assistant_last_answer";

  function updateAskButton() {
    askButton.disabled = isSubmitting || !machineSelect.value || !questionInput.value.trim();
  }

  function setStatus(element, text, isError = false) {
    element.textContent = text;
    element.className = `message ${isError ? "error" : "muted"}`;
  }

  function showAccessError(error) {
    accessMessage.replaceChildren();
    accessMessage.className = "access-error";

    const message = document.createElement("p");
    message.textContent = error;
    const loginLink = document.createElement("a");
    loginLink.href = "login.html";
    loginLink.textContent = "Go to login";
    accessMessage.append(message, loginLink);
  }

  async function loadMachines() {
    const response = await ManufacturingAPI.getMachines();
    const machines = Array.isArray(response) ? response : response.results;

    if (!Array.isArray(machines)) {
      throw new Error("The machine list could not be read. Please refresh and try again.");
    }

    machineSelect.replaceChildren();
    machineSelect.add(new Option("Select a machine", ""));

    let availableMachineCount = 0;
    machines.forEach((machine) => {
      const hasManuals = machine.has_available_manuals !== false;
      if (hasManuals) availableMachineCount += 1;
      const option = new Option(
        `${machine.machine_name} (${machine.machine_id})${hasManuals ? "" : " — manual unavailable"}`,
        machine.machine_id
      );
      option.disabled = !hasManuals;
      machineSelect.add(option);
    });

    if (machines.length === 0) {
      machineSelect.replaceChildren(new Option("No machines are available", ""));
      setStatus(askStatus, "No machines are available yet. Contact an administrator.", true);
      return;
    }

    machineSelect.disabled = false;
    questionInput.disabled = availableMachineCount === 0;
    if (availableMachineCount === 0) {
      setStatus(
        askStatus,
        "No machines have a readable manual yet. Ask an administrator to upload and process a manual.",
        true
      );
      return;
    }

    machineSelect.options[0].textContent = "Select a machine with an available manual";
    updateAskButton();
  }

  function renderSources(sources) {
    const sourcesSection = $("sourcesSection");
    const sourcesContainer = $("sources");
    sourcesContainer.replaceChildren();

    if (!Array.isArray(sources) || sources.length === 0) {
      sourcesSection.hidden = true;
      return;
    }

    sources.forEach((source) => {
      const card = document.createElement("article");
      card.className = "source-card";

      const title = document.createElement("strong");
      const documentId = source.document_id || source.pdf_filename || "Machine manual";
      const revision = source.revision ? ` · Revision ${source.revision}` : "";
      const pageNumber = source.page_number ?? source.page;
      const page = pageNumber ? ` · Page ${pageNumber}` : "";
      title.textContent = `${documentId}${revision}${page}`;
      card.appendChild(title);

      const passageText = source.passage_text ?? source.text;
      if (passageText) {
        const passage = document.createElement("p");
        passage.textContent = passageText;
        card.appendChild(passage);
      }

      sourcesContainer.appendChild(card);
    });

    sourcesSection.hidden = false;
  }

  function showAnswer(answer, machineLabel, sources) {
    $("answer").textContent = answer;
    $("answerMachine").textContent = machineLabel;
    renderSources(sources);
    $("resultPanel").hidden = false;
  }

  function restoreLastAnswer() {
    const savedAnswer = sessionStorage.getItem(savedAnswerKey);
    if (!savedAnswer) return;

    try {
      const result = JSON.parse(savedAnswer);
      if (
        typeof result.answer !== "string" ||
        typeof result.machineLabel !== "string" ||
        !Number.isFinite(result.savedAt) ||
        Date.now() - result.savedAt > 30 * 60 * 1000
      ) {
        sessionStorage.removeItem(savedAnswerKey);
        return;
      }

      if (typeof result.machineId === "string") {
        machineSelect.value = result.machineId;
      }
      questionInput.value = result.question || "";
      $("characterCount").textContent = `${questionInput.value.length} / 1000`;
      showAnswer(result.answer, result.machineLabel, result.sources || []);
      setStatus(
        askStatus,
        `Your recent answer was restored. ${result.retrievalCount} manual passage(s) were retrieved.`
      );
      updateAskButton();
    } catch (error) {
      console.error("Could not restore the previous assistant answer.", error);
      sessionStorage.removeItem(savedAnswerKey);
    }
  }

  async function submitQuestion(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const machineId = machineSelect.value;
    const question = questionInput.value.trim();

    if (!machineId || !question) {
      setStatus(askStatus, "Select a machine and enter your question.", true);
      return;
    }

    askButton.disabled = true;
    isSubmitting = true;
    setStatus(askStatus, "Searching this machine’s manuals and preparing an answer...");

    try {
      const result = await ManufacturingAPI.askQuestion(machineId, question);
      const answer = result.answer || "The assistant returned no answer.";
      const machineLabel = machineSelect.selectedOptions[0].textContent;
      showAnswer(answer, machineLabel, result.sources);

      try {
        sessionStorage.setItem(savedAnswerKey, JSON.stringify({
          answer,
          machineId,
          machineLabel,
          question,
          sources: (result.sources || []).map((source) => ({
            document_id: source.document_id,
            pdf_filename: source.pdf_filename,
            revision: source.revision,
            page: source.page,
          })),
          retrievalCount: result.retrieval_count || 0,
          savedAt: Date.now(),
        }));
      } catch (storageError) {
        console.error("Could not save the assistant answer for page recovery.", storageError);
      }

      if (result.status === "INSUFFICIENT_EVIDENCE") {
        setStatus(askStatus, "The manuals did not provide enough evidence for a confident answer.", true);
      } else {
        setStatus(askStatus, `Answer ready. ${result.retrieval_count || 0} manual passage(s) retrieved.`);
      }
    } catch (error) {
      if (error.status === 401) {
        ManufacturingAPI.logout();
        sessionStorage.removeItem(savedAnswerKey);
        dashboard.hidden = true;
        accessMessage.hidden = false;
        showAccessError("Your session expired. Sign in again to ask a machine-specific question.");
        return;
      }
      setStatus(askStatus, `Unable to answer this question: ${error.message}`, true);
    } finally {
      isSubmitting = false;
      updateAskButton();
    }
  }

  async function start() {
    $("logoutBtn").addEventListener("click", () => {
      ManufacturingAPI.logout();
      sessionStorage.removeItem(savedAnswerKey);
      window.location.href = "login.html";
    });

    questionInput.addEventListener("input", () => {
      $("characterCount").textContent = `${questionInput.value.length} / 1000`;
      updateAskButton();
    });
    machineSelect.addEventListener("change", updateAskButton);
    askButton.addEventListener("click", submitQuestion);

    if (!sessionStorage.getItem("access_token")) {
      showAccessError("Sign in with an engineer account to ask machine-specific questions.");
      return;
    }

    try {
      const profile = await ManufacturingAPI.request("/accounts/profile/");
      if (String(profile.role).toUpperCase() !== "ENGINEER") {
        ManufacturingAPI.logout();
        throw new Error("This workspace is available to engineer accounts only.");
      }

      $("userName").textContent = profile.username;
      await loadMachines();
      restoreLastAnswer();
      accessMessage.hidden = true;
      dashboard.hidden = false;
    } catch (error) {
      showAccessError(error.message);
    }
  }

  start();
});
