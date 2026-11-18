(function () {
  "use strict";
  const A = window.ATLAS;
  const S = A.STATUS;
  const SC = { U: "#d89b12", X: "#c2453a", D: "#1f8a73", C: "#8b97a1" };
  const PEOPLE_ORDER = ["Hannah", "Julie", "Tracy", "Jack", "Matt", "Subcommittee", "Dei"];

  // ---------- Index the tree ----------
  const byId = new Map();
  (function index(n, parent, depth, branch) {
    n.parent = parent; n.depth = depth;
    n.branch = depth === 1 ? n : branch;
    if (depth >= 2) {
      if (!n.s && parent && parent.s) n.s = parent.s;
      n.eo = n.o && n.o.length ? n.o : (parent && parent.eo) || [];
    } else n.eo = [];
    byId.set(n.id, n);
    (n.kids || []).forEach((k) => index(k, n, depth + 1, depth === 1 ? n : branch));
  })(A.tree, null, 0, null);
  const branches = A.tree.kids;
  const items = []; byId.forEach((n) => { if (n.depth === 2) items.push(n); });

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (k) => { const p = A.PEOPLE[k]; if (!p) return k.slice(0, 2); if (k === "Subcommittee") return "SC"; if (k === "Dei") return "DS"; return p.name.split(" ").map((w) => w[0]).join("").slice(0, 2); };
  const avColor = { Hannah: "#4F5D9A", Julie: "#9A4A2E", Tracy: "#2E8B6E", Jack: "#7A5C12", Matt: "#0E7C86", Subcommittee: "#5b6b78", Dei: "#002C4A" };
  const av = (k, cls) => `<span class="av ${cls || ""}" style="background:${avColor[k] || "#002C4A"}" aria-hidden="true">${esc(initials(k))}</span>`;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const fathom = (t) => `${A.FATHOM}?timestamp=${t}`;
  const firstName = (k) => (A.PEOPLE[k] ? (k === "Subcommittee" ? "Subcommittee" : A.PEOPLE[k].name.split(" ")[0]) : k);

  // ---------- Tabs ----------
  const tabs = document.querySelectorAll(".tab");
  function showView(v) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === v)));
    document.querySelectorAll(".view").forEach((s) => s.classList.toggle("is-active", s.dataset.view === v));
    if (v === "map") requestAnimationFrame(() => { if (!fitted) fit(false); });
    if (v === "flow") drawFlow();
  }
  tabs.forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const arr = [...tabs]; const i = arr.indexOf(document.activeElement);
    if (i < 0) return; const j = (i + (e.key === "ArrowRight" ? 1 : -1) + arr.length) % arr.length;
    arr[j].focus(); showView(arr[j].dataset.view);
  });

  // ---------- Filters state ----------
  const state = { q: "", status: new Set(), person: null, sel: null };
  const expanded = new Set(branches.map((b) => b.id));

  // Stats strip
  const counts = { U: 0, X: 0, D: 0, C: 0 };
  items.forEach((n) => counts[n.s]++);
  const statsEl = document.getElementById("stats");
  statsEl.innerHTML =
    ["U", "X", "D", "C"].map((k) => `<button class="stat" data-s="${k}" data-testid="stat-${k}"><span class="sw" style="background:${SC[k]}"></span><span class="n">${counts[k]}</span><span class="l">${S[k].label}</span></button>`).join("") +
    `<div class="stat static"><span class="sw" style="background:var(--navy)"></span><span class="n">${branches.length}</span><span class="l">Topics</span></div>` +
    `<div class="stat static"><span class="sw" style="background:var(--gold)"></span><span class="n">Mar 2027</span><span class="l">Report release</span></div>`;
  statsEl.querySelectorAll("button.stat").forEach((b) => b.addEventListener("click", () => { state.status = new Set([b.dataset.s]); syncChips(); apply(true); }));

  // Status chips
  const statusChips = document.getElementById("statusChips");
  statusChips.innerHTML = ["U", "X", "D", "C"].map((k) => `<button class="chip" aria-pressed="false" data-s="${k}" data-testid="chip-status-${k}"><span class="dot" style="background:${SC[k]}"></span>${S[k].label}<span class="ct">${counts[k]}</span></button>`).join("");
  statusChips.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    const k = c.dataset.s; state.status.has(k) ? state.status.delete(k) : state.status.add(k); syncChips(); apply(true);
  }));
  // Person chips
  const personCount = {}; items.forEach((n) => n.eo.forEach((p) => (personCount[p] = (personCount[p] || 0) + 1)));
  const personChips = document.getElementById("personChips");
  personChips.innerHTML = PEOPLE_ORDER.filter((k) => personCount[k]).map((k) => `<button class="chip" aria-pressed="false" data-p="${k}" title="${esc(A.PEOPLE[k].role)}" data-testid="chip-person-${k}">${av(k)}${esc(firstName(k))}<span class="ct">${personCount[k]}</span></button>`).join("");
  personChips.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    state.person = state.person === c.dataset.p ? null : c.dataset.p; syncChips(); apply(true);
  }));
  function syncChips() {
    statusChips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(state.status.has(c.dataset.s))));
    personChips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(state.person === c.dataset.p)));
  }
  let qt;
  document.getElementById("q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(true); }, 120); });

  function matches(n) {
    if (n.depth < 2) return false;
    if (state.status.size && !state.status.has(n.s)) return false;
    if (state.person && !n.eo.includes(state.person)) return false;
    if (state.q) {
      const hay = [n.label, n.what, n.why, n.next, n.due, n.eo.map((k) => A.PEOPLE[k] ? A.PEOPLE[k].name : k).join(" "), n.branch.label].join(" ").toLowerCase();
      if (!hay.includes(state.q)) return false;
    }
    return true;
  }
  const filtering = () => state.q || state.status.size || state.person;

  // ---------- Map ----------
  const svg = d3.select("#mapSvg");
  const gRoot = svg.append("g");
  const gLinks = gRoot.append("g");
  const gNodes = gRoot.append("g");
  const zoom = d3.zoom().scaleExtent([0.15, 2.5]).on("zoom", (e) => gRoot.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  const canvasEl = document.getElementById("canvas");
  canvasEl.insertAdjacentHTML("beforeend",
    `<div class="legend-float" aria-hidden="true">${["U", "X", "D", "C"].map((k) => `<span><i style="background:${SC[k]}"></i>${S[k].label}</span>`).join("")}</div>
     <div class="zoom-ctl"><button class="btn" id="zin" aria-label="Zoom in" data-testid="button-zoom-in">+</button><button class="btn" id="zout" aria-label="Zoom out" data-testid="button-zoom-out">&minus;</button></div>`);
  document.getElementById("zin").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.3);
  document.getElementById("zout").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.3);

  const ctx = document.createElement("canvas").getContext("2d");
  const FONTS = { 1: "800 16px 'Cabinet Grotesk'", 2: "600 13.5px Satoshi", 3: "500 12.5px Satoshi" };
  function tw(text, depth) { ctx.font = FONTS[depth]; return ctx.measureText(text).width; }
  const PAD = { 1: 18, 2: 14, 3: 10 };
  const RH = { 1: 50, 2: 38, 3: 28 };
  const GAP = { 1: 30, 2: 8, 3: 2 };
  const ROOT_W = 300, ROOT_H = 92;

  function visKids(n) { return n.kids && expanded.has(n.id) ? n.kids : []; }
  let layoutNodes = [], layoutLinks = [];
  const pos = new Map();

  function computeLayout() {
    layoutNodes = []; layoutLinks = [];
    const sides = [{ list: branches.slice(0, 5), dir: 1 }, { list: branches.slice(5), dir: -1 }];
    pos.set("root", { x: 0, y: 0, w: ROOT_W, h: ROOT_H, dir: 0 });
    layoutNodes.push(A.tree);
    sides.forEach(({ list, dir }) => {
      // widths per depth column
      const colW = { 1: 0, 2: 0, 3: 0 };
      const walkW = (n) => { n._w = Math.ceil(tw(n.label, n.depth) + PAD[n.depth] * 2 + (n.depth === 2 ? 14 : n.depth === 3 ? 12 : 0)); colW[n.depth] = Math.max(colW[n.depth], n._w); visKids(n).forEach(walkW); };
      list.forEach(walkW);
      const X = { 1: ROOT_W / 2 + 70 };
      X[2] = X[1] + colW[1] + 56; X[3] = X[2] + colW[2] + 44;
      // heights
      const H = (n) => { const ks = visKids(n); const own = RH[n.depth]; if (!ks.length) return own; const sum = ks.reduce((a, k) => a + H(k), 0) + GAP[n.depth + 1] * (ks.length - 1); return Math.max(own, sum); };
      const total = list.reduce((a, b) => a + H(b), 0) + GAP[1] * (list.length - 1);
      let y = -total / 2;
      const place = (n, y0) => {
        const h = H(n); const ks = visKids(n);
        let cy = y0;
        ks.forEach((k) => { const kh = H(k); place(k, cy); cy += kh + GAP[n.depth + 1]; });
        pos.set(n.id, { x: dir * X[n.depth], y: y0 + h / 2, w: n._w, h: RH[n.depth] - (n.depth === 1 ? 6 : n.depth === 2 ? 6 : 4), dir });
        layoutNodes.push(n);
        ks.forEach((k) => layoutLinks.push({ s: n, t: k }));
      };
      list.forEach((b) => { place(b, y); layoutLinks.push({ s: A.tree, t: b }); y += H(b) + GAP[1]; });
    });
  }

  function edge(n, outer) {
    const p = pos.get(n.id);
    if (n.depth === 0) return null;
    return outer ? p.x + p.dir * p.w : p.x;
  }
  function linkPath(l) {
    const tp = pos.get(l.t.id), sp = pos.get(l.s.id);
    const x1 = l.s.depth === 0 ? tp.dir * (ROOT_W / 2) : edge(l.s, true);
    const y1 = sp.y; const x2 = tp.x; const y2 = tp.y;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  }

  let fitted = false;
  function render(animate) {
    computeLayout();
    const dur = animate ? 380 : 0;
    const t = svg.transition().duration(dur).ease(d3.easeCubicOut);

    const L = gLinks.selectAll("path.link").data(layoutLinks, (d) => d.t.id);
    L.exit().transition(t).style("opacity", 0).remove();
    L.enter().append("path").attr("class", "link").attr("stroke", (d) => d.t.branch.color)
      .attr("stroke-width", (d) => (d.t.depth === 1 ? 3 : d.t.depth === 2 ? 2 : 1.4))
      .attr("d", (d) => { const sp = pos.get(d.s.id); const x = d.s.depth === 0 ? 0 : edge(d.s, true); return `M${x},${sp.y} L${x},${sp.y}`; })
      .style("opacity", 0)
      .merge(L).transition(t).style("opacity", null).attr("d", linkPath);

    const N = gNodes.selectAll("g.node").data(layoutNodes, (d) => d.id);
    N.exit().transition(t).style("opacity", 0).remove();
    const NE = N.enter().append("g")
      .attr("class", (d) => "node " + (d.depth === 0 ? "root" : d.depth === 1 ? "branch" : d.depth === 2 ? "item" : "leaf"))
      .attr("data-id", (d) => d.id).attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (d) => d.label + (d.s ? ", " + S[d.s].label : ""))
      .attr("transform", (d) => { const p = d.parent ? pos.get(d.parent.id) : pos.get(d.id); const x = d.parent && d.parent.depth ? edge(d.parent, true) : 0; return `translate(${x},${p.y})`; })
      .style("opacity", 0)
      .on("click", (e, d) => onNodeClick(d))
      .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNodeClick(d); } })
      .on("mouseenter", (e, d) => hoverPath(d, true)).on("mouseleave", (e, d) => hoverPath(d, false));
    NE.each(function (d) { drawNode(d3.select(this), d); });
    const NM = NE.merge(N);
    NM.each(function (d) { updateBadge(d3.select(this), d); });
    NM.transition(t).style("opacity", null).attr("transform", (d) => { const p = pos.get(d.id); return `translate(${p.x},${p.y})`; });
    applyDim();
    if (!fitted) { fit(false); }
  }

  function drawNode(g, d) {
    const p = pos.get(d.id);
    if (d.depth === 0) {
      g.append("rect").attr("class", "bg").attr("x", -ROOT_W / 2).attr("y", -ROOT_H / 2).attr("width", ROOT_W).attr("height", ROOT_H).attr("rx", 20).attr("fill", "#002C4A").attr("stroke", "#7fbfa4").attr("stroke-width", 3);
      g.append("image").attr("href", "assets/tdg-mark.webp").attr("x", -ROOT_W / 2 + 18).attr("y", -19).attr("width", 50).attr("height", 38);
      g.append("text").attr("class", "t").attr("x", -ROOT_W / 2 + 80).attr("y", -6).text("KCPEC Play Equity");
      g.append("text").attr("class", "t").attr("x", -ROOT_W / 2 + 80).attr("y", 17).text("Report");
      g.append("text").attr("class", "s").attr("x", -ROOT_W / 2 + 80).attr("y", 36).text("Print PDF + Interactive PDF + Website");
      return;
    }
    const x0 = p.dir > 0 ? 0 : -p.w, h = p.h;
    const c = d.branch.color;
    if (d.depth === 1) {
      g.append("rect").attr("class", "bg").attr("x", x0).attr("y", -h / 2).attr("width", p.w).attr("height", h).attr("rx", 12).attr("fill", c).attr("stroke", c);
      g.append("text").attr("x", x0 + PAD[1]).attr("y", 1).attr("dominant-baseline", "central").text(d.label);
    } else if (d.depth === 2) {
      g.append("rect").attr("class", "bg").attr("x", x0).attr("y", -h / 2).attr("width", p.w).attr("height", h).attr("rx", 9).attr("fill", "#fff").attr("stroke", d3.color(c).copy({ opacity: 0.45 })).attr("stroke-width", 1.2);
      g.append("rect").attr("x", x0).attr("y", -h / 2).attr("width", 5).attr("height", h).attr("rx", 2).attr("fill", c).attr("clip-path", null);
      g.append("circle").attr("cx", x0 + PAD[2] + 2).attr("cy", 0).attr("r", 4.5).attr("fill", SC[d.s] || "#ccc");
      g.append("text").attr("x", x0 + PAD[2] + 13).attr("y", 1).attr("dominant-baseline", "central").text(d.label);
    } else {
      g.append("rect").attr("class", "bg").attr("x", x0).attr("y", -h / 2).attr("width", p.w).attr("height", h).attr("rx", 7).attr("fill", "#fbf9f4").attr("stroke", "#e3ddcf");
      g.append("circle").attr("cx", x0 + PAD[3] + 1).attr("cy", 0).attr("r", 3.5).attr("fill", SC[d.s] || "#ccc");
      g.append("text").attr("x", x0 + PAD[3] + 11).attr("y", 1).attr("dominant-baseline", "central").text(d.label);
    }
  }
  function updateBadge(g, d) {
    g.select(".badge").remove();
    if (d.depth === 0 || !d.kids || !d.kids.length) return;
    const p = pos.get(d.id);
    const open = expanded.has(d.id);
    const bx = p.dir * (p.w + 2);
    const b = g.append("g").attr("class", "badge").attr("transform", `translate(${bx},0)`);
    b.append("circle").attr("r", open ? 6 : 10).attr("fill", open ? "#fff" : d.branch.color).attr("stroke", open ? d.branch.color : "#fff").attr("stroke-width", open ? 2 : 1.5);
    if (!open) b.append("text").text(d.kids.length);
  }

  function hoverPath(d, on) {
    const ids = new Set(); let n = d; while (n) { ids.add(n.id); n = n.parent; }
    gLinks.selectAll("path.link").attr("stroke-opacity", (l) => (on && ids.has(l.t.id) ? 1 : null)).attr("stroke-width", (l) => (on && ids.has(l.t.id) ? (l.t.depth === 1 ? 4 : 3) : l.t.depth === 1 ? 3 : l.t.depth === 2 ? 2 : 1.4));
  }

  function applyDim() {
    const f = filtering();
    const keep = new Set();
    if (f) byId.forEach((n) => { if (matches(n)) { let a = n; while (a) { keep.add(a.id); a = a.parent; } } });
    gNodes.selectAll("g.node").classed("dim", (d) => f && !keep.has(d.id)).classed("hit", (d) => f && matches(d)).classed("sel", (d) => state.sel === d.id);
    gLinks.selectAll("path.link").classed("dim", (l) => f && !keep.has(l.t.id));
  }

  function apply(fromFilter) {
    if (filtering() && fromFilter) {
      byId.forEach((n) => { if (matches(n)) { let a = n.parent; while (a) { expanded.add(a.id); a = a.parent; } } });
    }
    render(true);
    renderBoard();
  }

  function fit(animate) {
    const r = canvasEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    layoutNodes.forEach((n) => { const p = pos.get(n.id); const a = n.depth === 0 ? -ROOT_W / 2 : p.dir > 0 ? p.x : p.x - p.w; const b = n.depth === 0 ? ROOT_W / 2 : p.dir > 0 ? p.x + p.w + 14 : p.x - 14; x0 = Math.min(x0, a, b); x1 = Math.max(x1, a, b); y0 = Math.min(y0, p.y - 26); y1 = Math.max(y1, p.y + 26); });
    const pad = 30;
    const k = Math.min(1.1, (r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0));
    const tx = r.width / 2 - k * (x0 + x1) / 2, ty = r.height / 2 - k * (y0 + y1) / 2;
    const tr = d3.zoomIdentity.translate(tx, ty).scale(k);
    (animate ? svg.transition().duration(450) : svg).call(zoom.transform, tr);
    fitted = true;
  }
  function panTo(n) {
    const p = pos.get(n.id); if (!p) return;
    const r = canvasEl.getBoundingClientRect();
    const tr = d3.zoomTransform(svg.node());
    const cx = n.depth === 0 ? 0 : p.x + p.dir * p.w / 2;
    const sx = tr.applyX(cx), sy = tr.applyY(p.y);
    const m = 60;
    if (sx > m && sx < r.width - m && sy > m && sy < r.height - m) return;
    const k = Math.max(tr.k, 0.7);
    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(r.width / 2 - k * cx, r.height / 2 - k * p.y).scale(k));
  }

  function onNodeClick(d) {
    if (d.kids && d.kids.length && d.depth > 0) {
      if (!expanded.has(d.id)) expanded.add(d.id);
      else if (state.sel === d.id) expanded.delete(d.id);
    }
    select(d.id, false);
    render(true);
  }

  document.getElementById("expandAll").onclick = () => { byId.forEach((n) => { if (n.kids && n.depth > 0) expanded.add(n.id); }); render(true); setTimeout(() => fit(true), 400); };
  document.getElementById("collapseAll").onclick = () => { expanded.clear(); render(true); setTimeout(() => fit(true), 400); };
  document.getElementById("fit").onclick = () => fit(true);
  document.getElementById("startTour").onclick = () => { state.status = new Set(["U"]); syncChips(); apply(true); const first = items.find((n) => n.s === "U"); if (first) select(first.id, true); };

  // ---------- Drawer ----------
  const drawer = document.getElementById("drawer");
  const dBody = document.getElementById("drawerBody");
  const dEmpty = document.getElementById("drawerEmpty");
  function select(id, pan) {
    const n = byId.get(id); if (!n) return;
    state.sel = id;
    let a = n.parent; while (a) { if (a.depth > 0) expanded.add(a.id); a = a.parent; }
    dEmpty.hidden = true; dBody.hidden = false;
    dBody.innerHTML = drawerHTML(n);
    drawer.classList.add("open");
    drawer.scrollTop = 0;
    dBody.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { select(b.dataset.go, true); render(true); }));
    const cl = dBody.querySelector(".close-d"); if (cl) cl.onclick = () => { drawer.classList.remove("open"); };
    applyDim();
    if (pan) setTimeout(() => panTo(n), 420);
  }
  function drawerHTML(n) {
    const crumbs = []; let a = n.parent; while (a) { crumbs.unshift(a); a = a.parent; }
    let h = `<button class="btn close-d" aria-label="Close details">Close</button>`;
    h += `<nav class="crumbs" aria-label="Breadcrumb">${crumbs.map((c) => `<button data-go="${c.id}">${esc(c.depth === 0 ? "Project" : c.label)}</button><span aria-hidden="true">›</span>`).join("")}</nav>`;
    h += `<h3>${esc(n.depth === 0 ? "KCPEC Play Equity Report" : n.label)}</h3>`;
    if (n.depth >= 2) {
      h += `<div class="meta"><span class="pill s-${n.s}"><span class="dot"></span>${S[n.s].label}</span>${n.due ? `<span class="due">Due: ${esc(n.due)}</span>` : ""}<span class="due" style="background:${n.branch.color};color:#fff">${esc(n.branch.label)}</span></div>`;
    }
    if (n.depth === 0) {
      h += `<div class="sec"><p>${esc(A.tree.sub)}. One designed report in two formats, connected to a living website that holds the deeper data, maps, stories and sub-reports. Built by The Data Guys™ with the UW Center for Leadership in Athletics for the King County Play Equity Coalition.</p></div>`;
    }
    if (n.what) h += `<div class="sec"><h4>What it is</h4><p>${esc(n.what)}</p></div>`;
    if (n.why) h += `<div class="sec"><h4>Why it matters</h4><p>${esc(n.why)}</p></div>`;
    if (n.next) h += `<div class="sec next ${n.s || ""}"><h4>Next step</h4><p>${esc(n.next)}</p></div>`;
    if (n.ts) h += `<a class="listen" href="${fathom(n.ts)}" target="_blank" rel="noopener" data-testid="link-fathom"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#7fbfa4"/><path d="M10 8l6 4-6 4z" fill="#002C4A"/></svg><div><b>Hear it in the recording</b><span>Nov 13 check-in at ${mmss(n.ts)}</span></div></a>`;
    const owners = n.o && n.o.length ? n.o : n.depth === 3 ? n.eo : [];
    if (owners.length) h += `<div class="sec"><h4>${owners.length > 1 ? "People" : "Person"}</h4><div class="people">${owners.map((k) => `<div class="person">${av(k)}<div><b>${esc(A.PEOPLE[k] ? A.PEOPLE[k].name : k)}</b><span>${esc(A.PEOPLE[k] ? A.PEOPLE[k].role : "")}</span></div></div>`).join("")}</div></div>`;
    if (n.depth === 1) {
      const c = { U: 0, X: 0, D: 0, C: 0 }; n.kids.forEach((k) => c[k.s]++);
      h += `<div class="meta">${["U", "X", "D", "C"].filter((k) => c[k]).map((k) => `<span class="pill s-${k}"><span class="dot"></span>${c[k]} ${S[k].short}</span>`).join("")}</div>`;
    }
    if (n.kids && n.kids.length) {
      h += `<div class="sec"><h4>${n.depth === 0 ? "Topics" : "Inside this"}</h4><ul class="subs">${n.kids.map((k) => `<li><button data-go="${k.id}"><span class="dot" style="background:${k.depth === 1 ? k.color : SC[k.s]}"></span>${esc(k.label)}</button></li>`).join("")}</ul></div>`;
    }
    if (n.parent) {
      const sib = n.parent.kids; const i = sib.indexOf(n);
      const pv = sib[i - 1], nx = sib[i + 1];
      h += `<div class="pn">${pv ? `<button class="btn" data-go="${pv.id}">‹ Previous</button>` : ""}${nx ? `<button class="btn" data-go="${nx.id}">Next ›</button>` : ""}</div>`;
    }
    return h;
  }

  // ---------- Board ----------
  const board = document.getElementById("board");
  const listPeople = document.getElementById("listPeople");
  let boardPerson = null;
  listPeople.innerHTML = `<button class="chip" aria-pressed="true" data-p="" data-testid="list-person-all">Everyone</button>` + PEOPLE_ORDER.filter((k) => personCount[k]).map((k) => `<button class="chip" aria-pressed="false" data-p="${k}" data-testid="list-person-${k}">${av(k)}${esc(firstName(k))}</button>`).join("");
  listPeople.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { boardPerson = c.dataset.p || null; listPeople.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); renderBoard(); }));

  function renderBoard() {
    const cols = [
      { k: "U", title: "Needed from UW", groupBy: true },
      { k: "X", title: "Decisions we make together", groupBy: false },
      { k: "D", title: "The Data Guys delivers", groupBy: false },
    ];
    board.innerHTML = cols.map((col) => {
      const list = items.filter((n) => n.s === col.k && (!boardPerson || n.eo.includes(boardPerson)));
      let body = "";
      if (col.groupBy) {
        const groups = new Map();
        list.forEach((n) => { const key = n.eo.filter((p) => p !== "Dei").sort((a, b) => PEOPLE_ORDER.indexOf(a) - PEOPLE_ORDER.indexOf(b)).join("+") || "UW team"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(n); });
        body = [...groups.entries()].map(([key, arr]) => `<div class="grp"><h5>${key.split("+").map((k) => (A.PEOPLE[k] ? av(k) : "")).join("")}${esc(key.split("+").map(firstName).join(" + "))}</h5>${arr.map(card).join("")}</div>`).join("");
      } else body = list.map(card).join("");
      if (!list.length) body = `<p class="lede" style="padding:8px">Nothing here for this person.</p>`;
      return `<section class="col"><header class="col-h"><span class="sw" style="background:${SC[col.k]}"></span><h3>${col.title}</h3><span class="ct">${list.length}</span></header><div class="col-b">${body}</div></section>`;
    }).join("");
    board.querySelectorAll(".card").forEach((c) => c.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      showView("map"); select(c.dataset.id, true); render(true);
    }));
  }
  function card(n) {
    return `<div class="card" role="button" tabindex="0" data-id="${n.id}" data-testid="card-${n.id}">
      <p class="ttl"><span>${esc(n.label)}</span></p>
      <div class="row"><span class="tag" style="background:${n.branch.color}">${esc(n.branch.label)}</span>${n.due ? `<span class="dd">${esc(n.due)}</span>` : ""}${n.ts ? `<a class="dd" href="${fathom(n.ts)}" target="_blank" rel="noopener">▶ ${mmss(n.ts)}</a>` : ""}</div>
      ${n.next ? `<p class="nx">${esc(n.next)}</p>` : ""}
      <div class="row" style="margin-top:8px">${n.eo.map((k) => av(k)).join("")}</div>
    </div>`;
  }
  board.addEventListener("keydown", (e) => { const c = e.target.closest(".card"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); c.click(); } });

  // ---------- Timeline ----------
  document.getElementById("timeline").innerHTML = A.TIMELINE.map((t) => `<li class="tl ${t.phase}"><span class="pt" aria-hidden="true"></span><div class="d">${esc(t.date)}</div><div class="lb">${esc(t.label)}</div>${t.phase === "now" ? `<span class="nw">Today</span>` : ""}${t.proposed ? `<span class="pr">Proposed</span>` : ""}</li>`).join("");
  const PHASES = [
    { t: "Kickoff and concept", w: "Sep 23 to Nov 13", c: "#7fbfa4", li: ["Intro call Oct 6", "Concept site, sample PDFs and Draft MOU Oct 19", "Subcommittee approves Option B, $13,500"] },
    { t: "Lock the foundation", w: "Nov to Dec", c: "#d89b12", li: ["Hosting choice and Tracy capacity check", "Suppression threshold: 5, 10 or 30", "Report structure and site map", "MOU with benchmarks signed"] },
    { t: "Handoff and build", w: "Jan to Feb 2027", c: "#1F6F8B", li: ["Final text, chart keys, data files and codebook", "Photos and video from the point person", "Build in rounds, 15 to 20 meeting hours total"] },
    { t: "Release and launch", w: "Mar to Apr 2027", c: "#002C4A", li: ["Report release in March", "Community launch late March or early April", "Site keeps growing after launch"] },
  ];
  document.getElementById("phaseCards").innerHTML = PHASES.map((p) => `<article class="ph" style="border-top-color:${p.c}"><h3>${p.t}</h3><p class="when">${p.w}</p><ul>${p.li.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></article>`).join("");

  // ---------- Flow ----------
  let flowDrawn = false;
  function drawFlow() {
    if (flowDrawn) return; flowDrawn = true;
    const F = A.FLOW; const W = 1100, rowH = 64;
    const cols = [{ arr: F.inputs, x: 30, w: 290, title: "What UW provides", c: "#d89b12" }, { arr: F.work, x: 410, w: 280, title: "What The Data Guys builds", c: "#1f8a73" }, { arr: F.outputs, x: 780, w: 290, title: "What people see", c: "#002C4A" }];
    const H = Math.max(...cols.map((c) => c.arr.length)) * rowH + 90;
    const s = d3.select("#flowSvg").attr("viewBox", `0 0 ${W} ${H}`);
    const P = {};
    cols.forEach((c) => {
      const off = 70 + (H - 90 - c.arr.length * rowH) / 2;
      s.append("text").attr("x", c.x).attr("y", 38).attr("font-family", "Cabinet Grotesk").attr("font-weight", 800).attr("font-size", 17).attr("fill", "#002C4A").text(c.title);
      s.append("rect").attr("x", c.x).attr("y", 48).attr("width", 40).attr("height", 4).attr("rx", 2).attr("fill", c.c);
      c.arr.forEach((n, i) => { P[n.id] = { x: c.x, y: off + i * rowH, w: c.w, c: c.c, n }; });
    });
    const lg = s.append("g");
    const links = lg.selectAll("path").data(F.links).enter().append("path").attr("class", "fl").attr("d", ([a, b]) => { const A1 = P[a], B1 = P[b]; const x1 = A1.x + A1.w, y1 = A1.y + 24, x2 = B1.x, y2 = B1.y + 24, m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; });
    const ng = s.append("g").selectAll("g").data(Object.values(P)).enter().append("g").attr("class", "fn").attr("tabindex", 0).attr("transform", (p) => `translate(${p.x},${p.y})`);
    ng.append("rect").attr("width", (p) => p.w).attr("height", 48).attr("rx", 11).attr("fill", (p) => (p.c === "#002C4A" ? "#002C4A" : "#fff")).attr("stroke", (p) => p.c).attr("stroke-width", 1.5);
    ng.append("rect").attr("width", 5).attr("height", 48).attr("rx", 2).attr("fill", (p) => p.c);
    ng.append("text").attr("x", 16).attr("y", (p) => (p.n.owner ? 20 : 29)).attr("font-size", 14).attr("font-weight", 700).attr("fill", (p) => (p.c === "#002C4A" ? "#fff" : "#13283a")).text((p) => p.n.label);
    ng.filter((p) => p.n.owner).append("text").attr("x", 16).attr("y", 37).attr("font-size", 12).attr("fill", "#5b6b78").text((p) => "From " + p.n.owner);
    function trace(id) {
      if (!id) { links.classed("on", false).classed("off", false); ng.classed("off", false); return; }
      const on = new Set([id]); const L = new Set();
      let frontier = [id];
      while (frontier.length) { const nf = []; F.links.forEach((l, i) => { if (frontier.includes(l[0]) && !L.has(i)) { L.add(i); on.add(l[1]); nf.push(l[1]); } }); frontier = nf; }
      frontier = [id];
      while (frontier.length) { const nf = []; F.links.forEach((l, i) => { if (frontier.includes(l[1]) && !L.has(i)) { L.add(i); on.add(l[0]); nf.push(l[0]); } }); frontier = nf; }
      links.classed("on", (d, i) => L.has(i)).classed("off", (d, i) => !L.has(i));
      ng.classed("off", (p) => !on.has(p.n.id));
    }
    let locked = null;
    ng.on("mouseenter", (e, p) => { if (!locked) trace(p.n.id); }).on("mouseleave", () => { if (!locked) trace(null); })
      .on("click", (e, p) => { locked = locked === p.n.id ? null : p.n.id; trace(locked); })
      .on("focus", (e, p) => trace(p.n.id)).on("blur", () => { if (!locked) trace(null); });
  }

  // ---------- Init ----------
  window.addEventListener("resize", () => { if (document.querySelector(".view-map.is-active")) fit(false); });
  const go = () => { render(false); renderBoard(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
})();
