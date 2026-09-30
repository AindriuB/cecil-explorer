/* Cecil's war: a day-by-day explorer. Data: data/explorer.json (scripts/sync_data.py). */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const DAY = 864e5;
  const toD = s => (s ? new Date(s + "T12:00:00Z") : null);
  const iso = d => d.toISOString().slice(0, 10);
  const fmtLong = d => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtShort = s => { const d = toD(s); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "date unknown"; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LAYER = {
    "personal-documented": { cls: "doc", label: "Cecil, documented", color: "#1d3f7a" },
    "unit-context": { cls: "unit", label: "Battalion", color: "#8a7a3d" },
    "testimony": { cls: "test", label: "Family memory", color: "#b36b12" },
    "inference": { cls: "inf", label: "Inference", color: "#6b5b95" },
    "family-civil": { cls: "fam", label: "Family record", color: "#5f716c" },
    "postwar": { cls: "fam", label: "After the war", color: "#5f716c" },
  };
  const COY_ORDER = ["U-2-innisks-a", "U-2-innisks-b", "U-2-innisks-c", "U-2-innisks-d", "U-2-innisks-s", "U-2-innisks-hq", "U-2-innisks-r"];
  const HQ_POST = /\b(C\.?\s?O|Comd?g|2\s?i\/?c|Second in Command|Adjt|Adjutant|I\.?\s?O|Intelligence|Q\.?\s?M|R\.?\s?M\.?\s?O|R\.?\s?S\.?\s?O|M\.?\s?T\.?\s?O|Padre|Chaplain|L\.?\s?O|Signals?|R\.?\s?S\.?\s?M)\b/i;

  let D, map, markerLayer, state = { date: "1944-11-30", range: ["1942-01-01", "1946-06-30"], win: 15, tab: "cecil" };
  const evSpan = e => {
    const lo = toD(e.start) || toD(e.end); const hi = toD(e.end) || toD(e.start);
    return lo && hi ? [lo.getTime(), hi.getTime()] : null;
  };

  // A local private build (git-ignored) takes precedence; the published site only has the public file.
  fetch("data/explorer.private.json").then(r => r.ok ? r : fetch("data/explorer.json"))
    .then(r => { if (!r.ok) throw new Error("No data found. Run: python3 scripts/sync_data.py --public"); return r.json(); })
    .then(init).catch(err => { document.querySelector(".body").innerHTML = `<p class="gapnote">${esc(err.message)}</p>`; });

  function init(data) {
    D = data;
    D.events.forEach(e => { e._span = evSpan(e); });
    D.cecilEvents = D.events.filter(e => e.layer === "personal-documented" && e._span).sort((a, b) => a._span[0] - b._span[0]);
    $("#buildnote").textContent = D.public ? "Public build: letters, the account and family memory are omitted." : "Private build: includes letters and family memory; do not publish without a decision.";
    if (D.public) { document.querySelector('[data-tab="letters"]').hidden = true; }
    const h = location.hash.slice(1); if (/^\d{4}-\d{2}-\d{2}$/.test(h)) state.date = h;
    setupMap(); setupControls(); render();
  }

  /* ---------- map ---------- */
  function setupMap() {
    map = L.map("map", { zoomControl: true, worldCopyJump: true }).setView([44.3, 11.6], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (modern map, not a wartime position)',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  function drawMap(active) {
    markerLayer.clearLayers();
    const pts = [];
    const byPlace = new Map();
    active.forEach(e => { if (!e.place || !D.places[e.place] || !D.places[e.place].ll) return; if (!byPlace.has(e.place)) byPlace.set(e.place, []); byPlace.get(e.place).push(e); });
    const rank = l => ["personal-documented", "inference", "testimony", "unit-context", "family-civil", "postwar"].indexOf(l);
    byPlace.forEach((evs, pid) => {
      const p = D.places[pid]; evs.sort((a, b) => rank(a.layer) - rank(b.layer));
      const top = LAYER[evs[0].layer] || LAYER["unit-context"]; const personal = evs[0].layer === "personal-documented";
      if (p.r) L.circle(p.ll, { radius: p.r, color: top.color, weight: 1, dashArray: personal ? null : "4 4", fillOpacity: .06 }).addTo(markerLayer);
      const m = L.circleMarker(p.ll, { radius: personal ? 9 : 6, color: "#fff", weight: 2, fillColor: top.color, fillOpacity: .95 }).addTo(markerLayer);
      m.bindPopup(`<b>${esc(p.name)}</b><br>` + evs.slice(0, 6).map(e =>
        `<div style="margin-top:6px"><span class="tag ${LAYER[e.layer]?.cls || ""}">${esc(LAYER[e.layer]?.label || e.layer)}</span> ${esc(fmtShort(e.start || e.end))}<br>${esc(e.event)}<span class="src">${esc((e.sources || []).join("; "))}</span></div>`).join("") + (evs.length > 6 ? `<div class="src">+ ${evs.length - 6} more in "All records"</div>` : ""));
      if (evs.some(e => !isLong(e)) && !(p.r > 50000)) pts.push(p.ll);
    });
    $("#mapcount").textContent = `${byPlace.size} place${byPlace.size === 1 ? "" : "s"} with records in this window`;
    if ($("#follow").checked && pts.length) {
      const b = L.latLngBounds(pts);
      map.flyToBounds(b.pad(0.4), { maxZoom: 11, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.6 });
    }
  }

  /* ---------- ribbon ---------- */
  function drawRibbon() {
    const el = $("#ribbon"); const [a, b] = state.range.map(s => toD(s).getTime());
    const w = el.clientWidth; const x = t => ((t - a) / (b - a)) * w;
    let html = "";
    // Ranges where any record exists are drawn as plain paper; the rest stays hatched (no record).
    const covered = [];
    D.events.forEach(e => { if (e._span && e._span[1] >= a && e._span[0] <= b && e._span[1] - e._span[0] < 40 * DAY) covered.push([Math.max(e._span[0] - DAY, a), Math.min(e._span[1] + DAY, b)]); });
    covered.sort((p, q) => p[0] - q[0]);
    const merged = []; covered.forEach(c => { const l = merged[merged.length - 1]; if (l && c[0] <= l[1] + 3 * DAY) l[1] = Math.max(l[1], c[1]); else merged.push([...c]); });
    merged.forEach(([s, t]) => { html += `<div class="band" style="left:${x(s)}px;width:${Math.max(2, x(t) - x(s))}px"></div>`; });
    for (let y = new Date(a).getUTCFullYear(); y <= new Date(b).getUTCFullYear() + 1; y++) {
      const t = Date.UTC(y, 0, 1); if (t < a || t > b) continue;
      html += `<div class="yline" style="left:${x(t)}px"></div><div class="year" style="left:${x(t)}px">${y}</div>`;
    }
    if (b - a < 400 * DAY) for (let t = Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth() + 1, 1); t < b; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1))
      html += `<div class="year" style="left:${x(t)}px">${new Date(t).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</div>`;
    const cls = { "personal-documented": "t-doc", "unit-context": "t-unit", "testimony": "t-test", "inference": "t-inf" };
    D.events.forEach(e => {
      if (!e._span || !cls[e.layer]) return; const [s, t] = e._span; if (t < a || s > b) return;
      if (e.layer === "personal-documented" && t - s > 2 * DAY) html += `<div class="span-doc" style="left:${x(s)}px;width:${Math.max(3, x(t) - x(s))}px"></div>`;
      else if (t - s <= 40 * DAY) html += `<div class="tick ${cls[e.layer]}" style="left:${x(s)}px"></div>`;
    });
    // Cecil's documented memberships as an underline
    D.memberships.filter(m => m.person === "P-cecil" && m.evidence === "documented").forEach(m => {
      const s = toD(m.lo)?.getTime(), t = toD(m.hi)?.getTime(); if (!s || t < a || s > b) return;
      html += `<div class="span-doc" style="top:56px;left:${x(Math.max(s, a))}px;width:${Math.max(2, x(Math.min(t, b)) - x(Math.max(s, a)))}px;opacity:.18"></div>`;
    });
    const c = toD(state.date).getTime(); if (c >= a && c <= b) html += `<div class="cursor" style="left:${x(c)}px"></div>`;
    el.innerHTML = html;
  }
  function ribbonPick(ev) {
    const el = $("#ribbon"); const r = el.getBoundingClientRect(); const [a, b] = state.range.map(s => toD(s).getTime());
    const t = a + ((ev.clientX - r.left) / r.width) * (b - a);
    setDate(iso(new Date(Math.round(t / DAY) * DAY)));
  }

  /* ---------- selection helpers ---------- */
  const tNow = () => toD(state.date).getTime();
  const activeEvents = win => { const t = tNow(), w = win * DAY; return D.events.filter(e => e._span && e._span[0] <= t + w && e._span[1] >= t - w); };
  const LONG = 40 * DAY;
  const isLong = e => e._span && e._span[1] - e._span[0] > LONG;
  const onDay = e => e._span && !isLong(e) && e._span[0] <= tNow() + DAY / 2 && e._span[1] >= tNow() - DAY / 2;
  const coversDay = e => e._span && isLong(e) && e._span[0] <= tNow() && e._span[1] >= tNow();
  const activeMs = (pred) => D.memberships.filter(m => pred(m) && m.lo && m.hi && toD(m.lo).getTime() <= tNow() && toD(m.hi).getTime() >= tNow());
  const HON = new Set(["MC", "MM", "DSO", "MBE", "OBE", "DCM", "MID", "TD"]);
  const prettyName = n => {
    if (!n || n !== n.toUpperCase() || !/^[A-Z'’-]+(\s|,)/.test(n)) return n;
    const toks = n.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const surname = toks.shift().toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/^Mc(\p{L})/u, (m, a) => "Mc" + a.toUpperCase());
    const hon = toks.filter(t => HON.has(t.replace(/\./g, "")));
    const ini = toks.filter(t => !HON.has(t.replace(/\./g, ""))).join("").replace(/[^A-Z]/g, "");
    return `${ini ? ini.split("").join(".") + ". " : ""}${surname}${hon.length ? " " + hon.join(" ") : ""}`;
  };
  const person = id => prettyName(D.people[id]?.name || id.replace(/^P-/, ""));
  const unit = id => D.units[id]?.name || D.companies[id] || id;

  /* ---------- render ---------- */
  function render() {
    const d = toD(state.date);
    $("#dateInput").value = state.date; $("#dayLong").textContent = fmtLong(d);
    history.replaceState(null, "", "#" + state.date);
    drawRibbon();
    const active = activeEvents(state.win);
    drawMap(active);
    renderCecil(); renderBn(); renderList(active); renderLetters();
  }

  function recHTML(e, jump = false) {
    const L_ = LAYER[e.layer] || { cls: "", label: e.layer };
    return `<div class="rec ${L_.cls}"><div class="when">${esc(e.date_as_written || fmtShort(e.start || e.end))}<span class="tag ${L_.cls}">${esc(L_.label)}</span>${jump ? ` <button class="jump" data-date="${esc(e.start || e.end)}">go to day</button>` : ""}</div>${esc(e.event)}<span class="src">${esc((e.sources || []).join("; "))}${e.notes ? " · " + esc(e.notes) : ""}</span></div>`;
  }

  function renderCecil() {
    const el = $("#tab-cecil"); const t = tNow();
    const ms = activeMs(m => m.person === "P-cecil");
    const specific = ms.filter(m => /innisks-[a-z]$/.test(m.unit));
    let h = `<h2>Where the records put him</h2>`;
    if (ms.length) {
      h += `<div class="status">` + ms.sort((a, b) => (/innisks-[a-z]$/.test(b.unit) ? 1 : 0) - (/innisks-[a-z]$/.test(a.unit) ? 1 : 0)).map(m =>
        `<p><span class="unitname">${esc(unit(m.unit))}</span>${m.post ? ": " + esc(m.post) : ""}${m.flag ? ` <span class="muted">(${esc(m.flag)})</span>` : ""}<span class="src">${esc(m.status || "")} · ${esc((m.sources || []).join("; "))}</span></p>`).join("") +
        (specific.length ? "" : (ms.some(m => m.unit === "U-2-innisks") ? `<p class="muted">His company is not recorded for this day.</p>` : "")) + `</div>`;
    } else h += `<div class="gapnote">No record places Cecil in a unit on this day.</div>`;

    const today = D.events.filter(e => onDay(e) && e.layer !== "unit-context" && (e.people || []).includes("P-cecil"));
    h += `<h2>On this day</h2>`;
    if (today.length) h += today.map(e => recHTML(e)).join("");
    else {
      const prev = [...D.cecilEvents].reverse().find(e => e._span[1] < t), next = D.cecilEvents.find(e => e._span[0] > t);
      h += `<div class="gapnote">Nothing names Cecil on this exact day.</div>`;
      if (prev) h += `<p class="muted">Last record before:</p>` + recHTML(prev, true);
      if (next) h += `<p class="muted">Next record after:</p>` + recHTML(next, true);
    }
    const period = D.events.filter(e => coversDay(e) && e.layer !== "unit-context" && (e.people || []).includes("P-cecil"));
    if (period.length) h += `<details class="period"><summary>${period.length} longer-period ${period.length === 1 ? "entry covers" : "entries cover"} this day (family memory and undated periods)</summary>${period.map(e => recHTML(e)).join("")}</details>`;
    if (!D.public) {
      const q = D.quotes.filter(q => q.date).map(q => ({ q, dt: Math.abs(toD(q.date).getTime() - t) })).sort((a, b) => a.dt - b.dt)[0];
      if (q && q.dt <= 30 * DAY) h += `<h2>In his words</h2>` + quoteHTML(q.q);
      const sec = D.sections.find(s => s.from <= state.date && state.date <= s.to);
      if (sec) h += `<h2>The account: ${esc(sec.title)}</h2>` + sec.paras.slice(0, 2).map(p => `<p>${esc(p.text.replace(/^> /gm, ""))}<span class="src">${esc(p.cite)}</span></p>`).join("") +
        (sec.paras.length > 2 ? `<details><summary>Read the rest of this section (${sec.paras.length - 2} more paragraphs)</summary>${sec.paras.slice(2).map(p => `<p>${esc(p.text.replace(/^> /gm, ""))}<span class="src">${esc(p.cite)}</span></p>`).join("")}</details>` : "") +
        (sec.not_known ? `<p class="gapnote"><b>Not known:</b> ${esc(sec.not_known)}</p>` : "");
    }
    el.innerHTML = h;
  }

  function quoteHTML(q) {
    return `<blockquote class="voice">${esc(q.text)}</blockquote><p class="voice-meta">${esc(q.as_written || "")} ${q.letter ? "· " + esc(q.letter) : ""} ${q.recipient ? "· to " + esc(q.recipient.split(";")[0].replace(/\(.*?\)/g, "").trim()) : ""} <button class="jump" data-date="${esc(q.date || "")}">go to day</button></p>`;
  }

  function renderBn() {
    const el = $("#tab-bn");
    const diary = D.events.filter(e => onDay(e) && e.layer === "unit-context");
    let h = `<h2>The battalion on this day</h2>`;
    h += diary.length ? diary.map(e => recHTML(e)).join("") : `<div class="gapnote">No battalion diary entry for this day in the records held.</div>`;

    // Officer structure on this day
    const bnUnits = new Set(["U-2-innisks", ...COY_ORDER]);
    const ms = activeMs(m => bnUnits.has(m.unit) && m.person);
    const nearest = (D.returns || []).map(r => ({ r, dt: Math.abs(toD(r).getTime() - tNow()) })).sort((a, b) => a.dt - b.dt)[0];
    h += `<h2>Officers of the 2nd Inniskillings</h2>`;
    if (!ms.length) { el.innerHTML = h + `<div class="gapnote">No officer roll covers this day. The rolls held run from July 1944 to June 1945.</div>`; return; }
    h += `<p class="muted">As recorded on or around this day. ${nearest ? `Nearest officer return held: week ending ${esc(fmtShort(nearest.r))}.` : ""} Company is shown only where a record names it.</p>`;
    const byPerson = new Map();
    ms.forEach(m => { const cur = byPerson.get(m.person); const spec = COY_ORDER.includes(m.unit);
      if (!cur || (spec && !COY_ORDER.includes(cur.unit)) || (spec === COY_ORDER.includes(cur.unit) && (m.lo > cur.lo))) byPerson.set(m.person, { ...m, allPosts: [...(cur?.allPosts || []), m.post].filter(Boolean) }); else cur.allPosts.push(m.post); });
    const groups = { hq: [], nocoy: [] }; COY_ORDER.forEach(u => groups[u] = []);
    byPerson.forEach(m => {
      if (COY_ORDER.includes(m.unit)) groups[m.unit].push(m);
      else if (HQ_POST.test(m.post || "") && !/\b(Coy|Pl)\b/i.test(m.post || "")) groups.hq.push(m);
      else groups.nocoy.push(m);
    });
    const rankPost = p => /C\.?\s?O\b|Comd?g/i.test(p) ? 0 : /2\s?i\/?c/i.test(p) ? 1 : /Coy\s*(Comd|Cd|Commander)/i.test(p) ? 2 : /Coy\s*2/i.test(p) ? 3 : /Pl\s*Comd/i.test(p) ? 5 : 4;
    const flagNote = f => !f || /^as at return/i.test(f) ? "" : ` <span class="flag" title="${esc(f)}">${/open-ended|shown for/i.test(f) ? "dates approximate" : esc(f)}</span>`;
    const shortPost = p => (p || "appointment not stated").replace(/\s*[\[(].*?[\])]/g, "").trim() || "appointment not stated";
    const li = m => `<li class="${m.person === "P-cecil" ? "me" : ""}" title="${esc([m.post, m.status, (m.sources || []).join("; ")].filter(Boolean).join(" · "))}"><span>${m.person === "P-cecil" ? "J.C. Bannister (Cecil)" : esc(person(m.person))}${flagNote(m.flag)}</span><span class="post">${esc(shortPost(m.post))}${m.evidence && m.evidence !== "documented" ? ` · ${esc(m.evidence)}` : ""}</span></li>`;
    const card = (title, list, cls = "", note = "") => {
      if (!list.length) return "";
      list.sort((a, b) => rankPost(a.post || "") - rankPost(b.post || ""));
      const hasMe = list.some(m => m.person === "P-cecil");
      return `<div class="coy ${cls} ${hasMe ? "has-me" : ""}"><h3>${esc(title)}<span class="n">${list.length}</span></h3>${note}<ul>${list.map(li).join("")}</ul></div>`;
    };
    h += card("Battalion headquarters", groups.hq, "wide");
    h += `<div class="coygrid">` + COY_ORDER.map(u => card(unit(u), groups[u])).join("") + `</div>`;
    h += card("Company not recorded", groups.nocoy, "wide", `<p class="src">On the return, but no record names their company for this day.</p>`);
    const rel = (D.relations || []).filter(r => (r.from === "P-cecil" || r.to === "P-cecil") && r.date && Math.abs(toD(r.date.split("/")[0]).getTime() - tNow()) < 20 * DAY);
    if (rel.length) h += `<h2>With Cecil</h2>` + rel.map(r => `<div class="rec doc"><div class="when">${esc(r.date)} · ${esc(r.type)}</div>${esc(person(r.from === "P-cecil" ? r.to : r.from))}: ${esc(r.notes || "")}<span class="src">${esc((r.sources || []).join("; "))}</span></div>`).join("");
    el.innerHTML = h;
  }

  function renderList(active) {
    const el = $("#tab-list");
    const on = state.layers || (state.layers = new Set(Object.keys(LAYER)));
    const f = Object.entries(LAYER).filter(([k]) => !(D.public && ["testimony", "family-civil", "postwar"].includes(k)))
      .map(([k, v]) => `<label><input type="checkbox" data-layer="${k}" ${on.has(k) ? "checked" : ""}> ${esc(v.label)}</label>`).join("");
    const list = active.filter(e => on.has(e.layer)).sort((a, b) => a._span[0] - b._span[0]);
    el.innerHTML = `<div class="filters">${f}</div><p class="muted">${list.length} record${list.length === 1 ? "" : "s"} within the map window.</p>` + list.map(e => recHTML(e, true)).join("");
  }

  function renderLetters() {
    if (D.public) return;
    const el = $("#tab-letters");
    const qs = [...D.quotes].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    el.innerHTML = `<p class="muted">Every quotation is checked word for word against the transcription of the letter. Private family material.</p>` + qs.map(quoteHTML).join("");
  }

  /* ---------- controls ---------- */
  function setDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return; state.date = s; render(); }
  function setupControls() {
    $("#dateInput").addEventListener("change", e => setDate(e.target.value));
    $("#ribbon").addEventListener("click", ribbonPick);
    $("#ribbon").addEventListener("keydown", e => {
      const step = e.shiftKey ? 7 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setDate(iso(new Date(tNow() + (e.key === "ArrowRight" ? step : -step) * DAY))); }
    });
    const jumpRec = dir => { const t = tNow(); const e = dir > 0 ? D.cecilEvents.find(e => e._span[0] > t + DAY / 2) : [...D.cecilEvents].reverse().find(e => e._span[0] < t - DAY / 2); if (e) setDate(e.start || e.end); };
    $("#prevRec").addEventListener("click", () => jumpRec(-1));
    $("#nextRec").addEventListener("click", () => jumpRec(1));
    document.addEventListener("keydown", e => { if (e.target.matches("input,select,textarea")) return; if (e.key === ",") jumpRec(-1); if (e.key === ".") jumpRec(1); });
    document.querySelectorAll(".zoom button").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll(".zoom button").forEach(x => x.classList.toggle("on", x === b));
      state.range = b.dataset.range.split(","); const [a, z] = state.range;
      if (state.date < a || state.date > z) state.date = a; render();
    }));
    $("#window").addEventListener("change", e => { state.win = +e.target.value; render(); });
    $("#follow").addEventListener("change", render);
    document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
      ["cecil", "bn", "list", "letters"].forEach(t => $("#tab-" + t).hidden = t !== b.dataset.tab);
      if (b.dataset.tab === "list") setTimeout(() => map.invalidateSize(), 0);
    }));
    document.body.addEventListener("click", e => { const j = e.target.closest("button.jump"); if (j && j.dataset.date) { const d = j.dataset.date.split("/")[0].replace(/[?~]/g, ""); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d); } });
    $("#tab-list").addEventListener("change", e => { const k = e.target.dataset.layer; if (!k) return; e.target.checked ? state.layers.add(k) : state.layers.delete(k); renderList(activeEvents(state.win)); });
    addEventListener("resize", () => drawRibbon());
    addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h !== state.date) setDate(h); });
  }
})();
