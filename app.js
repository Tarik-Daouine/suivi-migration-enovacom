/* =====================================================================
   app.js — MIGRATION ENOVACOM : PREMIER WEEK-END
   Charge data.json, calcule les KPIs, rend le runbook, le bloc Migration
   des données, les cartes d'automatismes et le panneau de détail.
   Lecture seule : aucune écriture, aucun bouton de modification.
   ===================================================================== */

(function () {
  "use strict";

  /* ---------- Libellés de statuts ---------- */
  var STATUS_LABEL = {
    a_faire: "À faire",
    en_cours: "En cours",
    termine: "Terminé",
    bloque: "Bloqué",
    migre: "Migré",
    ecart: "Écart",
    execute: "Exécuté",
    ok: "OK",
    ko: "KO"
  };

  function statusPill(status) {
    var s = status || "a_faire";
    var label = STATUS_LABEL[s] || s;
    return '<span class="status-pill st-' + s + '">' + label + "</span>";
  }

  /* ---------- Helpers ---------- */
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  // Formate une date/heure "YYYY-MM-DDTHH:MM" (ou "YYYY-MM-DD") en "DD/MM/YYYY à HH:MM".
  function fmtDateTime(s) {
    if (!s) return "—";
    s = String(s).replace(" ", "T");
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return s;
    var out = m[3] + "/" + m[2] + "/" + m[1];
    if (m[4] != null) out += " à " + m[4] + ":" + m[5];
    return out;
  }
  // Bloc "Suivi" : commentaire d'avancement saisi par Tarik, visible client.
  function noteBlock(note) {
    if (!note || !String(note).trim()) return "";
    return '<div class="suivi"><span class="suivi-tag">Suivi</span>' + esc(note) + "</div>";
  }
  // Compte numérique formaté (espaces milliers) ; "" si vide/non numérique.
  function fmtCount(v) {
    if (v == null || v === "") return "";
    var n = Number(String(v).replace(/\s/g, ""));
    if (isNaN(n)) return esc(v);
    return n.toLocaleString("fr-FR");
  }
  // Un écart est "réel" si gap non vide et différent de 0 (gère "+1", "1 368"...).
  function hasGap(t) {
    if (t.status === "ecart") return true;
    var g = t.gap;
    if (g == null || String(g).trim() === "") return false;
    var n = Number(String(g).replace(/[\s+]/g, ""));
    if (isNaN(n)) return String(g).trim() !== "0";
    return n !== 0;
  }
  function depName(workflow, ids) {
    if (!ids || !ids.length) return "Aucune (étape racine)";
    return ids.map(function (id) {
      var w = workflow.find(function (x) { return x.id === id; });
      return w ? w.name : id;
    }).join(", ");
  }

  /* ====================================================================
     CALCULS (section 11 de la spec)
     ==================================================================== */
  function computeKPIs(data) {
    var tables = data.tables || [];
    var autos = data.automations || [];
    var wf = data.workflow || [];
    var checks = data.checks || [];

    var totalTables = tables.length;
    var migratedTables = tables.filter(function (t) { return t.status === "migre"; }).length;
    var gapTables = tables.filter(hasGap).length;

    var totalAutomations = autos.length;
    var executedAutomations = autos.filter(function (a) { return a.status === "execute"; }).length;

    // workflowProgress : moyenne des progress, hors milestone si progress vide/null.
    var wfSteps = wf.filter(function (w) {
      if (w.type === "milestone" && (w.progress == null || w.progress === "")) return false;
      return typeof w.progress === "number";
    });
    var workflowProgress = wfSteps.length
      ? Math.round(wfSteps.reduce(function (s, w) { return s + w.progress; }, 0) / wfSteps.length)
      : null;

    // Progression des tables : % de tables "migre" sur le total.
    var tablesProgress = totalTables ? Math.round((migratedTables / totalTables) * 100) : null;

    // globalProgress : moyenne simple entre workflowProgress et tablesProgress.
    var parts = [];
    if (workflowProgress != null) parts.push(workflowProgress);
    if (tablesProgress != null) parts.push(tablesProgress);
    var globalProgress = parts.length
      ? Math.round(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length)
      : null;

    // Points bloquants ouverts : workflow bloqué + automatismes bloqués + checks KO.
    var blockers =
      wf.filter(function (w) { return w.status === "bloque"; }).length +
      autos.filter(function (a) { return a.status === "bloque"; }).length +
      checks.filter(function (c) { return c.status === "ko"; }).length;

    return {
      totalTables: totalTables,
      migratedTables: migratedTables,
      gapTables: gapTables,
      totalAutomations: totalAutomations,
      executedAutomations: executedAutomations,
      globalProgress: globalProgress,
      blockers: blockers
    };
  }

  // État global du runbook à partir des statuts du workflow.
  function globalRunbookState(wf) {
    var steps = wf.filter(function (w) { return w.type !== "milestone"; });
    if (!steps.length) return "a_faire";
    if (steps.some(function (w) { return w.status === "bloque"; })) return "bloque";
    if (steps.every(function (w) { return w.status === "termine"; })) return "termine";
    if (steps.some(function (w) { return w.status === "en_cours" || w.status === "termine"; })) return "en_cours";
    return "a_faire";
  }

  /* ====================================================================
     RENDU
     ==================================================================== */
  function renderHeader(data) {
    var p = data.project || {};
    if (p.title) document.getElementById("projectTitle").textContent = p.title;
    document.getElementById("envBadge").textContent = p.environment || "Production";
    document.getElementById("lastUpdate").textContent = fmtDateTime(p.lastUpdate);
    document.getElementById("footerProject").textContent =
      (p.client || "Enovacom") + " — " + (p.environment || "Production");

    var state = globalRunbookState(data.workflow || []);
    var pill = document.getElementById("globalState");
    pill.textContent = STATUS_LABEL[state] || state;
    pill.className = "status-pill status-pill-lg st-" + state;
  }

  function renderKPIs(kpi) {
    var band = document.getElementById("kpiBand");
    var prog = kpi.globalProgress == null ? "—" : kpi.globalProgress + "<small>%</small>";
    var progBar = kpi.globalProgress == null ? 0 : kpi.globalProgress;

    var cards = [
      { cls: "kpi-progress", label: "Progression globale", value: prog,
        extra: '<div class="progress-track"><div class="progress-fill" style="width:' + progBar + '%"></div></div>' },
      { label: "Tables au total", value: kpi.totalTables },
      { cls: "good", label: "Tables migrées", value: kpi.migratedTables, sub: "sur " + kpi.totalTables },
      { cls: "warn", label: "Tables avec écart", value: kpi.gapTables },
      { cls: "accent", label: "Automatismes exécutés", value: kpi.executedAutomations + '<small> / ' + kpi.totalAutomations + "</small>" },
      { cls: kpi.blockers ? "warn" : "", label: "Points bloquants ouverts", value: kpi.blockers }
    ];

    band.innerHTML = "";
    cards.forEach(function (c) {
      band.appendChild(el(
        '<div class="kpi-card ' + (c.cls || "") + '">' +
          '<div class="kpi-label">' + c.label + "</div>" +
          '<div class="kpi-value">' + c.value + "</div>" +
          (c.sub ? '<div class="kpi-sub">' + c.sub + "</div>" : "") +
          (c.extra || "") +
        "</div>"
      ));
    });
  }

  function renderSolutionsBlock(solutions, label) {
    var items = solutions.map(function (s) {
      return '<li>' +
        '<div class="ord-main">' +
          '<span class="ord-num">' + s.order + "</span>" +
          '<span class="ord-name">' + esc(s.name) + "</span>" +
          (s.comment ? '<span class="ord-comment">' + esc(s.comment) + "</span>" : "") +
          statusPill(s.status) +
        "</div>" +
        noteBlock(s.note) +
      "</li>";
    }).join("");

    return el(
      '<details class="subblock">' +
        '<summary class="subblock-toggle"><span class="chev">▶</span>' + esc(label) +
          '<span class="count-chip">' + solutions.length + ' éléments</span></summary>' +
        '<div class="subblock-body"><ol class="ordered-list">' + items + "</ol></div>" +
      "</details>"
    );
  }

  function autoCardHTML(a) {
    return '<div class="auto-card">' +
      '<span class="auto-type">' + esc(a.type || "Power Automate") + "</span>" +
      "<h4>" + esc(a.name) + "</h4>" +
      (a.executionMoment ? '<p class="auto-moment"><b>Moment :</b> ' + esc(a.executionMoment) + "</p>" : "") +
      '<div class="auto-foot">' + statusPill(a.status) + "</div>" +
      (a.comment ? '<p class="auto-comment">' + esc(a.comment) + "</p>" : "") +
      noteBlock(a.note) +
    "</div>";
  }

  // Bloc Migration des données : familles dans l'ordre d'apparition, tables triées
  // par ordre opérationnel global, cartes d'automatismes insérées dans leur famille.
  function renderDataBlock(data) {
    var tables = (data.tables || []).slice().sort(function (a, b) { return a.order - b.order; });
    var autos = data.automations || [];

    // Familles dans l'ordre de première apparition.
    var famOrder = [];
    tables.forEach(function (t) {
      var f = t.family || "Autres";
      if (famOrder.indexOf(f) === -1) famOrder.push(f);
    });

    var wrap = el('<div class="data-block"></div>');

    // Barre d'outils + filtre écarts.
    var toolbar = el(
      '<div class="data-toolbar">' +
        '<div class="legend">' +
          '<span>OnPrem = volume source · D365 = volume cible · Écart = différence</span>' +
        "</div>" +
        '<label class="filter-toggle"><input type="checkbox" id="gapFilter"> Afficher uniquement les écarts</label>' +
      "</div>"
    );
    wrap.appendChild(toolbar);

    famOrder.forEach(function (fam) {
      var famTables = tables.filter(function (t) { return (t.family || "Autres") === fam; });
      var famGaps = famTables.filter(hasGap).length;
      var famAutos = autos.filter(function (a) { return a.relatedFamily === fam; });

      var rows = famTables.map(function (t) {
        var gap = hasGap(t);
        var gapDisp = (t.gap == null || String(t.gap).trim() === "")
          ? '<span class="muted">—</span>'
          : '<span class="' + (gap ? "gap-pos" : "gap-zero") + '">' + esc(t.gap) + "</span>";
        var typeCls = t.type === "custom" ? "custom" : (t.type === "à confirmer" ? "confirm" : "");
        return '<tr class="' + (gap ? "row-gap" : "") + '" data-order="' + t.order + '">' +
          '<td class="t-order">' + String(t.order).padStart(2, "0") + "</td>" +
          '<td class="t-name">' + esc(t.name) +
            (t.note && String(t.note).trim() ? '<div class="t-note"><span class="suivi-tag">Suivi</span>' + esc(t.note) + "</div>" : "") +
          "</td>" +
          '<td><span class="type-tag ' + typeCls + '">' + esc(t.type || "—") + "</span></td>" +
          '<td class="num">' + (fmtCount(t.onPremCount) || '<span class="muted">—</span>') + "</td>" +
          '<td class="num">' + (fmtCount(t.d365Count) || '<span class="muted">—</span>') + "</td>" +
          '<td class="num gap">' + gapDisp + "</td>" +
          "<td>" + statusPill(t.status) + "</td>" +
        "</tr>";
      }).join("");

      var autosBlock = "";
      if (famAutos.length) {
        autosBlock =
          '<div class="family-autos">' +
            '<div class="family-autos-label">⚡ Automatismes liés à cette étape</div>' +
            famAutos.map(autoCardHTML).join("") +
          "</div>";
      }

      var family = el(
        '<details class="family" data-family="' + esc(fam) + '">' +
          '<summary class="family-head">' +
            '<span class="chev">▶</span>' +
            '<span class="fam-name">' + esc(fam) + "</span>" +
            '<span class="fam-stats">' +
              '<span class="fam-chip">' + famTables.length + (famTables.length > 1 ? " tables" : " table") + "</span>" +
              (famGaps ? '<span class="fam-chip gap">' + famGaps + " écart" + (famGaps > 1 ? "s" : "") + "</span>" : "") +
            "</span>" +
          "</summary>" +
          '<div class="family-body">' +
            '<div class="tbl-wrap"><table class="tbl">' +
              "<thead><tr>" +
                "<th>#</th><th>Table</th><th>Type</th>" +
                '<th class="num">OnPrem</th><th class="num">D365</th><th class="num">Écart</th><th>Statut</th>' +
              "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
            autosBlock +
          "</div>" +
        "</details>"
      );
      wrap.appendChild(family);
    });

    return wrap;
  }

  function renderTimeline(data) {
    var tl = document.getElementById("timeline");
    var wf = (data.workflow || []).slice().sort(function (a, b) { return a.order - b.order; });
    tl.innerHTML = "";

    wf.forEach(function (step) {
      if (step.type === "milestone") {
        tl.appendChild(el(
          '<li class="tl-milestone">' +
            '<div class="milestone-banner">' +
              '<div class="milestone-flag">🚩</div>' +
              '<div class="milestone-text"><h3>' + esc(step.name) + "</h3>" +
                "<p>" + esc(step.comment || "Jalon majeur de la mise en production.") + "</p>" +
                (step.note && String(step.note).trim() ? '<p class="milestone-note">✎ ' + esc(step.note) + "</p>" : "") +
              "</div>" +
              '<div class="milestone-status">' + statusPill(step.status) + "</div>" +
            "</div>" +
          "</li>"
        ));
        return;
      }

      var isConseq = step.type === "consequence";
      var progressHTML = "";
      if (typeof step.progress === "number") {
        progressHTML =
          '<div class="tl-progress">' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + step.progress + '%"></div></div>' +
            '<span class="progress-num">' + step.progress + "%</span>" +
          "</div>";
      }

      var li = el(
        '<li class="tl-step ' + (isConseq ? "is-consequence" : "") + '" data-status="' + step.status + '" id="' + step.id + '">' +
          '<div class="tl-node">' + String(step.order).padStart(2, "0") + "</div>" +
          '<div class="tl-card">' +
            '<div class="tl-card-head">' +
              "<div>" +
                (isConseq ? '<span class="tl-consequence-tag">Conséquence automatique</span>' : "") +
                '<h3 class="tl-name">' + esc(step.name) + "</h3>" +
              "</div>" +
              statusPill(step.status) +
            "</div>" +
            (step.comment ? '<p class="tl-comment">' + esc(step.comment) + "</p>" : "") +
            '<p class="tl-dep"><strong>Dépend de :</strong> ' + esc(depName(wf, step.dependsOn)) + "</p>" +
            noteBlock(step.note) +
            progressHTML +
          "</div>" +
        "</li>"
      );

      // Sous-bloc Solutions (export / import).
      if (step.hasSolutions && (data.solutions || []).length) {
        var label = step.id === "wf-08"
          ? "Solutions à importer en Production (ordre)"
          : "Solutions à exporter depuis la Sandbox (ordre)";
        li.querySelector(".tl-card").appendChild(renderSolutionsBlock(data.solutions, label));
      }

      // Bloc Migration des données dépliable.
      if (step.hasTables) {
        li.querySelector(".tl-card").appendChild(renderDataBlock(data));
      }

      tl.appendChild(li);
    });
  }

  function renderAutomationSummary(data) {
    var grid = document.getElementById("automationSummary");
    grid.innerHTML = "";
    (data.automations || []).forEach(function (a) {
      grid.appendChild(el(autoCardHTML(a)));
    });
  }

  /* ====================================================================
     PANNEAU DÉTAIL (4.6) — lecture seule
     ==================================================================== */
  var panel, overlay;
  function openDetail(t) {
    var gap = hasGap(t);
    var rows = [
      ["Ordre opérationnel", String(t.order).padStart(2, "0")],
      ["Famille", t.family || "—"],
      ["Type", t.type || "—"],
      ["Volume OnPrem", fmtCount(t.onPremCount) || "—"],
      ["Volume D365", fmtCount(t.d365Count) || "—"],
      ["Écart", (t.gap == null || String(t.gap).trim() === "") ? "—" : t.gap]
    ];

    var html = '<dl>';
    rows.forEach(function (r) {
      html += '<div class="detail-row"><dt>' + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>";
    });
    html += '<div class="detail-row"><dt>Statut</dt><dd>' + statusPill(t.status) + "</dd></div></dl>";

    if (gap) {
      html += '<div class="detail-gap-box">⚠ Écart détecté : ' + esc(t.gap) +
              " enregistrement(s) de différence entre OnPrem et D365.</div>";
    }

    html += '<div class="detail-section-title">Suivi d\'avancement</div>';
    html += '<div class="detail-comment detail-suivi">' + (t.note && String(t.note).trim() ? esc(t.note) : "Pas encore de commentaire de suivi.") + "</div>";

    html += '<div class="detail-section-title">Description / contexte</div>';
    html += '<div class="detail-comment">' + (t.comment ? esc(t.comment) : "Aucune description.") + "</div>";
    html += '<p class="detail-readonly-note">Vue en lecture seule. Les données sont mises à jour par l\'équipe migration.</p>';

    document.getElementById("detailTitle").textContent = t.name;
    document.getElementById("detailBody").innerHTML = html;

    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add("show");
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
    });
  }
  function closeDetail() {
    overlay.classList.remove("show");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    setTimeout(function () { overlay.hidden = true; }, 260);
  }

  /* ====================================================================
     INTERACTIONS
     ==================================================================== */
  function wireInteractions(data) {
    panel = document.getElementById("detailPanel");
    overlay = document.getElementById("detailOverlay");
    document.getElementById("detailClose").addEventListener("click", closeDetail);
    overlay.addEventListener("click", closeDetail);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

    var byOrder = {};
    (data.tables || []).forEach(function (t) { byOrder[t.order] = t; });

    // Clic sur une ligne de table -> panneau détail.
    document.getElementById("timeline").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-order]");
      if (tr) {
        var t = byOrder[Number(tr.dataset.order)];
        if (t) openDetail(t);
        return;
      }
      // Filtre écarts.
      if (e.target && e.target.id === "gapFilter") return; // handled by change
    });

    // Filtre "uniquement les écarts".
    document.getElementById("timeline").addEventListener("change", function (e) {
      if (e.target && e.target.id === "gapFilter") {
        var on = e.target.checked;
        document.querySelectorAll(".tbl tbody tr[data-order]").forEach(function (tr) {
          var isGap = tr.classList.contains("row-gap");
          tr.style.display = (on && !isGap) ? "none" : "";
        });
        // Ouvre toutes les familles ayant un écart quand le filtre est actif.
        if (on) {
          document.querySelectorAll(".family").forEach(function (f) {
            if (f.querySelector("tr.row-gap")) f.open = true;
          });
        }
      }
    });
  }

  /* ====================================================================
     INIT
     ==================================================================== */
  function init(data) {
    renderHeader(data);
    renderKPIs(computeKPIs(data));
    renderTimeline(data);
    renderAutomationSummary(data);
    wireInteractions(data);
  }

  fetch("data.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(init)
    .catch(function (err) {
      console.error("Erreur de chargement data.json :", err);
      document.getElementById("loadError").hidden = false;
    });
})();
