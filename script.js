/* =========================================================
   Simulador de Crédito Personal · núcleo financiero
   ---------------------------------------------------------
   Modelo: amortización constante (pago a capital fijo).
   - Interés ordinario mensual = saldo insoluto * (tasa anual / 12)
   - IVA (16%) aplicado sobre el interés ordinario.
   - Pago a capital fijo = total a financiar / plazo.
   - Pago fijo mensual = pago a capital + interés ordinario (sin IVA).
   - Comisión por apertura (opcional) con IVA, se suma al capital.
   - Prepagos: abonos extra a capital que reducen el saldo insoluto
     y pueden liquidar el crédito antes del plazo.
   ========================================================= */

(() => {
  "use strict";

  const IVA = 0.16;

  // ---- utilidades de formato ----
  const $ = (sel) => document.querySelector(sel);
  const fmtMXN = new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const fmtNum = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n) => `${n.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  // ---- referencias DOM ----
  const form        = $("#credit-form");
  const nombreEl    = $("#nombre");
  const montoEl     = $("#monto");
  const montoRange  = $("#monto-range");
  const tasaEl      = $("#tasa");
  const tasaRange   = $("#tasa-range");
  const plazoEl     = $("#plazo");
  const segBtns     = document.querySelectorAll(".seg");
  const comToggle   = $("#comision-toggle");
  const comRow      = $("#comision-row");
  const comEl       = $("#comision");
  const results     = $("#results");
  const tbody       = $("#tabla-amortizacion tbody");

  let chart = null;
  // estado vigente: permite recalcular al editar prepagos sin reenviar el formulario
  const state = { monto: 0, tasaAnual: 0, plazo: 0, comisionPct: 0, prepagos: {} };

  // =========================================================
  //  Lógica financiera pura (testeable)
  // =========================================================
  function calcularAmortizacion({ monto, tasaAnual, plazo, comisionPct = 0, prepagos = {} }) {
    const comisionConIva = monto * (comisionPct / 100) * (1 + IVA);
    const totalFinanciar = monto + comisionConIva;

    const pagoCapitalBase = totalFinanciar / plazo;
    const tasaMensual = (tasaAnual / 100) / 12;

    let saldo = totalFinanciar;
    const filas = [];
    let totIntereses = 0, totIva = 0, totPagado = 0, totPrepago = 0;

    for (let mes = 1; mes <= plazo && saldo > 0.005; mes++) {
      const interes = saldo * tasaMensual;
      const ivaInteres = interes * IVA;

      // capital programado de este mes (no puede exceder el saldo)
      const capitalProgramado = Math.min(pagoCapitalBase, saldo);
      // prepago capturado por el usuario para este mes
      const prepagoSolicitado = Math.max(0, prepagos[mes] || 0);
      const prepago = Math.min(prepagoSolicitado, saldo - capitalProgramado < 0 ? 0 : saldo - capitalProgramado);

      const capitalTotal = capitalProgramado + prepago;
      const pagoFijo = capitalProgramado + interes;          // capital + interés (sin IVA)
      const pagoMensual = capitalTotal + interes + ivaInteres;

      filas.push({
        mes,
        saldoInicial: saldo,
        pagoCapital: capitalProgramado,
        interes,
        pagoFijo,
        ivaInteres,
        prepago,
        pagoMensual,
      });

      totIntereses += interes;
      totIva += ivaInteres;
      totPagado += pagoMensual;
      totPrepago += prepago;
      saldo -= capitalTotal;
    }

    const plazoReal = filas.length;
    const pagoPorMil = (pagoCapitalBase + totalFinanciar * tasaMensual) / (totalFinanciar / 1000); // pago del 1er mes por cada $1,000
    const catAnual = aproximarCAT(totalFinanciar, filas.map(f => f.pagoMensual));

    return {
      filas,
      totalFinanciar,
      comisionConIva,
      pagoCapitalBase,
      totIntereses,
      totIva,
      totPagado,
      totPrepago,
      pagoPromedio: totPagado / plazoReal,
      pagoPrimero: filas[0].pagoMensual,
      pagoUltimo: filas[filas.length - 1].pagoMensual,
      plazoReal,
      pagoPorMil,
      catAnual,
    };
  }

  // TIR por bisección sobre los flujos mensuales -> CAT aproximado.
  function aproximarCAT(principal, pagos) {
    if (!pagos.length) return 0;
    const f = (i) => {
      let vp = 0;
      for (let k = 0; k < pagos.length; k++) vp += pagos[k] / Math.pow(1 + i, k + 1);
      return vp - principal;
    };
    let lo = 0, hi = 1; // 0% a 100% mensual
    if (f(lo) < 0) return 0;
    for (let n = 0; n < 80; n++) {
      const mid = (lo + hi) / 2;
      // f es decreciente respecto a i: si VP > principal, la tasa debe subir.
      if (f(mid) > 0) { lo = mid; } else { hi = mid; }
    }
    const iMensual = (lo + hi) / 2;
    return (Math.pow(1 + iMensual, 12) - 1) * 100;
  }

  // =========================================================
  //  Render
  // =========================================================
  function render(data) {
    const plazoOriginal = state.plazo;

    // --- ficha de datos del crédito ---
    $("#f-monto").textContent    = fmtMXN.format(state.monto);
    $("#f-comision").textContent = data.comisionConIva > 0 ? fmtMXN.format(data.comisionConIva) : "Sin comisión";
    $("#f-total").textContent    = fmtMXN.format(data.totalFinanciar);
    $("#f-plazo").textContent    = `${plazoOriginal} meses`;
    $("#f-tasa").textContent     = fmtPct(state.tasaAnual);
    $("#f-pagomil").textContent  = fmtMXN.format(data.pagoPorMil);
    $("#f-cat").textContent      = fmtPct(data.catAnual);

    const cliente = nombreEl.value.trim();
    const clienteEl = $("#r-cliente");
    if (cliente) { clienteEl.textContent = `Cotización para: ${cliente}`; clienteEl.hidden = false; }
    else { clienteEl.hidden = true; }

    // --- tarjetas resumen ---
    $("#r-pago-prom").textContent    = fmtMXN.format(data.pagoPromedio);
    $("#r-pago-primero").textContent = fmtMXN.format(data.pagoPrimero);
    $("#r-pago-ultimo").textContent  = fmtMXN.format(data.pagoUltimo);
    $("#r-total").textContent        = fmtMXN.format(data.totPagado);
    $("#r-intereses").textContent    = fmtMXN.format(data.totIntereses);
    $("#r-iva").textContent          = fmtMXN.format(data.totIva);
    $("#r-financiar").textContent    = fmtMXN.format(data.totalFinanciar);
    $("#r-cat").textContent          = fmtPct(data.catAnual);

    const liquidadoAntes = data.plazoReal < plazoOriginal;
    $("#r-plazo-badge").textContent = liquidadoAntes
      ? `${data.plazoReal} de ${plazoOriginal} meses · liquidado antes`
      : `${plazoOriginal} mensualidades`;

    // --- tabla ---
    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const f of data.filas) {
      const tr = document.createElement("tr");
      const prepagoVal = state.prepagos[f.mes] ? fmtNum.format(state.prepagos[f.mes]) : "";
      tr.innerHTML = `
        <td>${f.mes}</td>
        <td>${fmtMXN.format(f.saldoInicial)}</td>
        <td>${fmtMXN.format(f.pagoCapital)}</td>
        <td>${fmtMXN.format(f.interes)}</td>
        <td>${fmtMXN.format(f.pagoFijo)}</td>
        <td>${fmtMXN.format(f.ivaInteres)}</td>
        <td class="col-pago">${fmtMXN.format(f.pagoMensual)}</td>
        <td class="col-prepago">
          <span class="prepago-cell">
            <span class="prepago-prefix">$</span>
            <input type="number" class="prepago-input" data-mes="${f.mes}" min="0" step="100"
                   value="${state.prepagos[f.mes] || ""}" placeholder="0" aria-label="Prepago del mes ${f.mes}">
          </span>
        </td>`;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    dibujarGrafica(data);

    results.classList.remove("is-empty");
    results.classList.add("is-revealed");
    void results.offsetWidth; // reinicia animación
  }

  function dibujarGrafica(data) {
    const labels  = data.filas.map(f => f.mes);
    const saldos  = data.filas.map(f => f.saldoInicial);
    const capital = data.filas.map(f => f.pagoCapital + f.prepago);
    const interes = data.filas.map(f => f.interes + f.ivaInteres);

    const ctx = document.getElementById("grafica").getContext("2d");
    const css = getComputedStyle(document.documentElement);
    const cAccent = css.getPropertyValue("--accent-soft").trim() || "#2f5d52";
    const cCapital = css.getPropertyValue("--capital").trim() || "#16312b";
    const cInteres = css.getPropertyValue("--interes").trim() || "#c9a24b";

    if (chart) chart.destroy();

    const tooltip = {
      backgroundColor: "#1a1a1f",
      padding: 12, cornerRadius: 8, displayColors: true, boxPadding: 4,
      titleFont: { family: "Inter", weight: "600" },
      bodyFont: { family: "Inter" },
      callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMXN.format(c.parsed.y)}` },
    };

    chart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type: "line", label: "Saldo insoluto", data: saldos,
            borderColor: cAccent, backgroundColor: hexA(cAccent, .08),
            borderWidth: 2, fill: true, tension: .35,
            pointRadius: 0, pointHoverRadius: 4, yAxisID: "y", order: 0,
          },
          {
            type: "bar", label: "Capital", data: capital,
            backgroundColor: hexA(cCapital, .85), stack: "pago",
            borderRadius: 2, barPercentage: .9, categoryPercentage: .85, yAxisID: "y1", order: 2,
          },
          {
            type: "bar", label: "Interés + IVA", data: interes,
            backgroundColor: hexA(cInteres, .9), stack: "pago",
            borderRadius: 2, barPercentage: .9, categoryPercentage: .85, yAxisID: "y1", order: 1,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "Inter", size: 10 }, color: "#9a9aa4", maxRotation: 0, autoSkipPadding: 16 },
            title: { display: true, text: "Mes", color: "#9a9aa4", font: { family: "Inter", size: 10 } },
          },
          y: {
            position: "left",
            grid: { color: "#ededea" },
            ticks: { font: { family: "Inter", size: 10 }, color: "#9a9aa4", callback: (v) => compact(v) },
          },
          y1: {
            position: "right", stacked: true,
            grid: { display: false },
            ticks: { font: { family: "Inter", size: 10 }, color: "#9a9aa4", callback: (v) => compact(v) },
          },
        },
      },
    });
  }

  // helpers de formato/color
  function compact(v) {
    if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
    return `$${v}`;
  }
  function hexA(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // =========================================================
  //  Flujo principal
  // =========================================================
  function recalcular() {
    const data = calcularAmortizacion({
      monto: state.monto, tasaAnual: state.tasaAnual,
      plazo: state.plazo, comisionPct: state.comisionPct, prepagos: state.prepagos,
    });
    render(data);
  }

  function procesarSimulacion(e) {
    if (e) e.preventDefault();

    const monto = parseFloat(montoEl.value);
    const tasaAnual = parseFloat(tasaEl.value);
    const plazo = parseInt(plazoEl.value, 10);
    const comisionPct = comToggle.checked ? (parseFloat(comEl.value) || 0) : 0;

    const errMonto = isNaN(monto) || monto <= 0;
    const errTasa = isNaN(tasaAnual) || tasaAnual < 0;
    montoEl.closest(".control").classList.toggle("is-error", errMonto);
    tasaEl.closest(".control").classList.toggle("is-error", errTasa);
    if (errMonto) { montoEl.focus(); return; }
    if (errTasa) { tasaEl.focus(); return; }

    // cambiar parámetros reinicia los prepagos capturados
    state.monto = monto;
    state.tasaAnual = tasaAnual;
    state.plazo = plazo;
    state.comisionPct = comisionPct;
    state.prepagos = {};

    recalcular();
  }

  // =========================================================
  //  Wiring de la interfaz
  // =========================================================
  const clamp = (v, min, max) => Math.min(Math.max(parseFloat(v) || 0, +min), +max);
  const sync = (input, range) => {
    input.addEventListener("input", () => { range.value = clamp(input.value, range.min, range.max); });
    range.addEventListener("input", () => { input.value = range.value; });
  };
  sync(montoEl, montoRange);
  sync(tasaEl, tasaRange);

  segBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      segBtns.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      plazoEl.value = btn.dataset.plazo;
    });
  });

  comToggle.addEventListener("change", () => { comRow.hidden = !comToggle.checked; });

  form.addEventListener("submit", procesarSimulacion);

  // Prepagos: edición en vivo sobre la tabla (delegación de eventos).
  let prepagoTimer = null;
  tbody.addEventListener("input", (e) => {
    const input = e.target.closest(".prepago-input");
    if (!input) return;
    const mes = parseInt(input.dataset.mes, 10);
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) state.prepagos[mes] = val;
    else delete state.prepagos[mes];

    // recalcular con un pequeño debounce y devolver el foco a la celda editada
    clearTimeout(prepagoTimer);
    prepagoTimer = setTimeout(() => {
      recalcular();
      const again = tbody.querySelector(`.prepago-input[data-mes="${mes}"]`);
      if (again) { again.focus(); const v = again.value; again.value = ""; again.value = v; }
    }, 450);
  });

  // estado inicial
  results.classList.add("is-empty");
  tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Ajusta los parámetros y presiona “Calcular cotización”.</td></tr>`;

  // primera corrida automática
  window.addEventListener("DOMContentLoaded", procesarSimulacion);

  // exportar para pruebas (Node)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { calcularAmortizacion, IVA };
  }
})();
/* fin del módulo */
