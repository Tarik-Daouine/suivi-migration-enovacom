/* =====================================================================
   editor.js — Éditeur local du data.json (usage interne, non publié)
   Charge un data.json, permet d'ajuster statuts / % / commentaires via
   menus déroulants et curseurs, puis régénère le JSON complet.
   ===================================================================== */

(function () {
  "use strict";

  var STATUS_SETS = {
    workflow: ["a_faire", "en_cours", "termine", "bloque"],
    solutions: ["a_faire", "en_cours", "termine", "bloque"],
    tables: ["a_faire", "en_cours", "migre", "ecart"],
    automations: ["a_faire", "en_cours", "execute", "bloque"],
    checks: ["a_faire", "en_cours", "ok", "ko"]
  };
  var STATUS_LABEL = {
    a_faire: "À faire", en_cours: "En cours", termine: "Terminé", bloque: "Bloqué",
    migre: "Migré", ecart: "Écart", execute: "Exécuté", ok: "OK", ko: "KO"
  };

  var data = null;
  var editPhase = 1; // phase couramment éditée (1 = ≥2020, 2 = pré-2020)
  function inPhase(x) { return (x && (x.phase || 1)) === editPhase; }

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { $("edStatus").textContent = msg; }

  function selectHTML(set, current, cls) {
    return '<select class="ed-select ' + (cls || "") + '">' +
      set.map(function (s) {
        return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + (STATUS_LABEL[s] || s) + "</option>";
      }).join("") + "</select>";
  }

  /* ---------- Repère visuel par statut / avancement ---------- */
  // Vert = terminé/migré/exécuté/ok ou 100%. Bleu = en cours et < 100%.
  // Rouge = bloqué/ko (priorité absolue). Sinon (à faire, écart) : inchangé.
  function cardStateClass(status, progress) {
    if (status === "bloque" || status === "ko") return "s-red";
    if (status === "ecart") return "s-orange";
    var done = status === "termine" || status === "migre" || status === "execute" || status === "ok";
    if (done || progress === 100) return "s-green";
    if (status === "en_cours") return "s-blue";
    return "";
  }
  function paintCard(card, status, progress) {
    card.classList.remove("s-green", "s-blue", "s-red", "s-orange");
    var c = cardStateClass(status, progress);
    if (c) card.classList.add(c);
  }

  // Écart auto = OnPrem − D365. Convention : D365 en excès -> "+N", sinon "N".
  // Retourne null si l'un des deux n'est pas un entier (laisse la main à la saisie manuelle).
  function autoGap(onPremStr, d365Str) {
    var a = String(onPremStr == null ? "" : onPremStr).replace(/\s/g, "");
    var b = String(d365Str == null ? "" : d365Str).replace(/\s/g, "");
    if (a === "" || b === "" || !/^-?\d+$/.test(a) || !/^-?\d+$/.test(b)) return null;
    var diff = Number(a) - Number(b);
    if (diff > 0) return String(diff);
    if (diff === 0) return "0";
    return "+" + Math.abs(diff);
  }

  // D365 = OnPrem − Écart (inverse). Convention : écart "+N" => D365 = OnPrem + N.
  // Retourne null si OnPrem ou écart non exploitable (laisse la main à la saisie manuelle).
  function computeD365(onPremStr, gapStr) {
    var a = String(onPremStr == null ? "" : onPremStr).replace(/\s/g, "");
    var g = String(gapStr == null ? "" : gapStr).replace(/\s/g, "");
    if (a === "" || g === "" || !/^-?\d+$/.test(a)) return null;
    if (/^\+\d+$/.test(g)) return Number(a) + Number(g.slice(1));  // D365 en excès
    if (/^-?\d+$/.test(g)) return Number(a) - Number(g);          // D365 = OnPrem − écart
    return null;
  }

  // % importés = D365 / OnPrem × 100 (arrondi). null si non calculable.
  function computePct(onPremStr, d365Str) {
    var a = String(onPremStr == null ? "" : onPremStr).replace(/\s/g, "");
    var b = String(d365Str == null ? "" : d365Str).replace(/\s/g, "");
    if (!/^\d+$/.test(a) || Number(a) === 0 || !/^-?\d+$/.test(b)) return null;
    return Math.round((Number(b) / Number(a)) * 100);
  }
  function pctDisplay(onPremStr, d365Str) {
    var p = computePct(onPremStr, d365Str);
    return p === null ? "—" : p + "%";
  }

  /* ---------- Rendu des panneaux ---------- */
  function renderWorkflow() {
    var host = $("panel-workflow");
    host.innerHTML = "";
    (data.workflow || []).forEach(function (w, i) {
      if (!inPhase(w)) return;
      var isMilestone = w.type === "milestone";
      var card = document.createElement("div");
      card.className = "ed-card" + (isMilestone ? " is-milestone" : "");
      var sliderHTML = isMilestone || typeof w.progress !== "number" ? "" :
        '<div class="ed-slider"><input type="range" min="0" max="100" value="' + w.progress + '" data-i="' + i + '" class="wf-prog">' +
        '<span class="val">' + w.progress + '%</span></div>';

      card.innerHTML =
        '<div class="ed-row">' +
          '<span class="ord">' + (isMilestone ? "🚩" : String(w.order).padStart(2, "0")) + "</span>" +
          '<span class="nm">' + (isMilestone ? '<span class="ms-tag">JALON</span> ' : "") + w.name +
            (isMilestone ? " <small>jalon — pas de %</small>" : "") + "</span>" +
          selectHTML(STATUS_SETS.workflow, w.status, "wf-status") +
          sliderHTML +
        "</div>" +
        '<div class="ed-field-label">Description / contexte</div>' +
        '<input class="ed-comment-input wf-comment" data-i="' + i + '" value="' + escAttr(w.comment) + '" placeholder="Description / contexte">' +
        '<div class="ed-field-label">✎ Suivi d\'avancement (visible client)</div>' +
        '<input class="ed-comment-input ed-note wf-note" value="' + escAttr(w.note) + '" placeholder="Ton commentaire d\'avancement...">';

      if (!isMilestone) paintCard(card, w.status, w.progress);
      card.querySelector(".wf-status").addEventListener("change", function (e) {
        data.workflow[i].status = e.target.value;
        if (!isMilestone) paintCard(card, e.target.value, data.workflow[i].progress);
      });
      var slider = card.querySelector(".wf-prog");
      if (slider) {
        slider.addEventListener("input", function (e) {
          var v = Number(e.target.value);
          data.workflow[i].progress = v;
          e.target.nextElementSibling.textContent = v + "%";
          paintCard(card, data.workflow[i].status, v);
        });
      }
      card.querySelector(".wf-comment").addEventListener("input", function (e) { data.workflow[i].comment = e.target.value; });
      card.querySelector(".wf-note").addEventListener("input", function (e) { data.workflow[i].note = e.target.value; });
      host.appendChild(card);
    });
  }

  function renderSolutions() {
    var host = $("panel-solutions");
    host.innerHTML = "";
    if (editPhase !== 1) {
      host.innerHTML = '<div class="ed-section-title">Les solutions ne concernent que la Phase 1 (MEP week-end).</div>';
      return;
    }
    (data.solutions || []).forEach(function (s, i) {
      var card = document.createElement("div");
      card.className = "ed-card";
      card.innerHTML =
        '<div class="ed-row">' +
          '<span class="ord">' + s.order + "</span>" +
          '<span class="nm">' + s.name + "</span>" +
          selectHTML(STATUS_SETS.solutions, s.status, "sol-status") +
        "</div>" +
        '<div class="ed-field-label">Description / contexte</div>' +
        '<input class="ed-comment-input sol-comment" value="' + escAttr(s.comment) + '" placeholder="Description / contexte">' +
        '<div class="ed-field-label">✎ Suivi d\'avancement (visible client)</div>' +
        '<input class="ed-comment-input ed-note sol-note" value="' + escAttr(s.note) + '" placeholder="Ton commentaire d\'avancement...">';
      paintCard(card, s.status);
      card.querySelector(".sol-status").addEventListener("change", function (e) {
        data.solutions[i].status = e.target.value;
        paintCard(card, e.target.value);
      });
      card.querySelector(".sol-comment").addEventListener("input", function (e) { data.solutions[i].comment = e.target.value; });
      card.querySelector(".sol-note").addEventListener("input", function (e) { data.solutions[i].note = e.target.value; });
      host.appendChild(card);
    });
  }

  function renderTables() {
    var host = $("panel-tables");
    host.innerHTML = "";
    // Regroupé par famille pour la lisibilité (familles de la phase courante).
    var fams = [];
    (data.tables || []).forEach(function (t) { if (inPhase(t) && fams.indexOf(t.family) === -1) fams.push(t.family); });
    if (!fams.length) {
      host.innerHTML = '<div class="ed-section-title">Aucune table pour cette phase.</div>';
      return;
    }

    fams.forEach(function (fam) {
      var title = document.createElement("div");
      title.className = "ed-section-title";
      title.textContent = fam;
      host.appendChild(title);

      data.tables.forEach(function (t, i) {
        if (t.family !== fam || !inPhase(t)) return;
        var card = document.createElement("div");
        card.className = "ed-card";
        card.innerHTML =
          '<div class="ed-row">' +
            '<span class="ord">' + String(t.order).padStart(2, "0") + "</span>" +
            '<span class="nm">' + t.name + " <small>" + (t.type || "—") + " · " + (t.ssisProject || "—") + "</small></span>" +
            selectHTML(STATUS_SETS.tables, t.status, "tb-status") +
          "</div>" +
          '<div class="ed-counts">' +
            '<label>OnPrem <input class="tb-onprem" inputmode="numeric" value="' + escAttr(t.onPremCount) + '"></label>' +
            '<label>D365 <input class="tb-d365" inputmode="numeric" value="' + escAttr(t.d365Count) + '"></label>' +
            '<label>Écart <input class="tb-gap gap-in" value="' + escAttr(t.gap) + '" placeholder="—"></label>' +
            '<button type="button" class="tb-calc" title="Calculer l\'écart = OnPrem − D365">= auto</button>' +
            '<span class="tb-pct-box">% importés <b class="tb-pct">' + pctDisplay(t.onPremCount, t.d365Count) + "</b></span>" +
          "</div>" +
          '<div class="ed-field-label">Description / contexte</div>' +
          '<input class="ed-comment-input tb-comment" value="' + escAttr(t.comment) + '" placeholder="Description / contexte">' +
          '<div class="ed-field-label">✎ Suivi d\'avancement (visible client)</div>' +
          '<input class="ed-comment-input ed-note tb-note" value="' + escAttr(t.note) + '" placeholder="Ton commentaire d\'avancement...">';
        paintCard(card, t.status);
        card.querySelector(".tb-status").addEventListener("change", function (e) {
          data.tables[i].status = e.target.value;
          paintCard(card, e.target.value);
        });
        // Met à jour l'affichage du % importés.
        var updatePct = function () {
          card.querySelector(".tb-pct").textContent = pctDisplay(data.tables[i].onPremCount, data.tables[i].d365Count);
        };
        // Recalcule D365 = OnPrem − Écart et met à jour le champ D365.
        var syncD365 = function () {
          var d = computeD365(data.tables[i].onPremCount, data.tables[i].gap);
          if (d !== null) {
            data.tables[i].d365Count = String(d);
            card.querySelector(".tb-d365").value = String(d);
          }
          updatePct();
        };
        card.querySelector(".tb-onprem").addEventListener("input", function (e) {
          data.tables[i].onPremCount = e.target.value.trim();
          var g = String(data.tables[i].gap || "").replace(/\s/g, "");
          if (g !== "" && g !== "0") syncD365();  // ne pas forcer D365=OnPrem si écart par défaut (0)
          updatePct();
        });
        card.querySelector(".tb-d365").addEventListener("input", function (e) {
          data.tables[i].d365Count = e.target.value.trim();
          updatePct();
        });
        card.querySelector(".tb-gap").addEventListener("input", function (e) {
          data.tables[i].gap = e.target.value.trim();
          syncD365();  // quand tu saisis l'écart, D365 se calcule (OnPrem − écart)
        });
        card.querySelector(".tb-calc").addEventListener("click", function () {
          var g = autoGap(data.tables[i].onPremCount, data.tables[i].d365Count);
          if (g === null) { alert("Renseigne OnPrem et D365 (nombres entiers) pour calculer l'écart."); return; }
          data.tables[i].gap = g;
          card.querySelector(".tb-gap").value = g;
        });
        card.querySelector(".tb-comment").addEventListener("input", function (e) { data.tables[i].comment = e.target.value; });
        card.querySelector(".tb-note").addEventListener("input", function (e) { data.tables[i].note = e.target.value; });
        host.appendChild(card);
      });
    });
  }

  function renderAutomations() {
    var host = $("panel-automations");
    host.innerHTML = "";
    (data.automations || []).forEach(function (a, i) {
      if (!inPhase(a)) return;
      var card = document.createElement("div");
      card.className = "ed-card";
      card.innerHTML =
        '<div class="ed-row">' +
          '<span class="ord">⚡</span>' +
          '<span class="nm">' + a.name + " <small>" + (a.executionMoment || "") + "</small></span>" +
          selectHTML(STATUS_SETS.automations, a.status, "au-status") +
        "</div>" +
        '<div class="ed-field-label">Description / contexte</div>' +
        '<input class="ed-comment-input au-comment" value="' + escAttr(a.comment) + '" placeholder="Description / contexte">' +
        '<div class="ed-field-label">✎ Suivi d\'avancement (visible client)</div>' +
        '<input class="ed-comment-input ed-note au-note" value="' + escAttr(a.note) + '" placeholder="Ton commentaire d\'avancement...">';
      paintCard(card, a.status);
      card.querySelector(".au-status").addEventListener("change", function (e) {
        data.automations[i].status = e.target.value;
        paintCard(card, e.target.value);
      });
      card.querySelector(".au-comment").addEventListener("input", function (e) { data.automations[i].comment = e.target.value; });
      card.querySelector(".au-note").addEventListener("input", function (e) { data.automations[i].note = e.target.value; });
      host.appendChild(card);
    });
  }

  function escAttr(v) {
    return String(v == null ? "" : v).replace(/"/g, "&quot;");
  }

  // --- Date/heure : conversion pour le champ datetime-local (YYYY-MM-DDTHH:MM) ---
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function nowLocal() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function toInputDatetime(s) {
    if (!s) return nowLocal();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + "T00:00";  // ancienne valeur date seule
    return String(s).replace(" ", "T").slice(0, 16);
  }

  function renderAll() {
    renderWorkflow();
    renderSolutions();
    renderTables();
    renderAutomations();
    $("lastUpdate").value = toInputDatetime(data.project && data.project.lastUpdate);
    setStatus("Chargé : " + (data.workflow || []).length + " étapes, " +
      (data.tables || []).length + " tables, " + (data.automations || []).length + " automatismes.");
  }

  /* ---------- Chargement ---------- */
  function loadData(obj) {
    data = obj;
    if (!data.project) data.project = {};
    renderAll();
  }

  $("fileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { loadData(JSON.parse(reader.result)); }
      catch (err) { alert("JSON invalide : " + err.message); }
    };
    reader.readAsText(file, "utf-8");
  });

  $("loadDefault").addEventListener("click", function () {
    fetch("data.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(loadData)
      .catch(function (err) { alert("Impossible de charger data.json depuis le serveur.\n" + err.message +
        "\n\nAstuce : utilisez « Charger data.json » pour ouvrir le fichier manuellement."); });
  });

  // Reporte la date de dernière MAJ saisie dans l'objet data.
  function applyMeta() {
    if ($("lastUpdate").value) data.project.lastUpdate = $("lastUpdate").value;
  }

  /* ---------- Sauvegarde directe dans data.json (via serve.py) ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function saveToDisk(silent) {
    if (!data) { if (!silent) alert("Chargez d'abord un data.json."); return; }
    // La date de derniere MAJ = moment de la sauvegarde (auto).
    $("lastUpdate").value = nowLocal();
    applyMeta();
    setStatus("Enregistrement…");
    fetch("/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data, null, 2)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          var d = new Date();
          setStatus("✓ Enregistré dans data.json à " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()));
          $("publishBtn").style.display = "inline-block";
          refreshPubStatus();
        } else {
          setStatus("⚠ Échec de l'enregistrement");
          if (!silent) alert("Échec : " + (res.j && res.j.error ? res.j.error : "réponse serveur invalide"));
        }
      })
      .catch(function () {
        setStatus("⚠ Serveur d'enregistrement introuvable");
        if (!silent) alert("Sauvegarde impossible : le serveur local n'est pas lancé.\n\n" +
          "Lance-le depuis le dossier Dashboard :\n    python serve.py\n\n" +
          "Puis ouvre http://localhost:8080/editor.html\n\n" +
          "(Sinon, utilise « ⚡ Générer le JSON » pour un enregistrement manuel.)");
      });
  }

  /* ---------- Auto-save (option) ---------- */
  var autoSaveTimer = null;
  function scheduleAutoSave() {
    if (!data || !$("autoSave").checked) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () { saveToDisk(true); }, 800);
  }
  document.addEventListener("input", scheduleAutoSave);
  document.addEventListener("change", scheduleAutoSave);

  $("saveDisk").addEventListener("click", function () { saveToDisk(false); });

  /* ---------- Publier sur GitHub (git add + commit + push via serve.py) ---------- */
  function publish() {
    var btn = $("publishBtn");
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = "⏳ Publication…";
    setStatus("Publication sur GitHub en cours…");
    fetch("/publish", { method: "POST" })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok && res.j.nothing) {
          setStatus("ℹ " + res.j.message);
          refreshPubStatus();
        } else if (res.ok && res.j.ok) {
          setStatus("✓ Publié sur GitHub ! Le client verra la MAJ dans ~1 min.");
          refreshPubStatus();
        } else {
          setStatus("⚠ Échec de la publication");
          alert("Échec de la publication :\n\n" + (res.j.error || "erreur inconnue") +
            (res.j.detail ? "\n\n" + res.j.detail : ""));
        }
      })
      .catch(function () {
        setStatus("⚠ Publication impossible");
        alert("Publication impossible : le serveur local (serve.py) ne répond pas.\n" +
          "Lance l'éditeur via editeur.bat, puis réessaie.");
      })
      .then(function () { btn.disabled = false; btn.textContent = oldText; });
  }
  $("publishBtn").addEventListener("click", publish);

  $("nowBtn").addEventListener("click", function () {
    $("lastUpdate").value = nowLocal();
    if (data) data.project.lastUpdate = $("lastUpdate").value;
    scheduleAutoSave();
  });

  /* ---------- Indicateur de derniere publication ---------- */
  function renderPubStatus(info) {
    var box = $("pubStatus");
    var dot = '<span class="dot"></span>';
    if (!info || !info.sha) {
      box.className = "pub-indicator warn";
      box.innerHTML = dot + "État de publication indisponible (serveur serve.py non lancé ?)";
      return;
    }
    var idDate = '<span class="sha">' + info.sha + "</span> " +
      '<span class="muted">' + (info.date || "") + "</span>";
    if (info.dirty) {
      box.className = "pub-indicator dirty";
      box.innerHTML = dot + "⚠ Modifications locales non publiées · dernière publication : " + idDate;
    } else if (info.pushed) {
      box.className = "pub-indicator ok";
      box.innerHTML = dot + "✓ À jour avec GitHub · dernière publication : " + idDate;
    } else {
      box.className = "pub-indicator warn";
      box.innerHTML = dot + "⚠ Commit local non poussé : " + idDate;
    }
  }
  function refreshPubStatus() {
    fetch("/status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(renderPubStatus)
      .catch(function () { renderPubStatus(null); });
  }
  refreshPubStatus();

  /* ---------- Génération (repli manuel) ---------- */
  function generate() {
    if (!data) { alert("Chargez d'abord un data.json."); return; }
    applyMeta();
    var json = JSON.stringify(data, null, 2);
    $("outputText").value = json;
    $("output").classList.add("show");
    $("outputText").scrollTop = 0;
  }

  $("generate").addEventListener("click", generate);
  $("closeOut").addEventListener("click", function () { $("output").classList.remove("show"); });

  $("copyBtn").addEventListener("click", function () {
    var ta = $("outputText");
    ta.select();
    navigator.clipboard.writeText(ta.value).then(function () {
      $("copyBtn").textContent = "✓ Copié !";
      setTimeout(function () { $("copyBtn").textContent = "📋 Copier"; }, 1500);
    }, function () { document.execCommand("copy"); });
  });

  $("downloadBtn").addEventListener("click", function () {
    var blob = new Blob([$("outputText").value], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "data.json";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  });

  /* ---------- Sélecteur de phase ---------- */
  document.querySelectorAll(".ed-phase-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var p = Number(btn.dataset.edphase) || 1;
      if (p === editPhase) return;
      editPhase = p;
      document.querySelectorAll(".ed-phase-btn").forEach(function (b) {
        b.classList.toggle("active", Number(b.dataset.edphase) === p);
      });
      if (data) renderAll();
    });
  });

  /* ---------- Onglets ---------- */
  document.querySelectorAll(".ed-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".ed-tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".ed-panel").forEach(function (p) { p.classList.remove("active"); });
      tab.classList.add("active");
      $("panel-" + tab.dataset.tab).classList.add("active");
    });
  });

  /* ---------- Auto-chargement initial ---------- */
  fetch("data.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(loadData)
    .catch(function () { setStatus("Chargez un data.json pour commencer (bouton ci-dessus)."); });
})();
